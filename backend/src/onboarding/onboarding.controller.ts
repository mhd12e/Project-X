import {
  Controller,
  Get,
  Post,
  Param,
  Body,
  UseGuards,
  UseInterceptors,
  UploadedFile,
  BadRequestException,
  Logger,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { diskStorage } from 'multer';
import { randomUUID } from 'crypto';
import * as path from 'path';
import { ApiTags, ApiOperation, ApiBearerAuth } from '@nestjs/swagger';
import { IsObject } from 'class-validator';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { User } from '../users/user.entity';
import { OnboardingService } from './onboarding.service';
import { KnowledgeService } from '../knowledge/knowledge.service';
import { ActivityLogService } from '../activity/activity-log.service';
import { ActivityCategory } from '../activity/activity-log.entity';
import { ALLOWED_MIME_TYPES } from '../knowledge/knowledge.constants';

class SaveStepAnswerDto {
  @IsObject()
  answer!: Record<string, unknown>;
}

@ApiTags('onboarding')
@Controller('onboarding')
@UseGuards(JwtAuthGuard)
@ApiBearerAuth()
export class OnboardingController {
  private readonly logger = new Logger(OnboardingController.name);

  constructor(
    private readonly onboardingService: OnboardingService,
    private readonly knowledgeService: KnowledgeService,
    private readonly activityLog: ActivityLogService,
  ) {}

  @Get('status')
  @ApiOperation({ summary: 'Get current onboarding progress' })
  getStatus(@CurrentUser() user: User) {
    return this.onboardingService.getStatus(user.id);
  }

  @Get('answers')
  @ApiOperation({ summary: 'Get saved onboarding answers for settings display' })
  getAnswers(@CurrentUser() user: User) {
    return this.onboardingService.getAnswers(user.id);
  }

  @Post('steps/:stepId')
  @ApiOperation({ summary: 'Save answer for an onboarding step' })
  async saveStep(
    @CurrentUser() user: User,
    @Param('stepId') stepId: string,
    @Body() dto: SaveStepAnswerDto,
  ) {
    const result = await this.onboardingService.saveStepAnswer(
      user.id,
      stepId,
      dto.answer,
    );

    // If this is the knowledge_upload step, start sequential processing
    if (stepId === 'knowledge_upload') {
      const documentIds = dto.answer['documentIds'] as string[] | undefined;
      if (documentIds && documentIds.length > 0) {
        // Process asynchronously — don't block the response
        this.onboardingService
          .processDocumentsInOrder(documentIds)
          .catch((error) => {
            this.logger.error(
              `Background onboarding document processing failed: ${error}`,
            );
          });
      }
    }

    return result;
  }

  /**
   * Upload a file during onboarding. Uses the exact same pipeline as the
   * knowledge controller but does NOT auto-start processing — that happens
   * when the user confirms the document order.
   */
  @Post('upload')
  @ApiOperation({ summary: 'Upload a document during onboarding' })
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
      limits: { fileSize: 50 * 1024 * 1024 },
      fileFilter: (_req, file, cb) => {
        if (ALLOWED_MIME_TYPES.includes(file.mimetype)) {
          cb(null, true);
        } else {
          cb(
            new BadRequestException(
              `Unsupported file type: ${file.mimetype}`,
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
      `Onboarding upload: ${file.originalname} (${file.size} bytes) by ${user.id}`,
    );

    // Reuse the shared upload handler from KnowledgeService
    const document = await this.knowledgeService.createDocumentFromFile(
      file,
      user.id,
    );

    this.activityLog
      .log({
        category: ActivityCategory.KNOWLEDGE,
        action: 'document.uploaded',
        description: `Document uploaded during onboarding (${(file.size / 1024).toFixed(1)} KB)`,
        metadata: {
          documentId: document.id,
          mimeType: file.mimetype,
          fileSize: file.size,
          source: 'onboarding',
        },
        userId: user.id,
      })
      .catch(() => {});

    return {
      id: document.id,
      title: document.title,
      originalName: file.originalname,
      mimeType: document.mimeType,
      fileSize: document.fileSize,
      status: document.status,
      createdAt: document.createdAt,
    };
  }
}
