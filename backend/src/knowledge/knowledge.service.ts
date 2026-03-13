import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { KnowledgeDocument, DocumentStatus } from './knowledge-document.entity';
import { KnowledgeChunk } from './knowledge-chunk.entity';
import { KnowledgeConversation } from './knowledge-conversation.entity';

@Injectable()
export class KnowledgeService {
  constructor(
    @InjectRepository(KnowledgeDocument)
    private readonly documentRepo: Repository<KnowledgeDocument>,
    @InjectRepository(KnowledgeChunk)
    private readonly chunkRepo: Repository<KnowledgeChunk>,
    @InjectRepository(KnowledgeConversation)
    private readonly conversationRepo: Repository<KnowledgeConversation>,
  ) {}

  async createDocument(data: Partial<KnowledgeDocument>): Promise<KnowledgeDocument> {
    const doc = this.documentRepo.create(data);
    return this.documentRepo.save(doc);
  }

  async findAllDocuments(): Promise<KnowledgeDocument[]> {
    return this.documentRepo.find({
      order: { createdAt: 'DESC' },
      relations: ['uploadedBy'],
    });
  }

  async findDocumentById(id: string): Promise<KnowledgeDocument | null> {
    return this.documentRepo.findOne({
      where: { id },
      relations: ['chunks', 'uploadedBy'],
    });
  }

  async updateDocumentStatus(
    id: string,
    status: DocumentStatus,
    error?: string,
  ): Promise<void> {
    await this.documentRepo.update(id, { status, error: error ?? null });
  }

  async updateDocumentMetadata(
    id: string,
    summary: string,
    topics: string[],
  ): Promise<void> {
    await this.documentRepo.update(id, {
      summary,
      topics,
      status: DocumentStatus.COMPLETED,
    });
  }

  async updateDocumentTitle(id: string, title: string): Promise<void> {
    await this.documentRepo.update(id, { title });
  }

  async updateFilePath(id: string, filePath: string): Promise<void> {
    await this.documentRepo.update(id, { filePath });
  }

  async updateFilename(id: string, filename: string): Promise<void> {
    await this.documentRepo.update(id, { filename });
  }

  async createChunk(data: Partial<KnowledgeChunk>): Promise<KnowledgeChunk> {
    const chunk = this.chunkRepo.create(data);
    return this.chunkRepo.save(chunk);
  }

  async findChunksByDocumentId(documentId: string): Promise<KnowledgeChunk[]> {
    return this.chunkRepo.find({
      where: { documentId },
      order: { orderIndex: 'ASC' },
    });
  }

  async deleteDocument(id: string): Promise<void> {
    await this.documentRepo.delete(id);
  }

  async getKnowledgeSummary(): Promise<string> {
    const docs = await this.documentRepo.find({
      where: { status: DocumentStatus.COMPLETED },
      select: ['id', 'title', 'summary', 'topics', 'createdAt'],
      order: { createdAt: 'ASC' },
    });

    if (docs.length === 0) {
      return 'No documents have been processed yet. This is the first document in the knowledge base.';
    }

    const lines = docs.map(
      (d) =>
        `- "${d.title ?? 'Untitled'}" (${d.id}): ${d.summary ?? 'No summary'} | Topics: ${(d.topics ?? []).join(', ')}`,
    );

    return `Existing knowledge base (${docs.length} documents):\n${lines.join('\n')}`;
  }

  async saveConversationTurn(role: string, content: string): Promise<void> {
    const count = await this.conversationRepo.count();
    const turn = this.conversationRepo.create({
      role,
      content,
      orderIndex: count,
    });
    await this.conversationRepo.save(turn);
  }

  async getConversationHistory(): Promise<Array<{ role: string; content: string }>> {
    const turns = await this.conversationRepo.find({
      order: { orderIndex: 'ASC' },
    });
    return turns.map((t) => ({ role: t.role, content: t.content }));
  }
}
