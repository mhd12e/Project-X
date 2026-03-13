import { Injectable, Logger, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { spawn, ChildProcessWithoutNullStreams } from 'child_process';
import * as fs from 'fs';
import * as path from 'path';

const TOKEN_FILE = '/app/uploads/.config/claude-oauth-token';
const URL_TIMEOUT = 30_000;
const CODE_TIMEOUT = 30_000;
const SESSION_TIMEOUT = 5 * 60_000;

/** Strip ANSI escape codes from TUI output */
function stripAnsi(text: string): string {
  // eslint-disable-next-line no-control-regex
  return text.replace(/\x1b\[[0-9;?]*[a-zA-Z]|\x1b\][^\x07]*\x07/g, '');
}

interface OAuthSession {
  process: ChildProcessWithoutNullStreams;
  outputBuffer: string;
  oauthUrl: string | null;
  status: 'waiting_for_url' | 'waiting_for_code' | 'waiting_for_result' | 'success' | 'error';
  token: string | null;
  error: string | null;
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
   * Start the OAuth flow.
   * Uses `script -qc` to provide a pseudo-TTY because `claude setup-token`
   * is a TUI program (Ink/React) that requires raw mode on stdin.
   */
  async initiateOAuth(userId: string): Promise<{ oauthUrl: string }> {
    this.cleanup(userId);

    return new Promise((resolve, reject) => {
      // `script -q -c "command" /dev/null` allocates a pseudo-TTY
      const proc = spawn('script', ['-q', '-c', 'claude setup-token', '/dev/null'], {
        stdio: ['pipe', 'pipe', 'pipe'],
        env: { ...process.env, NO_COLOR: '1' },
      });

      const session: OAuthSession = {
        process: proc,
        outputBuffer: '',
        oauthUrl: null,
        status: 'waiting_for_url',
        token: null,
        error: null,
        sessionTimer: setTimeout(() => {
          this.logger.warn(`OAuth session timed out for user ${userId}`);
          this.cleanup(userId);
        }, SESSION_TIMEOUT),
      };

      this.sessions.set(userId, session);

      let resolved = false;

      const urlTimeout = setTimeout(() => {
        if (!resolved) {
          resolved = true;
          this.logger.error(
            `URL timeout. Buffer so far:\n${stripAnsi(session.outputBuffer).slice(0, 500)}`,
          );
          this.cleanup(userId);
          reject(new Error('Timed out waiting for OAuth URL from claude setup-token'));
        }
      }, URL_TIMEOUT);

      const handleOutput = (data: Buffer) => {
        session.outputBuffer += data.toString();
        const clean = stripAnsi(session.outputBuffer);

        if (!session.oauthUrl) {
          const urlMatch = clean.match(
            /(https:\/\/claude\.ai\/oauth\/authorize\S+)/,
          );
          if (urlMatch) {
            // The URL may be line-wrapped by the TUI — reassemble by removing whitespace
            session.oauthUrl = urlMatch[1].replace(/\s+/g, '');
            session.status = 'waiting_for_code';
            if (!resolved) {
              resolved = true;
              clearTimeout(urlTimeout);
              this.logger.log('OAuth URL captured');
              resolve({ oauthUrl: session.oauthUrl });
            }
          }
        }
      };

      proc.stdout.on('data', handleOutput);
      proc.stderr.on('data', handleOutput);

      proc.on('error', (err) => {
        this.logger.error(`claude setup-token process error: ${err.message}`);
        if (!resolved) {
          resolved = true;
          clearTimeout(urlTimeout);
          this.cleanup(userId);
          reject(new Error(`Failed to start claude setup-token: ${err.message}`));
        }
      });

      proc.on('close', (code) => {
        if (!resolved) {
          resolved = true;
          clearTimeout(urlTimeout);
          this.logger.error(
            `Process exited (code ${code}) before URL. Buffer:\n${stripAnsi(session.outputBuffer).slice(0, 500)}`,
          );
          this.cleanup(userId);
          reject(new Error(`claude setup-token exited with code ${code} before providing URL`));
        }
      });
    });
  }

  /** Submit the authorization code to the running process */
  async submitCode(userId: string, code: string): Promise<{ success: boolean; token?: string; error?: string }> {
    const session = this.sessions.get(userId);
    if (!session) {
      return { success: false, error: 'No active OAuth session. Please start the flow again.' };
    }

    if (session.status !== 'waiting_for_code') {
      return { success: false, error: `Session is in unexpected state: ${session.status}` };
    }

    return new Promise((resolve) => {
      session.status = 'waiting_for_result';
      const bufferBefore = session.outputBuffer.length;

      const timeout = setTimeout(() => {
        resolve({ success: false, error: 'Timed out waiting for result. Please try again.' });
        this.cleanup(userId);
      }, CODE_TIMEOUT);

      const checkResult = (data: Buffer) => {
        session.outputBuffer += data.toString();
        const newOutput = stripAnsi(session.outputBuffer.slice(bufferBefore));

        // Check for token (success)
        const tokenMatch = newOutput.match(/(sk-ant-oat01-[A-Za-z0-9_-]+)/);
        if (tokenMatch) {
          clearTimeout(timeout);
          session.token = tokenMatch[1];
          session.status = 'success';
          this.persistToken(session.token);
          session.process.stdout.off('data', checkResult);
          session.process.stderr.off('data', checkResult);
          resolve({ success: true, token: session.token });
          this.cleanup(userId);
          return;
        }

        // Check for error
        if (newOutput.includes('OAuth error') || newOutput.includes('Invalid code')) {
          clearTimeout(timeout);
          session.status = 'error';
          session.error = 'Invalid code. Please make sure the full code was copied.';
          session.process.stdout.off('data', checkResult);
          session.process.stderr.off('data', checkResult);
          resolve({ success: false, error: session.error });
          this.cleanup(userId);
          return;
        }
      };

      session.process.stdout.on('data', checkResult);
      session.process.stderr.on('data', checkResult);

      // Write the code to the pseudo-TTY stdin
      session.process.stdin.write(code + '\n');
    });
  }

  /** Cancel an active OAuth session */
  cancel(userId: string): void {
    this.cleanup(userId);
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
      process.env['CLAUDE_CODE_OAUTH_TOKEN'] = token;
    }
  }

  private cleanup(userId: string): void {
    const session = this.sessions.get(userId);
    if (!session) return;

    clearTimeout(session.sessionTimer);
    try {
      session.process.stdin.end();
      session.process.kill('SIGTERM');
    } catch {
      // Process may already be dead
    }
    this.sessions.delete(userId);
  }
}
