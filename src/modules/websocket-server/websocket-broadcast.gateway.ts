import {
  OnGatewayConnection,
  OnGatewayDisconnect,
  WebSocketGateway,
  WebSocketServer,
} from '@nestjs/websockets';
import { Logger, Optional } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import { Server, Socket } from 'socket.io';
import { QlogService } from '../../common/qlog/qlog.service';

const defaultAllowedWsOrigins = [
  'http://localhost:5174',
  'http://localhost:5173',
  'http://localhost:3000',
  'http://localhost:3001',
  'http://127.0.0.1:5174',
  'http://127.0.0.1:5173',
  'http://127.0.0.1:3000',
  'http://127.0.0.1:3001',
  'http://192.168.1.80:5174',
  'http://192.168.1.80:5173',
  'http://192.168.1.80:3000',
  'http://192.168.1.80:3001',
  'http://192.168.1.81:5174',
  'http://192.168.1.81:5173',
  'http://192.168.1.81:3000',
  'http://192.168.1.81:3001',
];

const envWsOrigins = (process.env.WS_CORS_ORIGIN ?? '')
  .split(',')
  .map((origin) => origin.trim())
  .filter(Boolean);

const allowedWsOrigins = Array.from(new Set([...defaultAllowedWsOrigins, ...envWsOrigins]));

const allowedWsOriginPatterns = [
  /^http:\/\/localhost:(3000|3001|5173|5174|5175|4173)$/,
  /^http:\/\/127\.0\.0\.1:(3000|3001|5173|5174|5175|4173)$/,
  /^http:\/\/192\.168\.\d+\.\d+:(3000|3001|5173|5174|5175|4173)$/,
  /^http:\/\/172\.\d+\.\d+\.\d+:(3000|3001|5173|5174|5175|4173)$/,
  /^http:\/\/10\.0\.2\.2:(3000|3001|5173|5174|5175|4173)$/,
];

@WebSocketGateway({
  cors: {
    origin: (requestOrigin: any, callback: any) => {
      if (!requestOrigin) return callback(null, true);
      if (
        allowedWsOrigins.includes(requestOrigin) ||
        allowedWsOriginPatterns.some((pattern) => pattern.test(requestOrigin))
      ) {
        return callback(null, true);
      }
      return callback(null, false);
    },
    credentials: true,
  },
  transports: ['websocket', 'polling'],
})
export class WebsocketBroadcastGateway
  implements OnGatewayConnection, OnGatewayDisconnect
{
  private readonly logger = new Logger(WebsocketBroadcastGateway.name);

  constructor(
    private readonly jwtService: JwtService,
    private readonly configService: ConfigService,
    @Optional() private readonly qlog?: QlogService,
  ) {}

  @WebSocketServer()
  server?: Server;

  handleConnection(client: Socket): void {
    const token = this.extractToken(client);

    if (!token) {
      this.qlog?.logWs({
        event: 'auth_failed',
        clientId: client.id,
        error: 'Missing auth token',
      });
      client.disconnect(true);
      return;
    }

    try {
      const payload = this.jwtService.verify(token, {
        secret: this.configService.get<string>('JWT_SECRET'),
      });
      client.data.user = payload;

      if (payload.role === 'ADMIN') {
        client.join('admin');
      } else if (payload.role === 'RESPONSABLE_ZONE' && payload.zoneId) {
        client.join(`zone:${payload.zoneId}`);
      } else if (payload.role === 'SERVICE_CLIENT') {
        client.join('service_client');
      }

      this.qlog?.logWs({
        event: 'connected',
        clientId: client.id,
        userId: payload.sub,
        role: payload.role,
        zoneId: payload.zoneId,
      });
    } catch (error) {
      this.qlog?.logWs({
        event: 'auth_failed',
        clientId: client.id,
        error: (error as Error).message,
      });
      client.disconnect(true);
    }
  }

  handleDisconnect(client: Socket): void {
    const user = client.data?.user;
    this.qlog?.logWs({
      event: 'disconnected',
      clientId: client.id,
      userId: user?.sub,
      role: user?.role,
      zoneId: user?.zoneId,
    });
  }

  private extractToken(client: Socket): string | null {
    const authToken = client.handshake.auth?.token as string | undefined;
    if (authToken) {
      return authToken;
    }

    const header = client.handshake.headers.authorization;
    if (typeof header === 'string' && header.startsWith('Bearer ')) {
      return header.slice('Bearer '.length);
    }

    const queryToken = client.handshake.query?.token;
    if (typeof queryToken === 'string') {
      return queryToken;
    }

    return null;
  }

  broadcastExternalEvent(data: unknown): void {
    if (!this.server) {
      this.logger.warn('Socket server not ready, event not broadcasted');
      this.qlog?.warn('Socket server not ready, event not broadcasted', 'WebsocketBroadcastGateway');
      return;
    }

    const socketCount = this.server.sockets?.sockets?.size ?? 0;
    this.logger.log(`[WS GATEWAY] Broadcasting external.event to ${socketCount} connected socket(s)`);
    this.server.emit('external.event', data);
    this.qlog?.logWs({
      event: 'broadcast',
      channel: 'external.event',
    });
  }

  broadcastEvent(eventName: string, data: unknown): void {
    if (!this.server) {
      this.logger.warn(`Socket server not ready, event ${eventName} not broadcasted`);
      this.qlog?.warn(`Socket server not ready, event ${eventName} not broadcasted`, 'WebsocketBroadcastGateway');
      return;
    }

    const socketCount = this.server.sockets?.sockets?.size ?? 0;
    this.logger.log(`[WS GATEWAY] Broadcasting ${eventName} to ${socketCount} connected socket(s)`);
    this.server.emit(eventName, data);
    this.qlog?.logWs({
      event: 'broadcast',
      channel: eventName,
    });
  }

  broadcastMapUpdate(data: unknown): void {
    if (!this.server) {
      this.logger.warn('Socket server not ready, map update not broadcasted');
      this.qlog?.warn('Socket server not ready, map update not broadcasted', 'WebsocketBroadcastGateway');
      return;
    }

    const socketCount = this.server.sockets?.sockets?.size ?? 0;
    this.logger.log(`[WS GATEWAY] Broadcasting map.updated to ${socketCount} connected socket(s)`);
    this.server.emit('map.updated', data);
    this.qlog?.logWs({
      event: 'broadcast',
      channel: 'map.updated',
    });
  }

  broadcastToZone(eventName: string, zoneId: string, data: unknown): void {
    if (!this.server) {
      this.qlog?.warn(`Socket server not ready, event ${eventName} not broadcasted`, 'WebsocketBroadcastGateway');
      return;
    }

    this.server.to(`zone:${zoneId}`).to('admin').emit(eventName, data);
    this.qlog?.logWs({
      event: 'broadcast',
      channel: eventName,
      zoneId,
    });
  }
}
