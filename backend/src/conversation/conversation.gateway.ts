import {
  WebSocketGateway,
  WebSocketServer,
  SubscribeMessage,
  OnGatewayConnection,
  OnGatewayDisconnect,
} from '@nestjs/websockets';
import { Logger } from '@nestjs/common';
import { Server, Socket } from 'socket.io';
import type { ContentBlock } from './content-block.types';

export interface StreamEvent {
  conversationId: string;
  type:
    | 'text_delta'
    | 'tool_call'
    | 'tool_result'
    | 'source'
    | 'thinking'
    | 'status'
    | 'error'
    | 'done'
    | 'title_updated'
    | 'idea_generated'
    | 'image_generating'
    | 'image_complete'
    | 'image_error';
  content?: string;
  toolName?: string;
  toolInput?: string;
  toolResult?: string;
  description?: string;
  source?: {
    documentId: string;
    sourceFile: string;
    section: string;
    topic: string;
    score: number;
  };
  idea?: { id: string; title: string; description: string; category?: string };
  imageId?: string;
  imageUrl?: string;
  messageId?: string;
  timestamp: number;
}

export interface ActiveGeneration {
  text: string;
  blocks: ContentBlock[];
  activities: Array<Record<string, unknown>>;
}

/** Registry for active generations — agents register here, gateway reads for replay */
const activeGenerations = new Map<string, ActiveGeneration>();

export function getActiveGeneration(conversationId: string): ActiveGeneration | null {
  return activeGenerations.get(conversationId) ?? null;
}

export function setActiveGeneration(conversationId: string, gen: ActiveGeneration): void {
  activeGenerations.set(conversationId, gen);
}

export function deleteActiveGeneration(conversationId: string): void {
  activeGenerations.delete(conversationId);
}

@WebSocketGateway({
  namespace: '/conversation',
  cors: { origin: '*' },
})
export class ConversationGateway
  implements OnGatewayConnection, OnGatewayDisconnect
{
  private readonly logger = new Logger(ConversationGateway.name);

  @WebSocketServer()
  server!: Server;

  handleConnection(client: Socket) {
    this.logger.debug(`Client connected: ${client.id}`);
  }

  handleDisconnect(client: Socket) {
    this.logger.debug(`Client disconnected: ${client.id}`);
  }

  @SubscribeMessage('conversation:subscribe')
  handleSubscribe(client: Socket, conversationId: string): void {
    const gen = getActiveGeneration(conversationId);
    if (!gen) return;

    this.logger.debug(`Replaying active generation for ${conversationId} to ${client.id}`);

    for (const act of gen.activities) {
      client.emit('conversation:stream', {
        conversationId,
        type: act.type as StreamEvent['type'],
        toolName: act.toolName as string | undefined,
        toolInput: act.toolInput as string | undefined,
        description: act.description as string | undefined,
        idea: act.idea as StreamEvent['idea'] | undefined,
        timestamp: Date.now(),
      } satisfies StreamEvent);
    }

    if (gen.text) {
      client.emit('conversation:stream', {
        conversationId,
        type: 'text_delta',
        content: gen.text,
        timestamp: Date.now(),
      } satisfies StreamEvent);
    }

    client.emit('conversation:stream', {
      conversationId,
      type: 'status',
      content: 'Generating...',
      timestamp: Date.now(),
    } satisfies StreamEvent);
  }

  emit(event: StreamEvent): void {
    this.server.emit('conversation:stream', event);
  }
}
