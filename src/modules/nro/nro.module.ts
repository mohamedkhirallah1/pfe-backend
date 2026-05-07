import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { ZonesModule } from '../zones/zones.module';
import { Nro, NroSchema } from './schemas/nro.schema';
import { NroService } from './nro.service';

@Module({
  imports: [MongooseModule.forFeature([{ name: Nro.name, schema: NroSchema }]), ZonesModule],
  providers: [NroService],
  exports: [NroService, MongooseModule],
})
export class NroModule {}