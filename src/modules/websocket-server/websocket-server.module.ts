import { Module } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtModule } from '@nestjs/jwt';
import { getRequiredJwtSecret } from '../../common/config/jwt-secret.util';
import { WebsocketBroadcastGateway } from './websocket-broadcast.gateway';

@Module({
  imports: [
    JwtModule.registerAsync({
      inject: [ConfigService],
      useFactory: (configService: ConfigService) => ({
        secret: getRequiredJwtSecret(configService),
      }),
    }),
  ],
  providers: [WebsocketBroadcastGateway],
  exports: [WebsocketBroadcastGateway],
})
export class WebsocketServerModule {}
