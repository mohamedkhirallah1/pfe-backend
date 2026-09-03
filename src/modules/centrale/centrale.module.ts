import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { Contract, ContractSchema } from '../contracts/schemas/contract.schema';
import { Nro, NroSchema } from '../nro/schemas/nro.schema';
import { NotificationsModule } from '../notifications/notifications.module';
import { WebsocketServerModule } from '../websocket-server/websocket-server.module';
import { Centrale, CentraleSchema } from './schemas/centrale.schema';
import { CentraleService } from './services/centrale.service';
import { CentraleController } from './controllers/centrale.controller';

@Module({
  imports: [
    MongooseModule.forFeature([
      { name: Centrale.name, schema: CentraleSchema },
      { name: Nro.name, schema: NroSchema },
      { name: Contract.name, schema: ContractSchema },
    ]),
    NotificationsModule,
    WebsocketServerModule,
  ],
  controllers: [CentraleController],
  providers: [CentraleService],
  exports: [CentraleService],
})
export class CentraleModule {}
