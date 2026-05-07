import { Module } from '@nestjs/common';
import { WebsocketServerModule } from '../websocket-server/websocket-server.module';
import { EventConsumerModule } from './event-consumer.module';
import { RabbitMqService } from './rabbitmq.service';

@Module({
  imports: [WebsocketServerModule, EventConsumerModule],
  providers: [RabbitMqService],
  exports: [RabbitMqService],
})
export class RabbitMqModule {}
