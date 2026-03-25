import { Injectable, Logger, NotFoundException } from '@nestjs/common';
import { ContentIdeaService } from './content-idea.service';
import { ConversationGateway } from '../conversation/conversation.gateway';
import { ImageProviderRegistry } from './providers/image-provider.registry';
import { ActivityLogService } from '../activity/activity-log.service';
import { ActivityCategory, ActivityLevel } from '../activity/activity-log.entity';
import { ArtifactService } from '../artifact/artifact.service';
import { ArtifactType, ArtifactSource } from '../artifact/artifact.entity';
import { VaultService } from '../vault/vault.service';
import { CREDENTIAL_SCHEMAS } from '../vault/credential-schemas';

@Injectable()
export class ContentImageService {
  private readonly logger = new Logger(ContentImageService.name);

  constructor(
    private readonly ideaService: ContentIdeaService,
    private readonly gateway: ConversationGateway,
    private readonly providerRegistry: ImageProviderRegistry,
    private readonly activityLog: ActivityLogService,
    private readonly artifactService: ArtifactService,
    private readonly vaultService: VaultService,
  ) {}

  async generateImage(
    ideaId: string,
    providerName: string = 'nano_banana',
    customPrompt?: string,
    userId?: string,
  ): Promise<{ artifactId: string }> {
    const idea = await this.ideaService.findById(ideaId);
    if (!idea) throw new NotFoundException('Idea not found');

    const provider = this.providerRegistry.get(providerName);
    if (!provider) throw new NotFoundException(`Provider "${providerName}" not found`);

    const prompt = customPrompt ?? `Create a visually compelling image for the following content idea:\n\nTitle: ${idea.title}\nDescription: ${idea.description}\n\nMake it professional, eye-catching, and suitable for ${idea.category ?? 'content marketing'}.`;

    const artifact = await this.artifactService.create({
      userId: userId ?? undefined,
      name: `Image: ${idea.title}`,
      description: prompt.slice(0, 500),
      type: ArtifactType.IMAGE,
      source: ArtifactSource.CONTENT,
      mimeType: 'image/png',
      filePath: '',
      sourceId: ideaId,
      sourceContext: `Content idea: ${idea.title}`,
      metadata: { provider: providerName, status: 'pending' },
    });

    this.processImageGeneration(artifact.id, idea.conversationId, prompt, providerName, userId).catch((err) => {
      this.logger.error(`Image generation failed: ${err}`);
    });

    return { artifactId: artifact.id };
  }

  private async processImageGeneration(
    artifactId: string,
    conversationId: string,
    prompt: string,
    providerName: string,
    userId?: string,
  ): Promise<void> {
    this.gateway.emit({
      conversationId,
      type: 'image_generating',
      imageId: artifactId,
      content: 'Generating image...',
      timestamp: Date.now(),
    });

    try {
      await this.artifactService.update(artifactId, {
        metadata: { provider: providerName, status: 'generating' },
      });

      const provider = this.providerRegistry.get(providerName);
      if (!provider) throw new Error(`Provider "${providerName}" not found`);

      // Resolve credentials from vault if provider requires them
      let credentials: Record<string, string> | undefined;
      if (provider.credentialType && userId) {
        const decrypted = await this.vaultService.getDecrypted(userId, provider.credentialType);
        if (!decrypted) {
          const schema = CREDENTIAL_SCHEMAS[provider.credentialType];
          throw new Error(
            `No ${schema?.displayName ?? provider.credentialType} credentials configured. ` +
            'Add them in Settings → Credential Vault.',
          );
        }
        credentials = decrypted;
      }

      const result = await provider.generate(prompt, undefined, credentials);

      await this.artifactService.update(artifactId, {
        filePath: result.filePath ?? '',
        mimeType: result.mimeType ?? 'image/png',
        fileSize: (result.metadata?.sizeBytes as number) ?? undefined,
        metadata: { provider: providerName, status: 'completed', ...result.metadata },
      });

      const imageUrl = `/api/artifacts/${artifactId}/file`;

      this.gateway.emit({
        conversationId,
        type: 'image_complete',
        imageId: artifactId,
        imageUrl,
        timestamp: Date.now(),
      });

      this.activityLog.log({
        category: ActivityCategory.CONTENT,
        action: 'image.generated',
        description: `Image generated via ${providerName}`,
        metadata: { artifactId, conversationId, provider: providerName },
        userId,
      }).catch(() => {});
    } catch (error) {
      const errMsg = error instanceof Error ? error.message : 'Unknown error';
      this.logger.error(`Image generation failed for artifact ${artifactId}: ${errMsg}`);

      // Delete the empty artifact — no point keeping a record with no file
      await this.artifactService.delete(artifactId);

      this.gateway.emit({
        conversationId,
        type: 'image_error',
        imageId: artifactId,
        content: errMsg,
        timestamp: Date.now(),
      });

      this.activityLog.log({
        category: ActivityCategory.CONTENT,
        level: ActivityLevel.ERROR,
        action: 'image.failed',
        description: `Image generation failed: ${errMsg}`,
        metadata: { artifactId, error: errMsg },
        userId,
      }).catch(() => {});
    }
  }

  listProviders() {
    return this.providerRegistry.list();
  }
}
