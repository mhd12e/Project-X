import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { ChatConversation } from './chat-conversation.entity';
import { ChatMessage, MessageRole } from './chat-message.entity';

@Injectable()
export class ChatService {
  constructor(
    @InjectRepository(ChatConversation)
    private readonly conversationRepo: Repository<ChatConversation>,
    @InjectRepository(ChatMessage)
    private readonly messageRepo: Repository<ChatMessage>,
  ) {}

  async createConversation(userId: string, title?: string): Promise<ChatConversation> {
    const conv = this.conversationRepo.create({
      userId,
      title: title ?? null,
    });
    return this.conversationRepo.save(conv);
  }

  async findConversationsByUser(userId: string): Promise<ChatConversation[]> {
    return this.conversationRepo.find({
      where: { userId },
      order: { updatedAt: 'DESC' },
    });
  }

  async findConversationById(id: string): Promise<ChatConversation | null> {
    return this.conversationRepo.findOne({
      where: { id },
      relations: ['messages'],
      order: { messages: { orderIndex: 'ASC' } },
    });
  }

  async addMessage(
    conversationId: string,
    role: MessageRole,
    content: string,
    metadata?: Record<string, unknown>,
  ): Promise<ChatMessage> {
    const count = await this.messageRepo.count({ where: { conversationId } });
    const msg = this.messageRepo.create({
      conversationId,
      role,
      content,
      metadata: metadata ?? null,
      orderIndex: count,
    });
    // Touch the conversation updatedAt
    await this.conversationRepo.update(conversationId, {});
    return this.messageRepo.save(msg);
  }

  async updateConversationTitle(id: string, title: string): Promise<void> {
    await this.conversationRepo.update(id, { title });
  }

  async deleteConversation(id: string): Promise<void> {
    await this.conversationRepo.delete(id);
  }

  async getMessageCount(conversationId: string): Promise<number> {
    return this.messageRepo.count({ where: { conversationId } });
  }
}
