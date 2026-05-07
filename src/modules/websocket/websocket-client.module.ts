import { Module } from '@nestjs/common';
import { RabbitMqModule } from '../rabbitmq/rabbitmq.module';
import { WebsocketClientService } from './websocket-client.service';

@Module({
  imports: [RabbitMqModule],
  providers: [WebsocketClientService],
  exports: [WebsocketClientService],
})
export class WebsocketClientModule {}
