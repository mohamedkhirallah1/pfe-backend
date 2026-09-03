import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { Zone, ZoneSchema } from './schemas/zone.schema';
import { Centrale, CentraleSchema } from '../centrale/schemas/centrale.schema';
import { Nro, NroSchema } from '../nro/schemas/nro.schema';
import { Fdt, FdtSchema } from '../fdt/schemas/fdt.schema';
import { Contract, ContractSchema } from '../contracts/schemas/contract.schema';
import { ZonesController } from './controllers/zones.controller';
import { ZonesService } from './zones.service';

@Module({
  imports: [
    MongooseModule.forFeature([
      { name: Zone.name, schema: ZoneSchema },
      { name: Centrale.name, schema: CentraleSchema },
      { name: Nro.name, schema: NroSchema },
      { name: Fdt.name, schema: FdtSchema },
      { name: Contract.name, schema: ContractSchema },
    ]),
  ],
  providers: [ZonesService],
  controllers: [ZonesController],
  exports: [ZonesService, MongooseModule],
})
export class ZonesModule {}
