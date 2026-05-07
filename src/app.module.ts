import { MiddlewareConsumer, Module, NestModule } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { MongooseModule } from '@nestjs/mongoose';
import { AppController } from './app.controller';
import { AppService } from './app.service';
import { AiModule } from './modules/ai/ai.module';
import { AuthModule } from './modules/auth/auth.module';
import { ContractsModule } from './modules/contracts/contracts.module';
import { MapModule } from './modules/map/map.module';
import { NotificationsModule } from './modules/notifications/notifications.module';
import { EventsModule } from './modules/events/events.module';
import { RabbitMqModule } from './modules/rabbitmq/rabbitmq.module';
import { ReclamationsModule } from './modules/reclamations/reclamations.module';
import { UsersModule } from './modules/users/users.module';
import { WebsocketClientModule } from './modules/websocket/websocket-client.module';
import { WebsocketServerModule } from './modules/websocket-server/websocket-server.module';
import { ZonesModule } from './modules/zones/zones.module';
import { HttpRequestLoggerMiddleware } from './common/middleware/http-request-logger.middleware';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
    }),
    MongooseModule.forRootAsync({
      inject: [ConfigService],
      useFactory: (configService: ConfigService) => ({
        uri: configService.get<string>(
          'MONGODB_URI',
          'mongodb://localhost:27017/smart_fiber',
        ),
      }),
    }),
    AuthModule,
    UsersModule,
    ZonesModule,
    ContractsModule,
    ReclamationsModule,
    AiModule,
    NotificationsModule,
    EventsModule,
    RabbitMqModule,
    MapModule,
    WebsocketClientModule,
    WebsocketServerModule,
  ],
  controllers: [AppController],
  providers: [AppService],
})
export class AppModule implements NestModule {
  configure(consumer: MiddlewareConsumer): void {
    consumer.apply(HttpRequestLoggerMiddleware).forRoutes('*');
  }
}
