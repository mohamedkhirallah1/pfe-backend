import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { Fdt, FdtSchema } from '../fdt/schemas/fdt.schema';
import { NotificationsModule } from '../notifications/notifications.module';
import { Nro, NroSchema } from '../nro/schemas/nro.schema';
import { Contract, ContractSchema } from '../contracts/schemas/contract.schema';
import { Reclamation, ReclamationSchema } from '../reclamations/schemas/reclamation.schema';
import { Zone, ZoneSchema } from '../zones/schemas/zone.schema';
import { MapController } from './map.controller';
import { MapService } from './map.service';

@Module({
  imports: [
    MongooseModule.forFeature([
      { name: Contract.name, schema: ContractSchema },
      { name: Reclamation.name, schema: ReclamationSchema },
      { name: Zone.name, schema: ZoneSchema },
      { name: Nro.name, schema: NroSchema },
      { name: Fdt.name, schema: FdtSchema },
    ]),
    NotificationsModule,
  ],
  controllers: [MapController],
  providers: [MapService],
  exports: [MapService],
})
export class MapModule {}
