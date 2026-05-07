import { Injectable, Logger, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { io, Socket } from 'socket.io-client';
import { RabbitMqService } from '../rabbitmq';

@Injectable()
export class WebsocketClientService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(WebsocketClientService.name);
  private socket?: Socket;

  constructor(private readonly rabbitMqService: RabbitMqService) {}

  onModuleInit(): void {
    const wsUrl = process.env.WS_SERVER_URL ?? 'http://localhost:3000';

    this.socket = io(wsUrl, {
      transports: ['websocket'],
      reconnection: true,
    });

    this.socket.on('connect', () => {
      this.logger.log(`[WS OK] connected: ${this.socket?.id}`);
    });

    this.socket.on('disconnect', (reason) => {
      this.logger.warn(`[WS DISCONNECT] ${reason}`);
    });

    this.socket.on('connect_error', (err: Error) => {
      this.logger.error(`[WS ERROR] ${err.message}`);
    });

    this.socket.on('external.event', async (data: unknown) => {
      this.logger.log(`[EVENT RECEIVED] ${JSON.stringify(data)}`);
      await this.rabbitMqService.enqueueExternalEvent({
        event: 'external.event',
        receivedAt: new Date().toISOString(),
        payload: data,
      });
    });

    this.logger.log(`Listening on event: external.event via ${wsUrl}`);
  }

  onModuleDestroy(): void {
    this.socket?.disconnect();
  }
}
