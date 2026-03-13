import { Injectable, Logger } from '@nestjs/common';
import { createHash } from 'crypto';

interface GravatarProfile {
  avatar_url?: string;
  display_name?: string;
}

@Injectable()
export class GravatarService {
  private readonly logger = new Logger(GravatarService.name);
  private readonly cache = new Map<string, string | null>();

  /**
   * Fetch the Gravatar avatar URL for an email via the REST API (v3).
   * Caches results in-memory to avoid repeated API calls.
   */
  async getAvatarUrl(email: string): Promise<string | null> {
    const hash = this.hashEmail(email);

    if (this.cache.has(hash)) {
      return this.cache.get(hash) ?? null;
    }

    try {
      const res = await fetch(
        `https://api.gravatar.com/v3/profiles/${hash}`,
      );

      if (!res.ok) {
        this.cache.set(hash, null);
        return null;
      }

      const profile = (await res.json()) as GravatarProfile;
      const avatarUrl = profile.avatar_url ?? null;
      this.cache.set(hash, avatarUrl);
      return avatarUrl;
    } catch (error) {
      this.logger.warn(`Gravatar fetch failed for ${hash}: ${error}`);
      this.cache.set(hash, null);
      return null;
    }
  }

  private hashEmail(email: string): string {
    return createHash('sha256')
      .update(email.trim().toLowerCase())
      .digest('hex');
  }
}
