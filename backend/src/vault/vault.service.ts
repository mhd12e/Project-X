import {
  Injectable,
  Logger,
  BadRequestException,
  OnModuleInit,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { ConfigService } from '@nestjs/config';
import { Repository } from 'typeorm';
import {
  createCipheriv,
  createDecipheriv,
  randomBytes,
} from 'crypto';
import { VaultCredential, CredentialType } from './vault-credential.entity';
import { CREDENTIAL_SCHEMAS } from './credential-schemas';

export interface VaultCredentialResponse {
  id: string;
  type: CredentialType;
  displayName: string;
  label: string | null;
  verified: boolean;
  maskedData: Record<string, string>;
  createdAt: string;
  updatedAt: string;
}

@Injectable()
export class VaultService implements OnModuleInit {
  private readonly logger = new Logger(VaultService.name);
  private encryptionKey!: Buffer;

  constructor(
    @InjectRepository(VaultCredential)
    private readonly repo: Repository<VaultCredential>,
    private readonly configService: ConfigService,
  ) {}

  onModuleInit() {
    const keyHex = this.configService.get<string>('VAULT_ENCRYPTION_KEY');
    if (!keyHex) {
      this.logger.warn(
        'VAULT_ENCRYPTION_KEY is not set. Vault will not work. ' +
        'Generate one with: node -e "console.log(require(\'crypto\').randomBytes(32).toString(\'hex\'))"',
      );
      this.encryptionKey = Buffer.alloc(32); // placeholder — operations will fail gracefully
      return;
    }
    this.encryptionKey = Buffer.from(keyHex, 'hex');
    if (this.encryptionKey.length !== 32) {
      throw new Error('VAULT_ENCRYPTION_KEY must be 64 hex characters (32 bytes)');
    }
    this.logger.log('Vault encryption key loaded');
  }

  // ─── CRUD ───

  async upsert(
    userId: string,
    type: CredentialType,
    data: Record<string, string>,
    label?: string,
  ): Promise<VaultCredentialResponse> {
    this.validateSchema(type, data);

    const encrypted = this.encrypt(JSON.stringify(data));

    let credential = await this.repo.findOne({ where: { userId, type } });
    if (credential) {
      credential.encryptedData = encrypted;
      if (label !== undefined) credential.label = label || null;
      credential.verified = false;
    } else {
      credential = this.repo.create({
        userId,
        type,
        encryptedData: encrypted,
        label: label || null,
        verified: false,
      });
    }

    const saved = await this.repo.save(credential);
    this.logger.log(`Credential upserted: ${type} for user ${userId}`);
    return this.toResponse(saved, data);
  }

  async findAllForUser(userId: string): Promise<VaultCredentialResponse[]> {
    const credentials = await this.repo.find({
      where: { userId },
      order: { createdAt: 'ASC' },
    });
    return credentials.map((c) => {
      let decrypted: Record<string, string> = {};
      try {
        decrypted = JSON.parse(this.decrypt(c.encryptedData));
      } catch { /* return empty masked data */ }
      return this.toResponse(c, decrypted);
    });
  }

  async getDecrypted(
    userId: string,
    type: CredentialType,
  ): Promise<Record<string, string> | null> {
    const credential = await this.repo.findOne({ where: { userId, type } });
    if (!credential) return null;
    try {
      return JSON.parse(this.decrypt(credential.encryptedData));
    } catch {
      this.logger.error(`Failed to decrypt credential ${type} for user ${userId}`);
      return null;
    }
  }

  async delete(userId: string, type: CredentialType): Promise<void> {
    await this.repo.delete({ userId, type });
    this.logger.log(`Credential deleted: ${type} for user ${userId}`);
  }

  async markVerified(userId: string, type: CredentialType): Promise<void> {
    await this.repo.update({ userId, type }, { verified: true });
  }

  // ─── Encryption (AES-256-GCM) ───

  private encrypt(plaintext: string): string {
    const iv = randomBytes(12);
    const cipher = createCipheriv('aes-256-gcm', this.encryptionKey, iv);
    const encrypted = Buffer.concat([
      cipher.update(plaintext, 'utf8'),
      cipher.final(),
    ]);
    const authTag = cipher.getAuthTag();
    return Buffer.concat([iv, authTag, encrypted]).toString('base64');
  }

  private decrypt(encoded: string): string {
    const combined = Buffer.from(encoded, 'base64');
    const iv = combined.subarray(0, 12);
    const authTag = combined.subarray(12, 28);
    const ciphertext = combined.subarray(28);
    const decipher = createDecipheriv('aes-256-gcm', this.encryptionKey, iv);
    decipher.setAuthTag(authTag);
    return Buffer.concat([
      decipher.update(ciphertext),
      decipher.final(),
    ]).toString('utf8');
  }

  // ─── Validation ───

  private validateSchema(type: CredentialType, data: Record<string, string>): void {
    const schema = CREDENTIAL_SCHEMAS[type];
    if (!schema) throw new BadRequestException(`Unknown credential type: ${type}`);

    for (const field of schema.fields) {
      if (field.required && !data[field.key]?.trim()) {
        throw new BadRequestException(`"${field.label}" is required`);
      }
    }

    const validKeys = new Set(schema.fields.map((f) => f.key));
    for (const key of Object.keys(data)) {
      if (!validKeys.has(key)) {
        throw new BadRequestException(`Unknown field "${key}" for ${schema.displayName}`);
      }
    }
  }

  // ─── Response Mapping ───

  private toResponse(
    credential: VaultCredential,
    decryptedData?: Record<string, string>,
  ): VaultCredentialResponse {
    const schema = CREDENTIAL_SCHEMAS[credential.type];
    const maskedData: Record<string, string> = {};

    if (decryptedData && schema) {
      for (const field of schema.fields) {
        const value = decryptedData[field.key] ?? '';
        maskedData[field.key] = field.type === 'secret'
          ? this.mask(value)
          : value;
      }
    }

    return {
      id: credential.id,
      type: credential.type,
      displayName: schema?.displayName ?? credential.type,
      label: credential.label,
      verified: credential.verified,
      maskedData,
      createdAt: credential.createdAt.toISOString(),
      updatedAt: credential.updatedAt.toISOString(),
    };
  }

  private mask(value: string): string {
    if (!value || value.length <= 8) return '••••••••';
    return value.slice(0, 4) + '••••' + value.slice(-4);
  }
}
