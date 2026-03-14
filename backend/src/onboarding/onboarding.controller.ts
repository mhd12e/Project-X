import {
  Controller,
  Get,
  Post,
  Param,
  Body,
  Res,
  UseGuards,
  UseInterceptors,
  UploadedFile,
  BadRequestException,
  Logger,
} from '@nestjs/common';
import type { Response } from 'express';
import { FileInterceptor } from '@nestjs/platform-express';
import { diskStorage } from 'multer';
import { randomUUID } from 'crypto';
import * as path from 'path';
import { ApiTags, ApiOperation, ApiBearerAuth } from '@nestjs/swagger';
import { IsObject, IsString } from 'class-validator';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { User } from '../users/user.entity';
import { OnboardingService } from './onboarding.service';
import { ClaudeOAuthService } from './claude-oauth.service';
import { KnowledgeService } from '../knowledge/knowledge.service';
import { ActivityLogService } from '../activity/activity-log.service';
import { ActivityCategory } from '../activity/activity-log.entity';
import { ALLOWED_MIME_TYPES } from '../knowledge/knowledge.constants';

class SaveStepAnswerDto {
  @IsObject()
  answer!: Record<string, unknown>;
}

class SubmitClaudeCodeDto {
  @IsString()
  code!: string;
}

@ApiTags('onboarding')
@Controller('onboarding')
@UseGuards(JwtAuthGuard)
@ApiBearerAuth()
export class OnboardingController {
  private readonly logger = new Logger(OnboardingController.name);

  constructor(
    private readonly onboardingService: OnboardingService,
    private readonly claudeOAuth: ClaudeOAuthService,
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
          .processDocumentsInOrder(documentIds, user.id)
          .catch((error) => {
            this.logger.error(
              `Background onboarding document processing failed: ${error}`,
            );
          });
      }
    }

    return result;
  }

  // ─── Claude OAuth flow ───

  @Get('claude-oauth/status')
  @ApiOperation({ summary: 'Check if Claude OAuth token is already configured' })
  getClaudeOAuthStatus() {
    return { configured: this.claudeOAuth.isConfigured() };
  }

  @Post('claude-oauth/initiate')
  @ApiOperation({ summary: 'Start Claude OAuth flow — spawns setup-token and returns URL' })
  async initiateClaudeOAuth(@CurrentUser() user: User) {
    this.logger.log(`Starting Claude OAuth flow for user ${user.id}`);
    return this.claudeOAuth.initiateOAuth(user.id);
  }

  @Post('claude-oauth/submit-code')
  @ApiOperation({ summary: 'Submit the OAuth authorization code' })
  async submitClaudeOAuthCode(
    @CurrentUser() user: User,
    @Body() dto: SubmitClaudeCodeDto,
  ) {
    const result = await this.claudeOAuth.submitCode(user.id, dto.code);
    if (result.success) {
      // Auto-save the step as completed
      await this.onboardingService.saveStepAnswer(user.id, 'claude_signin', {
        completed: true,
      });
    }
    const oauthToken = result.success ? (process.env['CLAUDE_CODE_OAUTH_TOKEN'] ?? '') : '';
    return { ...result, oauthToken };
  }

  @Post('claude-oauth/cancel')
  @ApiOperation({ summary: 'Cancel an ongoing Claude OAuth session' })
  cancelClaudeOAuth(@CurrentUser() user: User) {
    this.claudeOAuth.cancel(user.id);
    return { ok: true };
  }

  @Get('claude-oauth/test-token')
  @ApiOperation({ summary: 'Test the Claude token with a minimal Agent SDK call (SSE)' })
  async testToken(@Res() res: Response) {
    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache');
    res.setHeader('Connection', 'keep-alive');
    res.flushHeaders();

    if (!this.claudeOAuth.isConfigured()) {
      res.write(`data: ${JSON.stringify({ type: 'error', text: 'No Claude token configured.' })}\n\n`);
      res.write('data: [DONE]\n\n');
      res.end();
      return;
    }

    try {
      const { query } = await import('@anthropic-ai/claude-agent-sdk');

      for await (const message of query({
        prompt: 'Hello! Tell me about yourself in 2-3 sentences.',
        options: {
          maxTurns: 1,
          permissionMode: 'bypassPermissions' as const,
          allowDangerouslySkipPermissions: true,
          tools: [],
          cwd: '/app',
        },
      })) {
        const msg = message as Record<string, unknown>;

        if (msg.type === 'stream_event') {
          const event = msg.event as Record<string, unknown>;
          if (event.type === 'content_block_delta') {
            const delta = event.delta as Record<string, unknown>;
            if (delta.type === 'text_delta' && typeof delta.text === 'string') {
              res.write(`data: ${JSON.stringify({ type: 'delta', text: delta.text })}\n\n`);
            }
          }
        }

        if ('result' in msg && typeof msg.result === 'string' && msg.result) {
          res.write(`data: ${JSON.stringify({ type: 'result', text: msg.result })}\n\n`);
        }
      }
    } catch (err) {
      const errMsg = err instanceof Error ? err.message : 'Unknown error';
      this.logger.error(`Token test failed: ${errMsg}`);
      res.write(`data: ${JSON.stringify({ type: 'error', text: errMsg })}\n\n`);
    }

    res.write('data: [DONE]\n\n');
    res.end();
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
