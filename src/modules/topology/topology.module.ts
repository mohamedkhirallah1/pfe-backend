import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { Contract, ContractSchema } from '../contracts/schemas/contract.schema';
import { Fdt, FdtSchema } from '../fdt/schemas/fdt.schema';
import { Nro, NroSchema } from '../nro/schemas/nro.schema';
import { CentralFiber, CentralFiberSchema } from '../central-fiber/schemas/central-fiber.schema';
import { Zone, ZoneSchema } from '../zones/schemas/zone.schema';
import { TopologyService } from './topology.service';

@Module({
  imports: [
    MongooseModule.forFeature([
      { name: Contract.name, schema: ContractSchema },
      { name: Fdt.name, schema: FdtSchema },
      { name: Nro.name, schema: NroSchema },
      { name: CentralFiber.name, schema: CentralFiberSchema },
      { name: Zone.name, schema: ZoneSchema },
    ]),
  ],
  providers: [TopologyService],
  exports: [TopologyService],
})
export class TopologyModule {}
