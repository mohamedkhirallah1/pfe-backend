import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { ZonesModule } from '../zones/zones.module';
import { NotificationsModule } from '../notifications/notifications.module';
import { WebsocketServerModule } from '../websocket-server/websocket-server.module';
import { NroController } from './controllers/nro.controller';
import { Nro, NroSchema } from './schemas/nro.schema';
import { Centrale, CentraleSchema } from '../centrale/schemas/centrale.schema';
import { NroService } from './nro.service';

@Module({
  imports: [
    MongooseModule.forFeature([
      { name: Nro.name, schema: NroSchema },
      { name: Centrale.name, schema: CentraleSchema },
    ]),
    ZonesModule,
    NotificationsModule,
    WebsocketServerModule,
  ],
  controllers: [NroController],
  providers: [NroService],
  exports: [NroService, MongooseModule],
})
export class NroModule {}
