import { Injectable, Logger } from '@nestjs/common';
import { writeFile, mkdir } from 'fs/promises';
import { join } from 'path';
import { randomUUID } from 'crypto';
import type { ImageProvider, ImageGenerationResult } from './image-provider.interface';
import { CredentialType } from '../../vault/vault-credential.entity';

@Injectable()
export class NanoBananaProvider implements ImageProvider {
  readonly name = 'nano_banana';
  readonly displayName = 'Nano Banana (Gemini)';
  readonly credentialType = CredentialType.GEMINI;
  private readonly logger = new Logger(NanoBananaProvider.name);

  async generate(
    prompt: string,
    options?: Record<string, unknown>,
    credentials?: Record<string, string>,
  ): Promise<ImageGenerationResult> {
    const apiKey = credentials?.apiKey;
    if (!apiKey) {
      throw new Error('Gemini API key is required. Add it in Settings → Credential Vault.');
    }

    const { GoogleGenAI } = await import('@google/genai');
    const ai = new GoogleGenAI({ apiKey });

    const model = (options?.model as string) ?? 'gemini-2.5-flash-image';
    const aspectRatio = (options?.aspectRatio as string) ?? '1:1';

    this.logger.log(`Generating image with ${model}, aspect ratio: ${aspectRatio}`);

    const response = await ai.models.generateContent({
      model,
      contents: prompt,
      config: {
        responseModalities: ['IMAGE'],
        imageConfig: {
          aspectRatio,
        },
      },
    });

    const candidates = response.candidates;
    if (!candidates?.[0]?.content?.parts) {
      throw new Error('No image generated — empty response from Gemini');
    }

    for (const part of candidates[0].content.parts) {
      if (part.inlineData?.data) {
        const imageData = part.inlineData.data;
        const mimeType = part.inlineData.mimeType ?? 'image/png';
        const ext = mimeType.includes('jpeg') ? 'jpg' : 'png';

        const uploadsDir = join('/app', 'uploads', 'generated');
        await mkdir(uploadsDir, { recursive: true });

        const filename = `${randomUUID()}.${ext}`;
        const filePath = join(uploadsDir, filename);
        const buffer = Buffer.from(imageData, 'base64');
        await writeFile(filePath, buffer);

        this.logger.log(`Image saved: ${filePath} (${buffer.length} bytes)`);

        return {
          filePath: `generated/${filename}`,
          mimeType,
          metadata: { model, aspectRatio, sizeBytes: buffer.length },
        };
      }
    }

    throw new Error('No image data found in Gemini response');
  }
}
