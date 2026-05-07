import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { PolygonsController } from './controllers/polygons.controller';
import { PolygonEntity } from './entities/polygon.entity';
import { PolygonsService } from './services/polygons.service';

@Module({
  imports: [TypeOrmModule.forFeature([PolygonEntity])],
  controllers: [PolygonsController],
  providers: [PolygonsService],
  exports: [PolygonsService, TypeOrmModule],
})
export class PolygonsModule {}