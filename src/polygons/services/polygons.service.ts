import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { CreatePolygonDto } from '../dto/create-polygon.dto';
import { PolygonEntity } from '../entities/polygon.entity';

@Injectable()
export class PolygonsService {
  constructor(
    @InjectRepository(PolygonEntity)
    private readonly polygonsRepository: Repository<PolygonEntity>,
  ) {}

  create(createPolygonDto: CreatePolygonDto): Promise<PolygonEntity> {
    const polygon = this.polygonsRepository.create(createPolygonDto);
    return this.polygonsRepository.save(polygon);
  }

  findAll(): Promise<PolygonEntity[]> {
    return this.polygonsRepository.find({ relations: ['zone'] });
  }
}