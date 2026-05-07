import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { Zone, ZoneSchema } from './schemas/zone.schema';
import { ZonesController } from './controllers/zones.controller';
import { ZonesService } from './zones.service';

@Module({
  imports: [MongooseModule.forFeature([{ name: Zone.name, schema: ZoneSchema }])],
  providers: [ZonesService],
  controllers: [ZonesController],
  exports: [ZonesService, MongooseModule],
})
export class ZonesModule {}
