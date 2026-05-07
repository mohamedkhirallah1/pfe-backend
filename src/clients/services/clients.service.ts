import { BadRequestException, Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { PolygonEntity } from '../../polygons/entities/polygon.entity';
import { CreateClientDto } from '../dto/create-client.dto';
import { Client } from '../entities/client.entity';

@Injectable()
export class ClientsService {
  constructor(
    @InjectRepository(Client)
    private readonly clientsRepository: Repository<Client>,
    @InjectRepository(PolygonEntity)
    private readonly polygonsRepository: Repository<PolygonEntity>,
  ) {}

  async create(createClientDto: CreateClientDto): Promise<Client> {
    const polygon = await this.polygonsRepository
      .createQueryBuilder('polygon')
      .where(
        'ST_Contains(polygon.boundary, ST_SetSRID(ST_MakePoint(:longitude, :latitude), 4326))',
        {
          longitude: createClientDto.longitude,
          latitude: createClientDto.latitude,
        },
      )
      .getOne();

    if (!polygon) {
      throw new BadRequestException(
        'No polygon found for provided geolocation coordinates',
      );
    }

    const client = this.clientsRepository.create({
      contractId: createClientDto.contractId,
      location: {
        type: 'Point',
        coordinates: [createClientDto.longitude, createClientDto.latitude],
      },
      polygonId: polygon.id,
    });

    return this.clientsRepository.save(client);
  }

  findAll(): Promise<Client[]> {
    return this.clientsRepository.find({ relations: ['polygon', 'polygon.zone'] });
  }
}