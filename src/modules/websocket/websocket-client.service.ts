import { Injectable, Logger, OnModuleDestroy, OnModuleInit, Optional } from '@nestjs/common';
import { io, Socket } from 'socket.io-client';
import { RabbitMqService } from '../rabbitmq/rabbitmq.service';
import { QlogService } from '../../common/qlog/qlog.service';

@Injectable()
export class WebsocketClientService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(WebsocketClientService.name);
  private socket?: Socket;

  constructor(
    private readonly rabbitMqService: RabbitMqService,
    @Optional() private readonly qlog?: QlogService,
  ) {}

  onModuleInit(): void {
    const wsUrl = process.env.WS_SERVER_URL ?? 'http://localhost:3000';

    this.socket = io(wsUrl, {
      transports: ['websocket'],
      reconnection: true,
    });

    this.socket.on('connect', () => {
      this.qlog?.logWs({
        event: 'connected',
        clientId: this.socket?.id,
        channel: 'upstream_external',
      });
    });

    this.socket.on('disconnect', (reason) => {
      this.qlog?.logWs({
        event: 'disconnected',
        clientId: this.socket?.id,
        channel: 'upstream_external',
        metadata: { reason },
      });
    });

    this.socket.on('connect_error', (err: Error) => {
      this.qlog?.error(`[WS Upstream Error] ${err.message}`, err.stack, 'WebsocketClientService', {
        event: 'upstream_connect_error',
      });
    });

    this.socket.on('external.event', async (data: unknown) => {
      this.logger.debug('[EVENT RECEIVED] external.event from upstream');
      try {
        await this.rabbitMqService.enqueueExternalEvent({
          event: 'external.event',
          receivedAt: new Date().toISOString(),
          payload: data,
        });
      } catch (error) {
        // socket.io event handlers don't propagate async rejections anywhere useful; an
        // uncaught one here becomes an unhandledRejection that can crash the process. Log and
        // drop instead — the upstream source doesn't have a retry/ack mechanism to fall back to.
        this.qlog?.error(
          `[Event Enqueue Failed] ${(error as Error).message}`,
          (error as Error).stack,
          'WebsocketClientService',
          { event: 'enqueue_failed' },
        );
      }
    });

    this.qlog?.info(`Listening on upstream WebSocket via ${wsUrl}`, 'WebsocketClientService', {
      wsUrl,
      event: 'initialized',
    });
  }

  onModuleDestroy(): void {
    this.socket?.disconnect();
  }
}
