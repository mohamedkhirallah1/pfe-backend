import {
  Injectable,
  Logger,
  ConflictException,
  NotFoundException,
  BadRequestException,
  OnModuleInit,
} from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { Zone, ZoneDocument } from './schemas/zone.schema';
import { CreateZoneDto } from './dto/create-zone.dto';
import { UpdateZoneDto } from './dto/update-zone.dto';
import {
  normalizeTunisiaRegionName,
  TUNISIA_REGION_CENTERS,
} from './constants/tunisia-region-centers.constant';
import { TUNISIA_REGIONS } from '../users/constants/tunisia-regions.constant';
import { Types } from 'mongoose';

@Injectable()
export class ZonesService implements OnModuleInit {
  private readonly logger = new Logger(ZonesService.name);

  constructor(
    @InjectModel(Zone.name)
    private readonly zoneModel: Model<ZoneDocument>,
  ) {}

  async onModuleInit(): Promise<void> {
    await this.ensurePredefinedZones();
  }

  private buildDefaultPolygon(name: keyof typeof TUNISIA_REGION_CENTERS): {
    type: 'Polygon';
    coordinates: number[][][];
  } {
    const center = TUNISIA_REGION_CENTERS[name];
    const delta = 0.15;

    const ring = [
      [center.lng - delta, center.lat - delta],
      [center.lng + delta, center.lat - delta],
      [center.lng + delta, center.lat + delta],
      [center.lng - delta, center.lat + delta],
      [center.lng - delta, center.lat - delta],
    ];

    return {
      type: 'Polygon',
      coordinates: [ring],
    };
  }

  private async ensurePredefinedZones(): Promise<void> {
    for (const regionName of TUNISIA_REGIONS) {
      const existing = await this.zoneModel.findOne({ name: regionName }).exec();
      if (existing) {
        continue;
      }

      await this.zoneModel.create({
        name: regionName,
        geometry: this.buildDefaultPolygon(regionName),
        isActive: true,
      });
    }
  }

  async getPredefinedRegions(): Promise<
    Array<{
      name: string;
      lat: number;
      lng: number;
      zoneId?: string;
      isActive: boolean;
      hasManager: boolean;
    }>
  > {
    const zones = await this.zoneModel.find({ name: { $in: TUNISIA_REGIONS as readonly string[] } }).exec();
    const zoneByName = new Map(zones.map((zone) => [zone.name, zone]));

    return TUNISIA_REGIONS.map((name) => {
      const center = TUNISIA_REGION_CENTERS[name];
      const zone = zoneByName.get(name);
      return {
        name,
        lat: center.lat,
        lng: center.lng,
        zoneId: zone?._id.toString(),
        isActive: zone?.isActive ?? false,
        hasManager: Boolean(zone?.managerUserId),
      };
    });
  }

  async findZoneByCoordinates(lat: number, lng: number): Promise<ZoneDocument | null> {
    this.logger.debug(`Finding zone for coordinates lat=${lat}, lng=${lng}`);

    return this.zoneModel.findOne({
      geometry: {
        $geoIntersects: {
          $geometry: {
            type: 'Point',
            coordinates: [lng, lat],
          },
        },
      },
    });
  }

  async findByName(name: string): Promise<ZoneDocument | null> {
    return this.zoneModel.findOne({ name }).exec();
  }

  async findByRegionIdentifier(identifier: string): Promise<ZoneDocument | null> {
    const value = identifier.trim();

    if (!value) {
      return null;
    }

    if (Types.ObjectId.isValid(value)) {
      const byId = await this.zoneModel.findById(value).exec();
      if (byId) {
        return byId;
      }
    }

    const normalized = normalizeTunisiaRegionName(value);
    if (normalized) {
      return this.zoneModel.findOne({ name: normalized }).exec();
    }

    return this.zoneModel.findOne({ name: value }).exec();
  }

  findAll(): Promise<ZoneDocument[]> {
    return this.zoneModel.find({ isActive: true }).exec();
  }

  findById(id: string): Promise<ZoneDocument | null> {
    return this.zoneModel.findById(id).exec();
  }

  async create(dto: CreateZoneDto): Promise<ZoneDocument> {
    const normalizedName = normalizeTunisiaRegionName(dto.name) ?? dto.name.trim();
    const canonicalRegionName = normalizeTunisiaRegionName(normalizedName);

    if (!canonicalRegionName) {
      throw new BadRequestException('Only Tunisia predefined regions are allowed');
    }

    const existing = await this.zoneModel.findOne({ name: normalizedName }).exec();

    if (existing) {
      if (!existing.isActive) {
        existing.isActive = true;
        if (!existing.geometry && normalizedName in TUNISIA_REGION_CENTERS) {
          existing.geometry = this.buildDefaultPolygon(
            normalizedName as keyof typeof TUNISIA_REGION_CENTERS,
          );
        }
        if (dto.managerUserId !== undefined) {
          existing.managerUserId = dto.managerUserId;
        }
        return existing.save();
      }

      return existing;
    }

    const geometry = dto.geometry ?? this.buildDefaultPolygon(canonicalRegionName);

    return this.zoneModel.create({
      name: normalizedName,
      managerUserId: dto.managerUserId,
      geometry,
      isActive: true,
    });
  }

  async update(id: string, dto: UpdateZoneDto): Promise<ZoneDocument> {
    const zone = await this.zoneModel.findById(id).exec();

    if (!zone) {
      throw new NotFoundException('Zone not found');
    }

    if (dto.name) {
      const normalizedName = normalizeTunisiaRegionName(dto.name);
      if (!normalizedName) {
        throw new BadRequestException('Only Tunisia predefined regions are allowed');
      }

      const existing = await this.zoneModel.findOne({ name: dto.name, _id: { $ne: id } }).exec();
      if (existing) {
        throw new ConflictException(`Zone "${dto.name}" already exists`);
      }
      zone.name = normalizedName;
    }

    if (dto.managerUserId !== undefined) {
      zone.managerUserId = dto.managerUserId;
    }

    if (dto.geometry) {
      zone.geometry = dto.geometry as ZoneDocument['geometry'];
    }

    if (dto.isActive !== undefined) {
      zone.isActive = dto.isActive;
    }

    return zone.save();
  }

  async remove(id: string): Promise<{ message: string }> {
    const zone = await this.zoneModel.findById(id).exec();

    if (!zone) {
      throw new NotFoundException('Zone not found');
    }

    zone.isActive = false;
    await zone.save();

    return { message: 'Zone deleted successfully' };
  }
}
