import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { createHash, randomBytes } from 'crypto';
import * as fs from 'fs';
import * as path from 'path';

/**
 * PKCE OAuth flow for Claude.
 *
 * Instead of spawning `claude setup-token` and parsing TUI output,
 * we implement the OAuth PKCE flow directly with HTTP calls:
 *
 * 1. Generate PKCE code_verifier + code_challenge
 * 2. Build authorize URL → user opens in browser
 * 3. User completes auth → gets authorization code
 * 4. We exchange the code for tokens via POST to the token endpoint
 * 5. Auto-refresh when access_token expires
 */

const CLIENT_ID = '9d1c250a-e61b-44d9-88ed-5944d1962f5e';
const AUTHORIZE_URL = 'https://claude.ai/oauth/authorize';
const TOKEN_URL = 'https://platform.claude.com/v1/oauth/token';
const REDIRECT_URI = 'https://platform.claude.com/oauth/code/callback';
const SCOPE = 'user:inference';

const TOKEN_FILE = '/app/uploads/.config/claude-tokens.json';
const CREDENTIALS_FILE = '/root/.claude/.credentials.json';

const SESSION_TTL = 5 * 60_000; // 5 minutes to complete auth
const REFRESH_BUFFER = 5 * 60_000; // refresh 5 min before expiry

interface StoredTokens {
  accessToken: string;
  refreshToken: string;
  expiresAt: number;
}

interface PkceSession {
  codeVerifier: string;
  state: string;
  timer: ReturnType<typeof setTimeout>;
}

@Injectable()
export class ClaudeOAuthService implements OnModuleInit {
  private readonly logger = new Logger(ClaudeOAuthService.name);
  private readonly sessions = new Map<string, PkceSession>();
  private tokens: StoredTokens | null = null;

  onModuleInit() {
    this.loadTokens();
  }

  // ─── Public API ───

  isConfigured(): boolean {
    if (!this.tokens) this.loadTokens();
    return !!this.tokens?.accessToken;
  }

  /**
   * Ensure the access token is fresh. Auto-refreshes if expired.
   * Call this before any Agent SDK usage.
   */
  async ensureFreshToken(): Promise<string | null> {
    if (!this.tokens) this.loadTokens();
    if (!this.tokens) return null;

    if (this.tokens.expiresAt < Date.now() + REFRESH_BUFFER) {
      if (this.tokens.refreshToken) {
        try {
          await this.refreshAccessToken();
        } catch (err) {
          this.logger.error(`Token refresh failed: ${err}`);
          return null;
        }
      }
    }

    // Sync to process.env so Agent SDK subprocess picks it up
    process.env['CLAUDE_CODE_OAUTH_TOKEN'] = this.tokens.accessToken;
    return this.tokens.accessToken;
  }

  /**
   * Step 1: Generate PKCE params and build the authorization URL.
   */
  initiateOAuth(userId: string): { oauthUrl: string } {
    // Clean up previous session
    this.cleanupSession(userId);

    const codeVerifier = randomBytes(32).toString('base64url');
    const codeChallenge = createHash('sha256').update(codeVerifier).digest('base64url');
    const state = randomBytes(32).toString('base64url');

    const timer = setTimeout(() => {
      this.sessions.delete(userId);
      this.logger.debug(`PKCE session expired for ${userId}`);
    }, SESSION_TTL);

    this.sessions.set(userId, { codeVerifier, state, timer });

    const params = new URLSearchParams({
      code: 'true',
      client_id: CLIENT_ID,
      response_type: 'code',
      redirect_uri: REDIRECT_URI,
      scope: SCOPE,
      code_challenge: codeChallenge,
      code_challenge_method: 'S256',
      state,
    });

    const oauthUrl = `${AUTHORIZE_URL}?${params.toString()}`;
    this.logger.log(`OAuth URL generated for user ${userId}`);
    return { oauthUrl };
  }

  /**
   * Step 2: Exchange the authorization code for tokens via HTTP POST.
   * No subprocess, no TUI — just a clean HTTP call.
   */
  async exchangeCode(
    userId: string,
    code: string,
  ): Promise<{ success: boolean; error?: string }> {
    const session = this.sessions.get(userId);
    if (!session) {
      return { success: false, error: 'No active OAuth session. Please start the flow again.' };
    }

    try {
      // The callback page shows "code#state" as one string — strip the #state suffix
      const rawCode = code.trim().split('#')[0];

      const exchangeBody: Record<string, unknown> = {
        grant_type: 'authorization_code',
        code: rawCode,
        redirect_uri: REDIRECT_URI,
        client_id: CLIENT_ID,
        code_verifier: session.codeVerifier,
        state: session.state,
        expires_in: 31536000,
      };
      this.logger.log(`Token exchange → code=${rawCode.slice(0, 10)}... (${rawCode.length} chars)`);

      const response = await fetch(TOKEN_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(exchangeBody),
      });

      if (!response.ok) {
        const body = await response.text();
        this.logger.error(`Token exchange failed (${response.status}): ${body}`);

        this.cleanupSession(userId);

        let error: string;
        if (response.status === 429) {
          error = 'Rate limited by Anthropic. Please wait a minute and try again.';
        } else if (response.status === 400) {
          error = body.includes('invalid_grant')
            ? 'Invalid or expired code. Make sure you copied only the code (before the # symbol) and try again.'
            : `Bad request: ${body.slice(0, 200)}`;
        } else {
          error = `Authentication failed (HTTP ${response.status}). Please try again.`;
        }
        return { success: false, error };
      }

      const data = (await response.json()) as {
        token_type: string;
        access_token: string;
        refresh_token: string;
        expires_in: number;
        scope: string;
      };

      this.tokens = {
        accessToken: data.access_token,
        refreshToken: data.refresh_token,
        expiresAt: Date.now() + data.expires_in * 1000,
      };

      this.saveTokens();
      process.env['CLAUDE_CODE_OAUTH_TOKEN'] = data.access_token;
      this.cleanupSession(userId);

      this.logger.log(
        `OAuth tokens obtained (access: ${data.access_token.length} chars, ` +
        `refresh: ${data.refresh_token.length} chars, expires in ${data.expires_in}s)`,
      );
      return { success: true };
    } catch (err) {
      this.cleanupSession(userId);
      const msg = err instanceof Error ? err.message : 'Unknown error';
      this.logger.error(`Token exchange error: ${msg}`);
      return { success: false, error: `Connection failed: ${msg}` };
    }
  }

  /**
   * Cancel an in-progress OAuth session.
   */
  cancel(userId: string): void {
    this.cleanupSession(userId);
  }

  /**
   * Set a token directly (user pasted it manually from `claude setup-token`).
   */
  setTokenDirectly(token: string): void {
    const clean = token.replace(/\s+/g, '');
    this.tokens = {
      accessToken: clean,
      refreshToken: '',
      expiresAt: Date.now() + 365 * 24 * 60 * 60 * 1000, // setup-token tokens last ~1 year
    };
    this.saveTokens();
    process.env['CLAUDE_CODE_OAUTH_TOKEN'] = clean;
    this.logger.log(`Token set directly (${clean.length} chars)`);
  }

  // ─── Token Refresh ───

  private async refreshAccessToken(): Promise<void> {
    if (!this.tokens?.refreshToken) {
      throw new Error('No refresh token available');
    }

    this.logger.log('Refreshing access token...');

    const response = await fetch(TOKEN_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        grant_type: 'refresh_token',
        refresh_token: this.tokens.refreshToken,
        client_id: CLIENT_ID,
      }),
    });

    if (!response.ok) {
      const body = await response.text();
      // If refresh token is also expired, clear everything
      if (response.status === 401 || response.status === 400) {
        this.tokens = null;
        this.saveTokens();
        delete process.env['CLAUDE_CODE_OAUTH_TOKEN'];
      }
      throw new Error(`Refresh failed (${response.status}): ${body}`);
    }

    const data = (await response.json()) as {
      access_token: string;
      refresh_token?: string;
      expires_in: number;
    };

    this.tokens = {
      accessToken: data.access_token,
      refreshToken: data.refresh_token ?? this.tokens.refreshToken,
      expiresAt: Date.now() + data.expires_in * 1000,
    };

    this.saveTokens();
    process.env['CLAUDE_CODE_OAUTH_TOKEN'] = data.access_token;
    this.logger.log(`Access token refreshed (expires in ${data.expires_in}s)`);
  }

  // ─── Session Management ───

  private cleanupSession(userId: string): void {
    const session = this.sessions.get(userId);
    if (session) {
      clearTimeout(session.timer);
      this.sessions.delete(userId);
    }
  }

  // ─── Token Storage ───

  private loadTokens(): void {
    // Priority 1: Our own token file (has refresh token)
    try {
      if (fs.existsSync(TOKEN_FILE)) {
        const parsed = JSON.parse(fs.readFileSync(TOKEN_FILE, 'utf-8')) as StoredTokens;
        if (parsed.accessToken) {
          this.tokens = parsed;
          process.env['CLAUDE_CODE_OAUTH_TOKEN'] = parsed.accessToken;
          console.log(`[ClaudeOAuth] Loaded tokens from ${TOKEN_FILE} (expires ${new Date(parsed.expiresAt).toISOString()})`);
          return;
        }
      }
    } catch { /* ignore */ }

    // Priority 2: Mounted credentials file from host (~/.claude/.credentials.json)
    try {
      if (fs.existsSync(CREDENTIALS_FILE)) {
        const creds = JSON.parse(fs.readFileSync(CREDENTIALS_FILE, 'utf-8'));
        const accessToken = creds?.claudeAiOauth?.accessToken;
        const refreshToken = creds?.claudeAiOauth?.refreshToken ?? '';
        const expiresAt = creds?.claudeAiOauth?.expiresAt ?? (Date.now() + 8 * 60 * 60 * 1000);
        if (accessToken) {
          this.tokens = { accessToken, refreshToken, expiresAt };
          process.env['CLAUDE_CODE_OAUTH_TOKEN'] = accessToken;
          console.log(`[ClaudeOAuth] Loaded tokens from credentials file (has refresh: ${!!refreshToken})`);
          return;
        }
      }
    } catch { /* ignore */ }
  }

  private saveTokens(): void {
    try {
      const dir = path.dirname(TOKEN_FILE);
      if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });

      if (this.tokens) {
        fs.writeFileSync(TOKEN_FILE, JSON.stringify(this.tokens, null, 2), { mode: 0o600 });
      } else {
        // Clear the file if tokens are null (e.g., after failed refresh)
        if (fs.existsSync(TOKEN_FILE)) fs.unlinkSync(TOKEN_FILE);
      }
    } catch (err) {
      this.logger.warn(`Failed to save tokens: ${err}`);
    }
  }
}
