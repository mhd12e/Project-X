import {
  WebSocketGateway,
  WebSocketServer,
  SubscribeMessage,
  OnGatewayConnection,
  OnGatewayDisconnect,
} from '@nestjs/websockets';
import { Inject, Logger, forwardRef } from '@nestjs/common';
import { Server, Socket } from 'socket.io';
import { ChatAgentService } from './chat-agent.service';

export interface ChatStreamEvent {
  conversationId: string;
  type: 'text_delta' | 'tool_call' | 'tool_result' | 'source' | 'thinking' | 'status' | 'error' | 'done' | 'title_updated';
  content?: string;
  /** For tool_call: tool name */
  toolName?: string;
  /** For tool_call: raw tool input JSON string */
  toolInput?: string;
  /** For tool_call: tool result summary */
  toolResult?: string;
  /** For tool_call: human-readable description */
  description?: string;
  /** For source: source reference */
  source?: {
    documentId: string;
    sourceFile: string;
    section: string;
    topic: string;
    score: number;
  };
  /** Message ID once the full response is saved */
  messageId?: string;
  timestamp: number;
}

@WebSocketGateway({
  namespace: '/chat',
  cors: { origin: '*' },
})
export class ChatGateway
  implements OnGatewayConnection, OnGatewayDisconnect
{
  private readonly logger = new Logger(ChatGateway.name);

  @WebSocketServer()
  server!: Server;

  constructor(
    @Inject(forwardRef(() => ChatAgentService))
    private readonly agentService: ChatAgentService,
  ) {}

  handleConnection(client: Socket) {
    this.logger.debug(`Chat client connected: ${client.id}`);
  }

  handleDisconnect(client: Socket) {
    this.logger.debug(`Chat client disconnected: ${client.id}`);
  }

  /**
   * Client subscribes to a conversation. If an AI response is currently being
   * generated for that conversation, replay the buffered text and activities
   * so the client catches up with the in-flight stream.
   */
  @SubscribeMessage('chat:subscribe')
  handleSubscribe(client: Socket, conversationId: string): void {
    const gen = this.agentService.getActiveGeneration(conversationId);
    if (!gen) return;

    this.logger.debug(`Replaying active generation for ${conversationId} to ${client.id}`);

    // Replay accumulated activities (tool calls, etc.)
    for (const act of gen.activities) {
      client.emit('chat:stream', {
        conversationId,
        type: act.type as ChatStreamEvent['type'],
        toolName: act.toolName as string | undefined,
        toolInput: act.toolInput as string | undefined,
        description: act.description as string | undefined,
        timestamp: Date.now(),
      } satisfies ChatStreamEvent);
    }

    // Replay accumulated text as a single delta
    if (gen.text) {
      client.emit('chat:stream', {
        conversationId,
        type: 'text_delta',
        content: gen.text,
        timestamp: Date.now(),
      } satisfies ChatStreamEvent);
    }

    // Send a status so the frontend knows generation is in progress
    client.emit('chat:stream', {
      conversationId,
      type: 'status',
      content: 'Generating...',
      timestamp: Date.now(),
    } satisfies ChatStreamEvent);
  }

  emit(event: ChatStreamEvent): void {
    this.server.emit('chat:stream', event);
  }
}
