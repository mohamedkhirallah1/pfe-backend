import {
  OnGatewayConnection,
  OnGatewayDisconnect,
  WebSocketGateway,
  WebSocketServer,
} from '@nestjs/websockets';
import { Logger } from '@nestjs/common';
import { Server, Socket } from 'socket.io';

@WebSocketGateway({
  cors: {
    origin: '*',
  },
  transports: ['websocket'],
})
export class WebsocketBroadcastGateway
  implements OnGatewayConnection, OnGatewayDisconnect
{
  private readonly logger = new Logger(WebsocketBroadcastGateway.name);

  @WebSocketServer()
  server?: Server;

  handleConnection(client: Socket): void {
    this.logger.log(`[WS CLIENT CONNECTED] ${client.id}`);
  }

  handleDisconnect(client: Socket): void {
    this.logger.warn(`[WS CLIENT DISCONNECTED] ${client.id}`);
  }

  broadcastExternalEvent(data: unknown): void {
    if (!this.server) {
      this.logger.warn('Socket server not ready, event not broadcasted');
      return;
    }

    this.server.emit('external.event', data);
  }

  broadcastEvent(eventName: string, data: unknown): void {
    if (!this.server) {
      this.logger.warn(`Socket server not ready, event ${eventName} not broadcasted`);
      return;
    }

    this.server.emit(eventName, data);
  }

  broadcastMapUpdate(data: unknown): void {
    if (!this.server) {
      this.logger.warn('Socket server not ready, map update not broadcasted');
      return;
    }

    this.server.emit('map.updated', data);
  }
}
