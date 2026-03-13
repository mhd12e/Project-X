import { Injectable, Logger, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { ChildProcess, spawn } from 'child_process';
import * as fs from 'fs';
import * as path from 'path';

const TOKEN_FILE = '/app/uploads/.config/claude-oauth-token';
const SESSION_TIMEOUT = 5 * 60_000;
const URL_EXTRACT_TIMEOUT = 30_000;
const CODE_SUBMIT_TIMEOUT = 30_000;

/** Strip ANSI escape sequences and TTY control codes from TUI output */
function stripAnsi(text: string): string {
  return text
    // Standard CSI sequences: ESC[...letter and ESC[?...letter
    .replace(/\x1b\[[\?]?[0-9;]*[a-zA-Z]/g, '')
    // ESC sequences like ESC>0q, ESC(B, ESC]...
    .replace(/\x1b[>=()\]][^\x1b]*/g, '')
    // Carriage returns from raw TTY
    .replace(/\r/g, '');
}

interface OAuthSession {
  process: ChildProcess;
  output: string;
  oauthUrl: string;
  sessionTimer: ReturnType<typeof setTimeout>;
}

@Injectable()
export class ClaudeOAuthService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(ClaudeOAuthService.name);
  private readonly sessions = new Map<string, OAuthSession>();

  onModuleInit() {
    if (!process.env['CLAUDE_CODE_OAUTH_TOKEN']) {
      try {
        if (fs.existsSync(TOKEN_FILE)) {
          const token = fs.readFileSync(TOKEN_FILE, 'utf-8').trim();
          if (token) {
            process.env['CLAUDE_CODE_OAUTH_TOKEN'] = token;
            this.logger.log('Loaded Claude OAuth token from persisted config');
          }
        }
      } catch (err) {
        this.logger.warn(`Failed to load persisted Claude token: ${err}`);
      }
    }
  }

  onModuleDestroy() {
    for (const [userId] of this.sessions) {
      this.cleanup(userId);
    }
  }

  /** Check if the OAuth token is already configured */
  isConfigured(): boolean {
    return !!process.env['CLAUDE_CODE_OAUTH_TOKEN'];
  }

  /**
   * Start the OAuth flow by spawning `claude setup-token` with a pseudo-TTY.
   * The CLI prints an authorization URL and waits for the user to paste a code.
   * We extract the URL and return it to the frontend.
   */
  async initiateOAuth(userId: string): Promise<{ oauthUrl: string }> {
    // Clean up any previous session
    this.cleanup(userId);

    return new Promise<{ oauthUrl: string }>((resolve, reject) => {
      // Use `script` to provide a pseudo-TTY — the Ink-based TUI requires one
      const proc = spawn(
        'script',
        ['-q', '-c', 'claude setup-token', '/dev/null'],
        { env: { ...process.env, TERM: 'dumb', NO_COLOR: '1' } },
      );

      let output = '';
      let urlResolved = false;

      const session: OAuthSession = {
        process: proc,
        output: '',
        oauthUrl: '',
        sessionTimer: setTimeout(() => {
          this.logger.warn(`OAuth session timed out for user ${userId}`);
          this.cleanup(userId);
        }, SESSION_TIMEOUT),
      };

      this.sessions.set(userId, session);

      proc.stdout?.on('data', (data: Buffer) => {
        const chunk = data.toString();
        output += chunk;
        session.output = output;

        if (!urlResolved) {
          const clean = stripAnsi(output);
          const urlStart = clean.indexOf('https://claude.ai/oauth/authorize');
          if (urlStart !== -1) {
            // URL may be line-wrapped across multiple lines in the TUI.
            // Grab from the URL start until "Paste code" or a double newline.
            const rest = clean.substring(urlStart);
            const endIdx = rest.search(/\s*Paste\s+code|\n\s*\n/);
            const rawUrl = endIdx !== -1 ? rest.substring(0, endIdx) : rest;
            // Remove all whitespace that may have been injected by line wrapping
            const oauthUrl = rawUrl.replace(/\s+/g, '');

            session.oauthUrl = oauthUrl;
            urlResolved = true;
            this.logger.log(`OAuth URL extracted for user ${userId} (${oauthUrl.length} chars)`);
            resolve({ oauthUrl });
          }
        }
      });

      proc.stderr?.on('data', (data: Buffer) => {
        this.logger.warn(`setup-token stderr: ${data.toString().slice(0, 200)}`);
      });

      proc.on('error', (err) => {
        this.logger.error(`Failed to spawn setup-token: ${err}`);
        this.cleanup(userId);
        if (!urlResolved) {
          urlResolved = true;
          reject(new Error('Failed to start Claude setup-token'));
        }
      });

      proc.on('close', (code) => {
        this.logger.log(`setup-token process exited (code ${code}) for user ${userId}`);
        if (!urlResolved) {
          urlResolved = true;
          reject(new Error('setup-token exited before producing an OAuth URL'));
        }
      });

      // Safety timeout for URL extraction
      setTimeout(() => {
        if (!urlResolved) {
          urlResolved = true;
          this.logger.error(
            `Timed out waiting for OAuth URL. Output: ${stripAnsi(output).slice(0, 500)}`,
          );
          this.cleanup(userId);
          reject(new Error('Timed out waiting for OAuth URL from setup-token'));
        }
      }, URL_EXTRACT_TIMEOUT);
    });
  }

  /**
   * Submit the authorization code to the running `claude setup-token` process.
   * The CLI exchanges it for a long-lived token (sk-ant-oat01-…).
   * On success it prints the token and exits; on failure it prints an error and waits.
   */
  async submitCode(
    userId: string,
    rawCode: string,
  ): Promise<{ success: boolean; error?: string }> {
    const code = rawCode.trim();
    const session = this.sessions.get(userId);

    if (!session) {
      return {
        success: false,
        error: 'No active OAuth session. Please start the flow again.',
      };
    }

    const proc = session.process;
    if (proc.killed || !proc.stdin?.writable) {
      this.cleanup(userId);
      return {
        success: false,
        error: 'OAuth process is no longer running. Please start again.',
      };
    }

    return new Promise<{ success: boolean; error?: string }>((resolve) => {
      const outputBefore = session.output.length;

      // Write the code followed by carriage return (raw-mode TTY needs \r, not \n)
      proc.stdin!.write(code + '\r');
      this.logger.log(`Code submitted for user ${userId} (${code.length} chars)`);

      let settled = false;

      const checkInterval = setInterval(() => {
        if (settled) return;

        const newOutput = session.output.substring(outputBefore);
        const clean = stripAnsi(newOutput);

        // Success: CLI prints the long-lived token
        const tokenMatch = clean.match(/sk-ant-oat01-[A-Za-z0-9_-]+/);
        if (tokenMatch) {
          settled = true;
          clearInterval(checkInterval);
          const token = tokenMatch[0];
          this.persistToken(token);
          this.logger.log(`OAuth token obtained and persisted (${token.length} chars)`);
          this.cleanup(userId);
          resolve({ success: true });
          return;
        }

        // Failure: CLI prints an error and waits for Enter to retry
        if (clean.includes('OAuth error')) {
          const errorMatch = clean.match(/OAuth error:\s*(.+)/);
          if (errorMatch) {
            settled = true;
            clearInterval(checkInterval);
            const errorMsg = errorMatch[1].trim();
            this.logger.error(`OAuth error from CLI: ${errorMsg}`);
            // Kill the process — user will need to start fresh
            this.cleanup(userId);
            resolve({ success: false, error: errorMsg });
            return;
          }
        }
      }, 300);

      // If process exits, check final output
      const onClose = () => {
        if (settled) return;
        // Give a brief moment for any remaining stdout to flush
        setTimeout(() => {
          if (settled) return;
          settled = true;
          clearInterval(checkInterval);

          const newOutput = session.output.substring(outputBefore);
          const clean = stripAnsi(newOutput);

          const tokenMatch = clean.match(/sk-ant-oat01-[A-Za-z0-9_-]+/);
          if (tokenMatch) {
            this.persistToken(tokenMatch[0]);
            this.logger.log(`OAuth token obtained on exit (${tokenMatch[0].length} chars)`);
            this.cleanup(userId);
            resolve({ success: true });
          } else {
            this.logger.error(`Process exited without token. Output: ${clean.slice(0, 500)}`);
            this.cleanup(userId);
            resolve({
              success: false,
              error: 'Authentication process ended without producing a token.',
            });
          }
        }, 500);
      };
      proc.on('close', onClose);

      // Timeout
      setTimeout(() => {
        if (settled) return;
        settled = true;
        clearInterval(checkInterval);
        proc.removeListener('close', onClose);
        this.logger.error(
          `Code submission timed out. New output: ${stripAnsi(session.output.substring(outputBefore)).slice(0, 500)}`,
        );
        resolve({
          success: false,
          error: 'Timed out waiting for authentication result. Please try again.',
        });
      }, CODE_SUBMIT_TIMEOUT);
    });
  }

  /** Cancel / clean up an active OAuth session */
  cancel(userId: string): void {
    this.cleanup(userId);
  }

  private cleanup(userId: string): void {
    const session = this.sessions.get(userId);
    if (!session) return;
    clearTimeout(session.sessionTimer);
    if (!session.process.killed) {
      session.process.kill();
    }
    this.sessions.delete(userId);
  }

  private persistToken(token: string): void {
    try {
      const dir = path.dirname(TOKEN_FILE);
      if (!fs.existsSync(dir)) {
        fs.mkdirSync(dir, { recursive: true });
      }
      fs.writeFileSync(TOKEN_FILE, token, { mode: 0o600 });
      process.env['CLAUDE_CODE_OAUTH_TOKEN'] = token;
      this.logger.log('Claude OAuth token persisted and set in environment');
    } catch (err) {
      this.logger.error(`Failed to persist token: ${err}`);
      // Still set the env var even if file persistence fails
      process.env['CLAUDE_CODE_OAUTH_TOKEN'] = token;
    }
  }
}
