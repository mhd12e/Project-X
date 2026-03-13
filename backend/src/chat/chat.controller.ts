import {
  Controller,
  Post,
  Get,
  Patch,
  Delete,
  Param,
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
import { ChatService } from './chat.service';
import { ChatAgentService } from './chat-agent.service';
import { SendMessageDto } from './dto/send-message.dto';
import { ActivityLogService } from '../activity/activity-log.service';
import { ActivityCategory } from '../activity/activity-log.entity';

@ApiTags('chat')
@Controller('chat')
@UseGuards(JwtAuthGuard, OnboardingGuard)
@ApiBearerAuth()
export class ChatController {
  private readonly logger = new Logger(ChatController.name);

  constructor(
    private readonly chatService: ChatService,
    private readonly agentService: ChatAgentService,
    private readonly activityLog: ActivityLogService,
  ) {}

  @Get('conversations')
  @ApiOperation({ summary: 'List all conversations for current user' })
  async listConversations(@CurrentUser() user: User) {
    const convs = await this.chatService.findConversationsByUser(user.id);
    return convs.map((c) => ({
      id: c.id,
      title: c.title,
      createdAt: c.createdAt,
      updatedAt: c.updatedAt,
    }));
  }

  @Post('conversations')
  @ApiOperation({ summary: 'Create a new conversation' })
  async createConversation(@CurrentUser() user: User) {
    const conv = await this.chatService.createConversation(user.id);
    this.activityLog.log({
      category: ActivityCategory.CHAT,
      action: 'conversation.created',
      description: 'New conversation started',
      metadata: { conversationId: conv.id },
      userId: user.id,
    }).catch(() => {});
    return { id: conv.id, title: conv.title, createdAt: conv.createdAt };
  }

  @Get('conversations/:id')
  @ApiOperation({ summary: 'Get conversation with messages' })
  async getConversation(
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    const conv = await this.chatService.findConversationById(id);
    if (!conv) throw new NotFoundException('Conversation not found');

    return {
      id: conv.id,
      title: conv.title,
      createdAt: conv.createdAt,
      updatedAt: conv.updatedAt,
      messages: conv.messages.map((m) => ({
        id: m.id,
        role: m.role,
        content: m.content,
        metadata: m.metadata,
        createdAt: m.createdAt,
      })),
    };
  }

  @Post('conversations/:id/messages')
  @ApiOperation({ summary: 'Send a message and get AI response (streamed via WebSocket)' })
  async sendMessage(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: SendMessageDto,
    @CurrentUser() user: User,
  ) {
    const conv = await this.chatService.findConversationById(id);
    if (!conv) throw new NotFoundException('Conversation not found');

    // Save user message
    const userMsg = await this.chatService.addMessage(id, 'user', dto.message);

    this.logger.log(`Chat message in ${id}: "${dto.message.slice(0, 80)}"`);

    this.activityLog.log({
      category: ActivityCategory.CHAT,
      action: 'message.sent',
      description: `Message sent: "${dto.message.slice(0, 80)}"`,
      metadata: { conversationId: id, messageLength: dto.message.length },
    }).catch(() => {});

    // Process async — response streams via WebSocket
    this.agentService.processMessage(id, dto.message, user.id).catch((error) => {
      this.logger.error(`Chat agent failed for ${id}: ${error}`);
    });

    return {
      id: userMsg.id,
      role: userMsg.role,
      content: userMsg.content,
      createdAt: userMsg.createdAt,
    };
  }

  @Patch('conversations/:id')
  @ApiOperation({ summary: 'Rename a conversation' })
  async renameConversation(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() body: { title: string },
  ) {
    const conv = await this.chatService.findConversationById(id);
    if (!conv) throw new NotFoundException('Conversation not found');
    await this.chatService.updateConversationTitle(id, body.title);
    return { id, title: body.title };
  }

  @Delete('conversations/:id')
  @ApiOperation({ summary: 'Delete a conversation' })
  async deleteConversation(@Param('id', ParseUUIDPipe) id: string) {
    const conv = await this.chatService.findConversationById(id);
    if (!conv) throw new NotFoundException('Conversation not found');
    await this.chatService.deleteConversation(id);
    this.activityLog.log({
      category: ActivityCategory.CHAT,
      action: 'conversation.deleted',
      description: `Conversation "${conv.title ?? 'Untitled'}" deleted`,
      metadata: { conversationId: id },
    }).catch(() => {});
    return { deleted: true };
  }
}
