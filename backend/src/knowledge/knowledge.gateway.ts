import {
  WebSocketGateway,
  WebSocketServer,
  OnGatewayConnection,
  OnGatewayDisconnect,
} from '@nestjs/websockets';
import { Logger } from '@nestjs/common';
import { Server, Socket } from 'socket.io';

export interface AgentActivity {
  documentId: string;
  type: 'status' | 'tool_call' | 'thinking' | 'text' | 'error' | 'complete';
  message: string;
  detail?: string;
  timestamp: number;
}

@WebSocketGateway({
  namespace: '/knowledge',
  cors: { origin: '*' },
})
export class KnowledgeGateway
  implements OnGatewayConnection, OnGatewayDisconnect
{
  private readonly logger = new Logger(KnowledgeGateway.name);

  @WebSocketServer()
  server!: Server;

  handleConnection(client: Socket) {
    this.logger.debug(`Client connected: ${client.id}`);
  }

  handleDisconnect(client: Socket) {
    this.logger.debug(`Client disconnected: ${client.id}`);
  }

  emitActivity(activity: AgentActivity): void {
    this.server.emit('agent:activity', activity);
  }
}
