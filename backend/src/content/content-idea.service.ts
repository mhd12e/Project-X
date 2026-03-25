import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { ContentIdea } from './content-idea.entity';

@Injectable()
export class ContentIdeaService {
  constructor(
    @InjectRepository(ContentIdea)
    private readonly ideaRepo: Repository<ContentIdea>,
  ) {}

  async create(
    conversationId: string,
    title: string,
    description: string,
    category?: string,
    metadata?: Record<string, unknown>,
  ): Promise<ContentIdea> {
    const idea = this.ideaRepo.create({
      conversationId,
      title,
      description,
      category: category ?? null,
      metadata: metadata ?? null,
    });
    return this.ideaRepo.save(idea);
  }

  async findById(id: string): Promise<ContentIdea | null> {
    return this.ideaRepo.findOne({ where: { id } });
  }

  async findByConversation(conversationId: string): Promise<ContentIdea[]> {
    return this.ideaRepo.find({
      where: { conversationId },
      order: { createdAt: 'ASC' },
    });
  }

  async findByUser(userId: string): Promise<ContentIdea[]> {
    return this.ideaRepo.find({
      where: { conversation: { userId } },
      order: { createdAt: 'DESC' },
    });
  }
}
