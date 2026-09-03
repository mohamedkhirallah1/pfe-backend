import { Injectable, Logger, NotFoundException, BadRequestException, ConflictException } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { CentralFiber, CentralFiberDocument, CentralFiberStatus } from '../schemas/central-fiber.schema';
import { CreateCentralFiberDto, UpdateCentralFiberDto } from '../dto/central-fiber.dto';
import { isWithinTunisiaBounds } from '../../zones/constants/tunisia-bounds.constant';

@Injectable()
export class CentralFiberService {
  private readonly logger = new Logger(CentralFiberService.name);

  constructor(
    @InjectModel(CentralFiber.name)
    private readonly centralFiberModel: Model<CentralFiberDocument>,
  ) {}

  private toCoordinates(latitude: number, longitude: number): [number, number] {
    return [longitude, latitude];
  }

  private assertTunisiaCoordinates(latitude: number, longitude: number): void {
    if (!isWithinTunisiaBounds(latitude, longitude)) {
      throw new BadRequestException('Central Fiber location must be inside Tunisia');
    }
  }

  async create(dto: CreateCentralFiberDto): Promise<CentralFiberDocument> {
    this.assertTunisiaCoordinates(dto.latitude, dto.longitude);

    const existing = await this.centralFiberModel.findOne({ externalId: dto.externalId }).exec();
    if (existing) {
      throw new ConflictException(`Central Fiber with externalId "${dto.externalId}" already exists`);
    }

    const centralFiber = await this.centralFiberModel.create({
      externalId: dto.externalId,
      name: dto.name,
      city: dto.city,
      zoneId: dto.zoneId,
      totalCapacityGb: dto.totalCapacityGb,
      usedCapacityGb: dto.usedCapacityGb ?? 0,
      location: {
        type: 'Point',
        coordinates: this.toCoordinates(dto.latitude, dto.longitude),
      },
      status: dto.status ?? CentralFiberStatus.ACTIVE,
    });

    this.logger.log(`Central Fiber created: ${dto.externalId}`);
    return centralFiber;
  }

  async update(id: string, dto: UpdateCentralFiberDto): Promise<CentralFiberDocument> {
    const centralFiber = await this.centralFiberModel.findById(id).exec();
    if (!centralFiber) {
      throw new NotFoundException(`Central Fiber with id "${id}" not found`);
    }

    if (dto.latitude && dto.longitude) {
      this.assertTunisiaCoordinates(dto.latitude, dto.longitude);
      centralFiber.location = {
        type: 'Point',
        coordinates: this.toCoordinates(dto.latitude, dto.longitude),
      };
    }

    if (dto.name) centralFiber.name = dto.name;
    if (dto.city) centralFiber.city = dto.city;
    if (dto.totalCapacityGb !== undefined) centralFiber.totalCapacityGb = dto.totalCapacityGb;
    if (dto.usedCapacityGb !== undefined) centralFiber.usedCapacityGb = dto.usedCapacityGb;
    if (dto.status) centralFiber.status = dto.status;

    centralFiber.updatedAt = new Date();
    await centralFiber.save();

    this.logger.log(`Central Fiber updated: ${id}`);
    return centralFiber;
  }

  async findById(id: string): Promise<CentralFiberDocument | null> {
    return this.centralFiberModel.findById(id).exec();
  }

  async findByExternalId(externalId: string): Promise<CentralFiberDocument | null> {
    return this.centralFiberModel.findOne({ externalId }).exec();
  }

  async findByZoneId(zoneId: string): Promise<CentralFiberDocument[]> {
    return this.centralFiberModel.find({ zoneId, status: CentralFiberStatus.ACTIVE }).exec();
  }

  async findAll(): Promise<CentralFiberDocument[]> {
    return this.centralFiberModel.find({ status: CentralFiberStatus.ACTIVE }).exec();
  }

  async findNearby(latitude: number, longitude: number, maxDistance = 50000): Promise<CentralFiberDocument | null> {
    return this.centralFiberModel
      .findOne({
        status: CentralFiberStatus.ACTIVE,
        location: {
          $near: {
            $geometry: {
              type: 'Point',
              coordinates: this.toCoordinates(latitude, longitude),
            },
            $maxDistance: maxDistance,
          },
        },
      })
      .exec();
  }

  async updateUsedCapacity(externalId: string, addedCapacityGb: number): Promise<CentralFiberDocument> {
    const centralFiber = await this.centralFiberModel.findOne({ externalId }).exec();
    if (!centralFiber) {
      throw new NotFoundException(`Central Fiber with externalId "${externalId}" not found`);
    }

    centralFiber.usedCapacityGb = Math.min(centralFiber.usedCapacityGb + addedCapacityGb, centralFiber.totalCapacityGb);
    centralFiber.updatedAt = new Date();
    await centralFiber.save();

    return centralFiber;
  }

  async releaseCapacity(externalId: string, releasedCapacityGb: number): Promise<CentralFiberDocument> {
    const centralFiber = await this.centralFiberModel.findOne({ externalId }).exec();
    if (!centralFiber) {
      throw new NotFoundException(`Central Fiber with externalId "${externalId}" not found`);
    }

    centralFiber.usedCapacityGb = Math.max(centralFiber.usedCapacityGb - releasedCapacityGb, 0);
    centralFiber.updatedAt = new Date();
    await centralFiber.save();

    return centralFiber;
  }

  async getSaturationStats(): Promise<Record<string, unknown>> {
    const sites = await this.centralFiberModel.find().exec();

    const stats = {
      total: sites.length,
      active: sites.filter((s) => s.status === CentralFiberStatus.ACTIVE).length,
      totalCapacity: sites.reduce((acc, s) => acc + s.totalCapacityGb, 0),
      usedCapacity: sites.reduce((acc, s) => acc + s.usedCapacityGb, 0),
      bySaturation: {
        critical: sites.filter((s) => s.saturationRate >= 90).length,
        warning: sites.filter((s) => s.saturationRate >= 70 && s.saturationRate < 90).length,
        normal: sites.filter((s) => s.saturationRate < 70).length,
      },
    };

    return stats;
  }

  async delete(id: string): Promise<void> {
    const result = await this.centralFiberModel.findByIdAndDelete(id).exec();
    if (!result) {
      throw new NotFoundException(`Central Fiber with id "${id}" not found`);
    }
    this.logger.log(`Central Fiber deleted: ${id}`);
  }
}
