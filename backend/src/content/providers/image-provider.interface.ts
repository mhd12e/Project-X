import { CredentialType } from '../../vault/vault-credential.entity';

export interface ImageGenerationResult {
  imageUrl?: string;
  filePath?: string;
  base64Data?: string;
  mimeType?: string;
  metadata?: Record<string, unknown>;
}

export interface ImageProvider {
  readonly name: string;
  readonly displayName: string;
  /** Which vault credential type this provider needs, or null if none */
  readonly credentialType: CredentialType | null;
  generate(
    prompt: string,
    options?: Record<string, unknown>,
    credentials?: Record<string, string>,
  ): Promise<ImageGenerationResult>;
}
