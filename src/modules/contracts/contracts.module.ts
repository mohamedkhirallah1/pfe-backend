import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { NotificationsModule } from '../notifications/notifications.module';
import { FdtModule } from '../fdt/fdt.module';
import { NroModule } from '../nro/nro.module';
import { ZonesModule } from '../zones/zones.module';
import { TopologyModule } from '../topology/topology.module';
import { CentraleModule } from '../centrale/centrale.module';
import { WebsocketServerModule } from '../websocket-server/websocket-server.module';
import { Contract, ContractSchema } from './schemas/contract.schema';
import { ContractsService } from './contracts.service';
import { ContractsController } from './controllers/contracts.controller';

@Module({
  imports: [
    MongooseModule.forFeature([{ name: Contract.name, schema: ContractSchema }]),
    ZonesModule,
    NotificationsModule,
    FdtModule,
    NroModule,
    TopologyModule,
    CentraleModule,
    WebsocketServerModule,
  ],
  controllers: [ContractsController],
  providers: [ContractsService],
  exports: [ContractsService, MongooseModule],
})
export class ContractsModule {}
