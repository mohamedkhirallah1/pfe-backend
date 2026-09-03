import { MiddlewareConsumer, Module, NestModule } from '@nestjs/common';
import { APP_GUARD } from '@nestjs/core';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { MongooseModule } from '@nestjs/mongoose';
import { ScheduleModule } from '@nestjs/schedule';
import { ThrottlerGuard, ThrottlerModule } from '@nestjs/throttler';
import { AppController } from './app.controller';
import { AppService } from './app.service';
import { AiModule } from './modules/ai/ai.module';
import { AiSupervisorModule } from './modules/ai-supervisor/ai-supervisor.module';
import { AuthModule } from './modules/auth/auth.module';
import { CentralFiberModule } from './modules/central-fiber/central-fiber.module';
import { CentraleModule } from './modules/centrale/centrale.module';
import { ContractsModule } from './modules/contracts/contracts.module';
import { FdtModule } from './modules/fdt/fdt.module';
import { MapModule } from './modules/map/map.module';
import { NotificationsModule } from './modules/notifications/notifications.module';
import { EventsModule } from './modules/events/events.module';
import { NroModule } from './modules/nro/nro.module';
import { RabbitMqModule } from './modules/rabbitmq/rabbitmq.module';
import { ReclamationsModule } from './modules/reclamations/reclamations.module';
import { TopologyModule } from './modules/topology/topology.module';
import { UsersModule } from './modules/users/users.module';
import { WebsocketClientModule } from './modules/websocket/websocket-client.module';
import { WebsocketServerModule } from './modules/websocket-server/websocket-server.module';
import { ZonesModule } from './modules/zones/zones.module';
import { HttpRequestLoggerMiddleware } from './common/middleware/http-request-logger.middleware';
import { CryptoModule } from './common/crypto/crypto.module';
import { MetricsModule } from './common/metrics/metrics.module';
import { QlogModule } from './common/qlog/qlog.module';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
    }),
    ScheduleModule.forRoot(),
    QlogModule,
    CryptoModule,
    MetricsModule,
    ThrottlerModule.forRoot([
      {
        // Default global limit; the login route applies its own tighter override.
        ttl: 60_000,
        limit: 100,
      },
    ]),
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
    FdtModule,
    NroModule,
    CentralFiberModule,
    CentraleModule,
    ContractsModule,
    TopologyModule,
    ReclamationsModule,
    AiModule,
    AiSupervisorModule,
    NotificationsModule,
    EventsModule,
    RabbitMqModule,
    MapModule,
    WebsocketClientModule,
    WebsocketServerModule,
  ],
  controllers: [AppController],
  providers: [
    AppService,
    {
      provide: APP_GUARD,
      useClass: ThrottlerGuard,
    },
  ],
})
export class AppModule implements NestModule {
  configure(consumer: MiddlewareConsumer): void {
    consumer.apply(HttpRequestLoggerMiddleware).forRoutes('*');
  }
}
