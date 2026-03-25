import { Injectable } from '@nestjs/common';
import type { ImageProvider } from './image-provider.interface';
import { NanoBananaProvider } from './nano-banana.provider';

@Injectable()
export class ImageProviderRegistry {
  private readonly providers = new Map<string, ImageProvider>();

  constructor(nanoBanana: NanoBananaProvider) {
    this.register(nanoBanana);
  }

  register(provider: ImageProvider): void {
    this.providers.set(provider.name, provider);
  }

  get(name: string): ImageProvider | undefined {
    return this.providers.get(name);
  }

  list(): Array<{ name: string; displayName: string; credentialType: string | null }> {
    return [...this.providers.values()].map((p) => ({
      name: p.name,
      displayName: p.displayName,
      credentialType: p.credentialType,
    }));
  }
}
