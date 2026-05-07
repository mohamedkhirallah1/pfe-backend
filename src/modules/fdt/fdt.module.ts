import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { NroModule } from '../nro/nro.module';
import { ZonesModule } from '../zones/zones.module';
import { Fdt, FdtSchema } from './schemas/fdt.schema';
import { FdtService } from './fdt.service';

@Module({
  imports: [MongooseModule.forFeature([{ name: Fdt.name, schema: FdtSchema }]), NroModule, ZonesModule],
  providers: [FdtService],
  exports: [FdtService, MongooseModule],
})
export class FdtModule {}