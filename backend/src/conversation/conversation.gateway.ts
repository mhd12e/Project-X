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

    // Replay from blocks (which contain the authoritative state including toolResult)
    for (const block of gen.blocks) {
      if (block.type === 'tool_call') {
        client.emit('conversation:stream', {
          conversationId,
          type: 'tool_call',
          toolName: block.toolName,
          toolInput: block.toolInput,
          description: block.description,
          timestamp: Date.now(),
        } satisfies StreamEvent);
        // If the tool already has a result, send it immediately
        if (block.toolResult) {
          client.emit('conversation:stream', {
            conversationId,
            type: 'tool_result',
            toolName: block.toolName,
            toolResult: block.toolResult,
            timestamp: Date.now(),
          } satisfies StreamEvent);
        }
      } else if (block.type === 'thinking') {
        client.emit('conversation:stream', {
          conversationId,
          type: 'thinking',
          content: block.text,
          timestamp: Date.now(),
        } satisfies StreamEvent);
      } else if (block.type === 'source') {
        client.emit('conversation:stream', {
          conversationId,
          type: 'source',
          source: {
            documentId: block.documentId,
            sourceFile: block.sourceFile,
            section: block.section,
            topic: block.topic,
            score: block.score,
          },
          timestamp: Date.now(),
        } satisfies StreamEvent);
      } else if (block.type === 'idea_generated') {
        client.emit('conversation:stream', {
          conversationId,
          type: 'idea_generated',
          idea: { id: block.ideaId, title: block.title, description: block.description, category: block.category },
          timestamp: Date.now(),
        } satisfies StreamEvent);
      }
    }

    // Replay accumulated text as a single delta
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
