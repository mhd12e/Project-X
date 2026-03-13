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
    // Cursor movement ESC[nC → replace with space (TUI uses this for word spacing)
    .replace(/\x1b\[\d*C/g, ' ')
    // Standard CSI sequences: ESC[...letter and ESC[?...letter
    .replace(/\x1b\[[\?]?[0-9;]*[a-zA-Z]/g, '')
    // ESC sequences like ESC>0q, ESC(B, ESC]...
    .replace(/\x1b[>=()\]][^\x1b]*/g, '')
    // Carriage returns from raw TTY
    .replace(/\r/g, '');
}

/**
 * Extract a token from raw TUI output by walking character-by-character,
 * skipping over inline ANSI escape sequences. The Ink TUI interleaves
 * cursor positioning within printed text, so naive strip-then-regex fails.
 */
function extractToken(raw: string): string | null {
  const marker = 'sk-ant-oat01-';
  const idx = raw.indexOf(marker);
  if (idx === -1) return null;

  let result = '';
  let i = idx;
  while (i < raw.length) {
    const ch = raw[i];

    // Skip ANSI escape sequences inline
    if (ch === '\x1b' && i + 1 < raw.length && raw[i + 1] === '[') {
      // CSI sequence: ESC[ ... <letter>
      i += 2;
      while (i < raw.length && !/[a-zA-Z]/.test(raw[i])) i++;
      i++; // skip the terminating letter
      continue;
    }
    if (ch === '\x1b') {
      // Other ESC sequence — skip ESC + next char
      i += 2;
      continue;
    }

    // Token characters: alphanumeric, dash, underscore
    if (/[A-Za-z0-9_-]/.test(ch)) {
      result += ch;
      i++;
      continue;
    }

    // Skip \r (TTY artifact)
    if (ch === '\r') {
      i++;
      continue;
    }

    // Newline within a line-wrapped token — keep going if next
    // non-ANSI, non-whitespace char is a valid token char
    if (ch === '\n') {
      // Peek ahead past whitespace and ANSI to see if token continues
      let j = i + 1;
      while (j < raw.length) {
        if (raw[j] === '\x1b') {
          // skip ANSI
          if (j + 1 < raw.length && raw[j + 1] === '[') {
            j += 2;
            while (j < raw.length && !/[a-zA-Z]/.test(raw[j])) j++;
            j++;
          } else {
            j += 2;
          }
        } else if (raw[j] === '\r' || raw[j] === '\n' || raw[j] === ' ') {
          // Two consecutive newlines (blank line) = end of token
          if (raw[j] === '\n' && j > 0 && (raw[j - 1] === '\n' || (raw[j - 1] === '\r' && j - 2 >= 0 && raw[j - 2] === '\n'))) {
            return cleanToken(result);
          }
          j++;
        } else if (/[A-Za-z0-9_-]/.test(raw[j])) {
          // Token continues after line wrap
          break;
        } else {
          // Non-token char — end
          return result.length > 20 ? result : null;
        }
      }
      i = j;
      continue;
    }

    // Any other character = end of token
    break;
  }

  return cleanToken(result);
}

/** Trim known footer text that may get concatenated to the token */
function cleanToken(raw: string): string | null {
  if (raw.length <= 20) return null;
  // The CLI prints "Store this token securely..." right after the token.
  // ANSI gaps may collapse, concatenating it to the token text.
  const suffixes = [
    'Storethistokensecurely',
    'Storethistoken',
    'Storethis',
    'Store',
  ];
  let token = raw;
  for (const suffix of suffixes) {
    const idx = token.indexOf(suffix);
    if (idx > 20) {
      token = token.substring(0, idx);
      break;
    }
  }
  return token.length > 20 ? token : null;
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

        // Success: CLI prints the long-lived token. Extract from RAW output
        // (not stripped) to avoid ANSI sequences corrupting the token.
        const token = extractToken(newOutput);
        if (token) {
          settled = true;
          clearInterval(checkInterval);
          this.persistToken(token);
          this.logger.log(`OAuth token obtained and persisted (${token.length} chars)`);
          this.cleanup(userId);
          resolve({ success: true });
          return;
        }

        // Failure: CLI prints "OAuth error: ..." and waits for Enter to retry.
        // With proper stripAnsi the spaces are preserved, but also handle the
        // space-less variant as a safety net.
        const oauthErrMatch =
          clean.match(/OAuth\s*error:\s*(.+)/) ||
          clean.match(/OAutherror:\s*(.+)/);
        if (oauthErrMatch) {
          settled = true;
          clearInterval(checkInterval);
          const rawMsg = oauthErrMatch[1].trim();
          this.logger.error(`OAuth error from CLI: ${rawMsg}`);
          this.cleanup(userId);
          // Return a user-friendly message based on the CLI error
          const errorMsg = rawMsg.includes('400') || rawMsg.includes('Invalid')
            ? 'Invalid or expired code. Please make sure you copied the full code correctly.'
            : `Authentication failed: ${rawMsg}`;
          resolve({ success: false, error: errorMsg });
          return;
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

          const token = extractToken(newOutput);
          if (token) {
            this.persistToken(token);
            this.logger.log(`OAuth token obtained on exit (${token.length} chars)`);
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
