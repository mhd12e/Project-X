import { Injectable, Logger } from '@nestjs/common';
import { CredentialType } from './vault-credential.entity';

@Injectable()
export class CredentialTesterService {
  private readonly logger = new Logger(CredentialTesterService.name);

  async test(
    type: CredentialType,
    data: Record<string, string>,
  ): Promise<{ success: boolean; message: string }> {
    switch (type) {
      case CredentialType.GEMINI:
        return this.testGemini(data);
      default:
        return { success: false, message: `No test available for "${type}"` };
    }
  }

  private async testGemini(data: Record<string, string>): Promise<{ success: boolean; message: string }> {
    const apiKey = data.apiKey;
    if (!apiKey) return { success: false, message: 'API key is missing' };

    try {
      const { GoogleGenAI } = await import('@google/genai');
      const ai = new GoogleGenAI({ apiKey });
      await ai.models.list();
      return {
        success: true,
        message: 'API key is valid. Connected to Google Gemini.',
      };
    } catch (error) {
      const msg = error instanceof Error ? error.message : 'Unknown error';
      this.logger.warn(`Gemini credential test failed: ${msg}`);
      return { success: false, message: msg };
    }
  }
}
