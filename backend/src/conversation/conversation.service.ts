import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Conversation, ConversationType } from './conversation.entity';
import { Message, MessageRole } from './message.entity';
import { ContentBlock, extractPlainText } from './content-block.types';

@Injectable()
export class ConversationService {
  constructor(
    @InjectRepository(Conversation)
    private readonly convRepo: Repository<Conversation>,
    @InjectRepository(Message)
    private readonly msgRepo: Repository<Message>,
  ) {}

  // ---- Conversations ----

  async create(userId: string, type: ConversationType, title?: string): Promise<Conversation> {
    const conv = this.convRepo.create({
      userId,
      type,
      title: title ?? null,
    });
    return this.convRepo.save(conv);
  }

  async findByUser(userId: string, type?: ConversationType): Promise<Conversation[]> {
    const where: Record<string, unknown> = { userId };
    if (type) where.type = type;
    return this.convRepo.find({
      where,
      order: { updatedAt: 'DESC' },
    });
  }

  async findById(id: string): Promise<Conversation | null> {
    return this.convRepo.findOne({
      where: { id },
      relations: ['messages'],
      order: { messages: { orderIndex: 'ASC' } },
    });
  }

  async update(id: string, updates: Partial<Pick<Conversation, 'title' | 'isPinned' | 'pinnedOrder' | 'status'>>): Promise<void> {
    await this.convRepo.update(id, updates);
  }

  async delete(id: string): Promise<void> {
    await this.convRepo.delete(id);
  }

  async touch(id: string): Promise<void> {
    await this.convRepo.update(id, {});
  }

  // ---- Messages ----

  async addMessage(
    conversationId: string,
    role: MessageRole,
    contentBlocks: ContentBlock[],
  ): Promise<Message> {
    const count = await this.msgRepo.count({ where: { conversationId } });
    const msg = this.msgRepo.create({
      conversationId,
      role,
      contentBlocks,
      plainText: extractPlainText(contentBlocks),
      orderIndex: count,
    });
    await this.convRepo.update(conversationId, {});
    return this.msgRepo.save(msg);
  }

  async getMessageCount(conversationId: string): Promise<number> {
    return this.msgRepo.count({ where: { conversationId } });
  }
}
