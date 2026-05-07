import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { CreateZoneDto } from '../dto/create-zone.dto';
import { Zone } from '../entities/zone.entity';

@Injectable()
export class ZonesService {
  constructor(
    @InjectRepository(Zone)
    private readonly zonesRepository: Repository<Zone>,
  ) {}

  create(createZoneDto: CreateZoneDto): Promise<Zone> {
    const zone = this.zonesRepository.create(createZoneDto);
    return this.zonesRepository.save(zone);
  }

  findAll(): Promise<Zone[]> {
    return this.zonesRepository.find({ relations: ['polygons'] });
  }
}