import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import * as path from 'path';
import * as fs from 'fs';
import { KnowledgeDocument, DocumentStatus } from './knowledge-document.entity';
import { KnowledgeChunk } from './knowledge-chunk.entity';
import { KnowledgeConversation } from './knowledge-conversation.entity';

@Injectable()
export class KnowledgeService {
  private readonly logger = new Logger(KnowledgeService.name);

  constructor(
    @InjectRepository(KnowledgeDocument)
    private readonly documentRepo: Repository<KnowledgeDocument>,
    @InjectRepository(KnowledgeChunk)
    private readonly chunkRepo: Repository<KnowledgeChunk>,
    @InjectRepository(KnowledgeConversation)
    private readonly conversationRepo: Repository<KnowledgeConversation>,
  ) {}

  /**
   * Shared upload handler: creates the document record and renames the file
   * on disk. Used by both the knowledge controller and onboarding controller
   * so any pipeline changes apply everywhere.
   */
  async createDocumentFromFile(
    file: Express.Multer.File,
    userId: string,
  ): Promise<KnowledgeDocument> {
    const ext = path.extname(file.originalname);
    const document = await this.createDocument({
      filename: `upload${ext}`,
      mimeType: file.mimetype,
      fileSize: file.size,
      filePath: file.path,
      uploadedById: userId,
    });

    // Rename file on disk to {documentId}{ext} for organized storage
    const storageName = `${document.id}${ext}`;
    const organizedPath = path.join(path.dirname(file.path), storageName);
    try {
      fs.renameSync(file.path, organizedPath);
      document.filename = storageName;
      document.filePath = organizedPath;
      await this.updateFilePath(document.id, organizedPath);
      await this.updateFilename(document.id, storageName);
    } catch {
      this.logger.warn(`Failed to rename uploaded file for ${document.id}`);
    }

    return document;
  }

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
