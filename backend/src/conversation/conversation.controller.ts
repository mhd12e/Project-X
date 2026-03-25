import {
  Controller,
  Post,
  Get,
  Patch,
  Delete,
  Param,
  Query,
  Body,
  UseGuards,
  ParseUUIDPipe,
  NotFoundException,
  Logger,
} from '@nestjs/common';
import { ApiTags, ApiOperation, ApiBearerAuth } from '@nestjs/swagger';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { OnboardingGuard } from '../common/guards/onboarding.guard';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { User } from '../users/user.entity';
import { ConversationService } from './conversation.service';
import { ConversationType } from './conversation.entity';
import { ChatAgentService } from './agents/chat-agent.service';
import { ContentAgentService } from './agents/content-agent.service';
import { CreateConversationDto } from './dto/create-conversation.dto';
import { SendMessageDto } from './dto/send-message.dto';
import { UpdateConversationDto } from './dto/update-conversation.dto';
import { ActivityLogService } from '../activity/activity-log.service';
import { ActivityCategory } from '../activity/activity-log.entity';

@ApiTags('conversations')
@Controller('conversations')
@UseGuards(JwtAuthGuard, OnboardingGuard)
@ApiBearerAuth()
export class ConversationController {
  private readonly logger = new Logger(ConversationController.name);

  constructor(
    private readonly conversationService: ConversationService,
    private readonly chatAgent: ChatAgentService,
    private readonly contentAgent: ContentAgentService,
    private readonly activityLog: ActivityLogService,
  ) {}

  @Get()
  @ApiOperation({ summary: 'List conversations (optionally filter by type)' })
  async list(
    @CurrentUser() user: User,
    @Query('type') type?: string,
  ) {
    const conversations = await this.conversationService.findByUser(
      user.id,
      type as ConversationType | undefined,
    );
    return conversations.map((c) => ({
      id: c.id,
      type: c.type,
      title: c.title,
      isPinned: c.isPinned,
      pinnedOrder: c.pinnedOrder,
      status: c.status,
      createdAt: c.createdAt,
      updatedAt: c.updatedAt,
    }));
  }

  @Post()
  @ApiOperation({ summary: 'Create a conversation and optionally send the first message' })
  async create(@CurrentUser() user: User, @Body() dto: CreateConversationDto) {
    const conv = await this.conversationService.create(user.id, dto.type, dto.title);

    this.activityLog.log({
      category: dto.type === ConversationType.CHAT ? ActivityCategory.CHAT : ActivityCategory.CONTENT,
      action: 'conversation.created',
      description: `New ${dto.type} conversation started`,
      metadata: { conversationId: conv.id, type: dto.type },
      userId: user.id,
    }).catch(() => {});

    // If a message is included (content brainstorm), save and process it
    if (dto.message) {
      const userMsg = await this.conversationService.addMessage(conv.id, 'user', [{ type: 'text', text: dto.message }]);

      const agent = dto.type === ConversationType.CONTENT ? this.contentAgent : this.chatAgent;
      agent.processMessage(conv.id, dto.message, user.id).catch((err) => {
        this.logger.error(`Agent failed for ${conv.id}: ${err}`);
      });

      return {
        id: conv.id,
        type: conv.type,
        title: conv.title,
        isPinned: conv.isPinned,
        status: conv.status,
        createdAt: conv.createdAt,
        updatedAt: conv.createdAt,
        messages: [{
          id: userMsg.id,
          role: userMsg.role,
          contentBlocks: userMsg.contentBlocks,
          plainText: userMsg.plainText,
          createdAt: userMsg.createdAt,
        }],
      };
    }

    return {
      id: conv.id,
      type: conv.type,
      title: conv.title,
      isPinned: conv.isPinned,
      status: conv.status,
      createdAt: conv.createdAt,
      updatedAt: conv.createdAt,
    };
  }

  @Get(':id')
  @ApiOperation({ summary: 'Get conversation with messages' })
  async getOne(@Param('id', ParseUUIDPipe) id: string) {
    const conv = await this.conversationService.findById(id);
    if (!conv) throw new NotFoundException('Conversation not found');

    return {
      id: conv.id,
      type: conv.type,
      title: conv.title,
      isPinned: conv.isPinned,
      pinnedOrder: conv.pinnedOrder,
      status: conv.status,
      createdAt: conv.createdAt,
      updatedAt: conv.updatedAt,
      messages: conv.messages.map((m) => ({
        id: m.id,
        role: m.role,
        contentBlocks: m.contentBlocks,
        plainText: m.plainText,
        createdAt: m.createdAt,
      })),
    };
  }

  @Post(':id/messages')
  @ApiOperation({ summary: 'Send a message (AI response streamed via WebSocket)' })
  async sendMessage(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: SendMessageDto,
    @CurrentUser() user: User,
  ) {
    const conv = await this.conversationService.findById(id);
    if (!conv) throw new NotFoundException('Conversation not found');

    const userMsg = await this.conversationService.addMessage(id, 'user', [{ type: 'text', text: dto.message }]);

    this.logger.log(`Message in ${id} (${conv.type}): "${dto.message.slice(0, 80)}"`);

    const agent = conv.type === ConversationType.CONTENT ? this.contentAgent : this.chatAgent;
    agent.processMessage(id, dto.message, user.id).catch((err) => {
      this.logger.error(`Agent failed for ${id}: ${err}`);
    });

    return {
      id: userMsg.id,
      role: userMsg.role,
      contentBlocks: userMsg.contentBlocks,
      plainText: userMsg.plainText,
      createdAt: userMsg.createdAt,
    };
  }

  @Patch(':id')
  @ApiOperation({ summary: 'Update conversation (rename, pin, etc.)' })
  async update(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateConversationDto,
  ) {
    const conv = await this.conversationService.findById(id);
    if (!conv) throw new NotFoundException('Conversation not found');
    await this.conversationService.update(id, dto);
    return { id, ...dto };
  }

  @Delete(':id')
  @ApiOperation({ summary: 'Delete a conversation' })
  async remove(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser() user: User,
  ) {
    const conv = await this.conversationService.findById(id);
    if (!conv) throw new NotFoundException('Conversation not found');
    await this.conversationService.delete(id);
    this.activityLog.log({
      category: conv.type === ConversationType.CHAT ? ActivityCategory.CHAT : ActivityCategory.CONTENT,
      action: 'conversation.deleted',
      description: `Conversation "${conv.title ?? 'Untitled'}" deleted`,
      metadata: { conversationId: id },
      userId: user.id,
    }).catch(() => {});
    return { deleted: true };
  }
}
