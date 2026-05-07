import { Module } from '@nestjs/common';
import { WebsocketBroadcastGateway } from './websocket-broadcast.gateway';

@Module({
  providers: [WebsocketBroadcastGateway],
  exports: [WebsocketBroadcastGateway],
})
export class WebsocketServerModule {}
