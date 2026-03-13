import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { KnowledgeDocument } from './knowledge-document.entity';
import { KnowledgeChunk } from './knowledge-chunk.entity';
import { KnowledgeConversation } from './knowledge-conversation.entity';
import { KnowledgeService } from './knowledge.service';
import { KnowledgeAgentService } from './knowledge-agent.service';
import { KnowledgeController } from './knowledge.controller';
import { KnowledgeGateway } from './knowledge.gateway';
import { RetrievalModule } from '../retrieval/retrieval.module';

@Module({
  imports: [
    TypeOrmModule.forFeature([
      KnowledgeDocument,
      KnowledgeChunk,
      KnowledgeConversation,
    ]),
    RetrievalModule,
  ],
  controllers: [KnowledgeController],
  providers: [KnowledgeService, KnowledgeAgentService, KnowledgeGateway],
  exports: [KnowledgeService, KnowledgeAgentService],
})
export class KnowledgeModule {}
