import {
  Controller,
  Post,
  Get,
  Delete,
  Param,
  UseGuards,
  UseInterceptors,
  UploadedFile,
  ParseUUIDPipe,
  Logger,
  BadRequestException,
  NotFoundException,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { diskStorage } from 'multer';
import { randomUUID } from 'crypto';
import * as path from 'path';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { OnboardingGuard } from '../common/guards/onboarding.guard';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { User } from '../users/user.entity';
import { KnowledgeService } from './knowledge.service';
import { KnowledgeAgentService } from './knowledge-agent.service';
import { DocumentStatus } from './knowledge-document.entity';
import { RagIngestionService } from '../retrieval/rag-ingestion.service';
import { ActivityLogService } from '../activity/activity-log.service';
import { ActivityCategory } from '../activity/activity-log.entity';
import { ALLOWED_MIME_TYPES } from './knowledge.constants';

@Controller('knowledge')
@UseGuards(JwtAuthGuard, OnboardingGuard)
export class KnowledgeController {
  private readonly logger = new Logger(KnowledgeController.name);

  constructor(
    private readonly knowledgeService: KnowledgeService,
    private readonly agentService: KnowledgeAgentService,
    private readonly ragIngestion: RagIngestionService,
    private readonly activityLog: ActivityLogService,
  ) {}

  @Post('upload')
  @UseInterceptors(
    FileInterceptor('file', {
      storage: diskStorage({
        destination: (_req, _file, cb) => {
          cb(null, process.env['UPLOAD_DIR'] ?? '/app/uploads');
        },
        filename: (_req, _file, cb) => {
          const ext = path.extname(_file.originalname);
          cb(null, `${randomUUID()}${ext}`);
        },
      }),
      limits: {
        fileSize: 50 * 1024 * 1024, // 50MB default, overridden in module
      },
      fileFilter: (_req, file, cb) => {
        if (ALLOWED_MIME_TYPES.includes(file.mimetype)) {
          cb(null, true);
        } else {
          cb(
            new BadRequestException(
              `Unsupported file type: ${file.mimetype}. Allowed: ${ALLOWED_MIME_TYPES.join(', ')}`,
            ),
            false,
          );
        }
      },
    }),
  )
  async upload(
    @UploadedFile() file: Express.Multer.File,
    @CurrentUser() user: User,
  ) {
    if (!file) {
      throw new BadRequestException('No file provided');
    }

    this.logger.log(
      `File uploaded: ${file.originalname} (${file.size} bytes) by ${user.id}`,
    );

    const document = await this.knowledgeService.createDocumentFromFile(file, user.id);

    this.activityLog.log({
      category: ActivityCategory.KNOWLEDGE,
      action: 'document.uploaded',
      description: `Document uploaded (${(file.size / 1024).toFixed(1)} KB)`,
      metadata: { documentId: document.id, mimeType: file.mimetype, fileSize: file.size },
      userId: user.id,
    }).catch(() => {});

    // Process asynchronously — don't block the upload response
    this.agentService.processDocument(document).catch((error) => {
      this.logger.error(
        `Background processing failed for ${document.id}: ${error}`,
      );
    });

    return {
      id: document.id,
      title: document.title,
      mimeType: document.mimeType,
      fileSize: document.fileSize,
      status: document.status,
      createdAt: document.createdAt,
    };
  }

  @Get('documents')
  async listDocuments() {
    const docs = await this.knowledgeService.findAllDocuments();
    return docs.map((d) => ({
      id: d.id,
      title: d.title,
      mimeType: d.mimeType,
      fileSize: d.fileSize,
      status: d.status,
      summary: d.summary,
      topics: d.topics,
      error: d.error,
      uploadedBy: d.uploadedBy
        ? { id: d.uploadedBy.id, name: d.uploadedBy.name }
        : null,
      createdAt: d.createdAt,
      updatedAt: d.updatedAt,
    }));
  }

  @Get('documents/:id')
  async getDocument(@Param('id', ParseUUIDPipe) id: string) {
    const doc = await this.knowledgeService.findDocumentById(id);
    if (!doc) {
      throw new NotFoundException('Document not found');
    }

    return {
      id: doc.id,
      title: doc.title,
      mimeType: doc.mimeType,
      fileSize: doc.fileSize,
      status: doc.status,
      summary: doc.summary,
      topics: doc.topics,
      error: doc.error,
      uploadedBy: doc.uploadedBy
        ? { id: doc.uploadedBy.id, name: doc.uploadedBy.name }
        : null,
      chunks: doc.chunks?.map((c) => ({
        id: c.id,
        section: c.section,
        contentType: c.contentType,
        topic: c.topic,
        content: c.content,
        orderIndex: c.orderIndex,
      })),
      createdAt: doc.createdAt,
      updatedAt: doc.updatedAt,
    };
  }

  @Post('documents/:id/reprocess')
  async reprocessDocument(@Param('id', ParseUUIDPipe) id: string) {
    const doc = await this.knowledgeService.findDocumentById(id);
    if (!doc) {
      throw new NotFoundException('Document not found');
    }

    await this.knowledgeService.updateDocumentStatus(doc.id, DocumentStatus.PENDING);

    this.agentService.processDocument(doc).catch((error) => {
      this.logger.error(
        `Background reprocessing failed for ${doc.id}: ${error}`,
      );
    });

    return { id: doc.id, status: 'pending' };
  }

  @Delete('documents/:id')
  async deleteDocument(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser() user: User,
  ) {
    const doc = await this.knowledgeService.findDocumentById(id);
    if (!doc) {
      throw new NotFoundException('Document not found');
    }

    await this.ragIngestion.removeDocument(id);
    await this.knowledgeService.deleteDocument(id);

    // Clean up the uploaded file from disk
    if (doc.filePath) {
      const fs = await import('fs/promises');
      try {
        await fs.unlink(doc.filePath);
      } catch {
        this.logger.warn(`Failed to delete file: ${doc.filePath}`);
      }
    }

    this.activityLog.log({
      category: ActivityCategory.KNOWLEDGE,
      action: 'document.deleted',
      description: `Document "${doc.title ?? 'Untitled'}" deleted`,
      metadata: { documentId: id, title: doc.title },
      userId: user.id,
    }).catch(() => {});

    return { deleted: true };
  }
}
