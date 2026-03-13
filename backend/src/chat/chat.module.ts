import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ChatConversation } from './chat-conversation.entity';
import { ChatMessage } from './chat-message.entity';
import { ChatService } from './chat.service';
import { ChatController } from './chat.controller';
import { ChatGateway } from './chat.gateway';
import { ChatAgentService } from './chat-agent.service';
import { RetrievalModule } from '../retrieval/retrieval.module';
import { KnowledgeModule } from '../knowledge/knowledge.module';

@Module({
  imports: [
    TypeOrmModule.forFeature([ChatConversation, ChatMessage]),
    RetrievalModule,
    KnowledgeModule,
  ],
  controllers: [ChatController],
  providers: [ChatService, ChatGateway, ChatAgentService],
})
export class ChatModule {}
