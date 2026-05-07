import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Reclamation } from './entities/reclamation.entity';

@Module({
  imports: [TypeOrmModule.forFeature([Reclamation])],
  exports: [TypeOrmModule],
})
export class ReclamationsModule {}
