import {
  WebSocketGateway,
  WebSocketServer,
  OnGatewayConnection,
  OnGatewayDisconnect,
} from '@nestjs/websockets';
import { Logger } from '@nestjs/common';
import { Server, Socket } from 'socket.io';

export interface ActivityEvent {
  id: string;
  category: string;
  level: string;
  action: string;
  description: string;
  metadata: Record<string, unknown> | null;
  userId: string | null;
  createdAt: string;
}

@WebSocketGateway({
  namespace: '/activity',
  cors: { origin: '*' },
})
export class ActivityGateway
  implements OnGatewayConnection, OnGatewayDisconnect
{
  private readonly logger = new Logger(ActivityGateway.name);

  @WebSocketServer()
  server!: Server;

  handleConnection(client: Socket) {
    this.logger.debug(`Activity client connected: ${client.id}`);
  }

  handleDisconnect(client: Socket) {
    this.logger.debug(`Activity client disconnected: ${client.id}`);
  }

  emitActivity(event: ActivityEvent): void {
    this.server.emit('activity:new', event);
  }
}
