import { Module } from '@nestjs/common';
import { ContentController } from './content.controller';
import { ContentImageService } from './content-image.service';
import { NanoBananaProvider } from './providers/nano-banana.provider';
import { ImageProviderRegistry } from './providers/image-provider.registry';
import { ArtifactModule } from '../artifact/artifact.module';
import { VaultModule } from '../vault/vault.module';
import { ContentIdeaModule } from './content-idea.module';
import { ConversationModule } from '../conversation/conversation.module';

@Module({
  imports: [
    ArtifactModule,
    VaultModule,
    ContentIdeaModule,
    ConversationModule,
  ],
  controllers: [ContentController],
  providers: [
    ContentImageService,
    NanoBananaProvider,
    ImageProviderRegistry,
  ],
})
export class ContentModule {}
