import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Conversation } from './conversation.entity';
import { Message } from './message.entity';
import { ConversationService } from './conversation.service';
import { ConversationController } from './conversation.controller';
import { ConversationGateway } from './conversation.gateway';
import { ChatAgentService } from './agents/chat-agent.service';
import { ContentAgentService } from './agents/content-agent.service';
import { RetrievalModule } from '../retrieval/retrieval.module';
import { KnowledgeModule } from '../knowledge/knowledge.module';
import { AgentContextModule } from '../common/agent-context.module';
import { ContentIdeaModule } from '../content/content-idea.module';

@Module({
  imports: [
    TypeOrmModule.forFeature([Conversation, Message]),
    RetrievalModule,
    KnowledgeModule,
    AgentContextModule,
    ContentIdeaModule,
  ],
  controllers: [ConversationController],
  providers: [
    ConversationService,
    ConversationGateway,
    ChatAgentService,
    ContentAgentService,
  ],
  exports: [ConversationService, ConversationGateway],
})
export class ConversationModule {}
