import { BadRequestException, Injectable, Logger, NotFoundException } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { isWithinTunisiaBounds } from '../zones/constants/tunisia-bounds.constant';
import { ZonesService } from '../zones/zones.service';
import { DeleteNroEventDto } from './dto/delete-nro-event.dto';
import { NewNroEventDto } from './dto/new-nro-event.dto';
import { UpdateNroEventDto } from './dto/update-nro-event.dto';
import { Nro, NroDocument, NroStatus } from './schemas/nro.schema';

type SocketEmission = {
  event: 'nro_created' | 'nro_updated' | 'nro_deleted';
  payload: Record<string, unknown>;
};

export type NroProcessResult = {
  socketEvents: SocketEmission[];
  mapUpdate: Record<string, unknown> | null;
};

@Injectable()
export class NroService {
  private readonly logger = new Logger(NroService.name);

  constructor(
    @InjectModel(Nro.name)
    private readonly nroModel: Model<NroDocument>,
    private readonly zonesService: ZonesService,
  ) {}

  private toCoordinates(latitude: number, longitude: number): [number, number] {
    return [longitude, latitude];
  }

  private assertTunisiaCoordinates(latitude: number, longitude: number): void {
    if (!isWithinTunisiaBounds(latitude, longitude)) {
      throw new BadRequestException('Coordinates must be inside Tunisia');
    }
  }

  private toMapPayload(nro: NroDocument): Record<string, unknown> {
    return {
      id: nro._id.toString(),
      externalId: nro.externalId,
      name: nro.name,
      regionId: nro.regionId,
      location: nro.location,
      coordinates: nro.location.coordinates,
      maxCapacity: nro.maxCapacity,
      currentLoad: nro.currentLoad,
      status: nro.status,
      deletedAt: nro.deletedAt,
      lastEventType: nro.lastEventType,
    };
  }

  private async resolveRegionId(
    regionId: string | undefined,
    regionName: string | undefined,
    latitude: number,
    longitude: number,
  ): Promise<string | undefined> {
    if (regionId) {
      const zoneByIdentifier = await this.zonesService.findByRegionIdentifier(regionId);
      return zoneByIdentifier?._id.toString();
    }

    if (regionName) {
      const zoneByIdentifier = await this.zonesService.findByRegionIdentifier(regionName);
      return zoneByIdentifier?._id.toString();
    }

    const zone = await this.zonesService.findZoneByCoordinates(latitude, longitude);
    return zone?._id.toString();
  }

  async handleNewNroEvent(payload: NewNroEventDto): Promise<NroProcessResult> {
    this.assertTunisiaCoordinates(payload.latitude, payload.longitude);

    const regionId = await this.resolveRegionId(
      payload.regionId,
      payload.regionName,
      payload.latitude,
      payload.longitude,
    );

    if (!regionId) {
      throw new BadRequestException('NRO region resolution failed');
    }

    const nro = await this.nroModel.findOneAndUpdate(
      { externalId: payload.nroId },
      {
        externalId: payload.nroId,
        name: payload.name,
        regionId,
        location: {
          type: 'Point',
          coordinates: this.toCoordinates(payload.latitude, payload.longitude),
        },
        maxCapacity: payload.maxCapacity,
        lastEventType: 'NEW_NRO',
        deletedAt: undefined,
        status: NroStatus.ACTIVE,
      },
      { upsert: true, new: true },
    ).exec();

    this.logger.log(`NRO ${payload.nroId} created or updated`);

    return {
      socketEvents: [
        {
          event: 'nro_created',
          payload: this.toMapPayload(nro),
        },
      ],
      mapUpdate: {
        type: 'nro',
        action: 'upsert',
        payload: this.toMapPayload(nro),
      },
    };
  }

  async handleUpdateNroEvent(payload: UpdateNroEventDto): Promise<NroProcessResult> {
    const nro = await this.nroModel.findOne({ externalId: payload.nroId }).exec();

    if (!nro) {
      throw new NotFoundException(`NRO ${payload.nroId} not found`);
    }

    if (payload.name !== undefined) {
      nro.name = payload.name;
    }

    if (payload.regionId !== undefined || payload.regionName !== undefined) {
      nro.regionId = await this.resolveRegionId(
        payload.regionId,
        payload.regionName,
        payload.latitude ?? nro.location.coordinates[1],
        payload.longitude ?? nro.location.coordinates[0],
      );
    }

    if (payload.latitude !== undefined && payload.longitude !== undefined) {
      this.assertTunisiaCoordinates(payload.latitude, payload.longitude);
      nro.location = {
        type: 'Point',
        coordinates: this.toCoordinates(payload.latitude, payload.longitude),
      };
    }

    if (payload.maxCapacity !== undefined) {
      nro.maxCapacity = payload.maxCapacity;
    }

    nro.lastEventType = 'UPDATE_NRO';

    if (nro.currentLoad >= nro.maxCapacity) {
      nro.status = NroStatus.SATURATED;
    } else if (nro.status !== NroStatus.DOWN && nro.status !== NroStatus.DELETED) {
      nro.status = NroStatus.ACTIVE;
    }

    await nro.save();

    this.logger.log(`NRO ${payload.nroId} updated`);

    return {
      socketEvents: [
        {
          event: 'nro_updated',
          payload: this.toMapPayload(nro),
        },
      ],
      mapUpdate: {
        type: 'nro',
        action: 'update',
        payload: this.toMapPayload(nro),
      },
    };
  }

  async handleDeleteNroEvent(payload: DeleteNroEventDto): Promise<NroProcessResult> {
    const nro = await this.nroModel.findOne({ externalId: payload.nroId }).exec();

    if (!nro) {
      throw new NotFoundException(`NRO ${payload.nroId} not found`);
    }

    nro.status = NroStatus.DELETED;
    nro.deletedAt = new Date();
    nro.lastEventType = 'DELETE_NRO';
    await nro.save();

    this.logger.log(`NRO ${payload.nroId} deleted`);

    return {
      socketEvents: [
        {
          event: 'nro_deleted',
          payload: this.toMapPayload(nro),
        },
      ],
      mapUpdate: {
        type: 'nro',
        action: 'delete',
        payload: this.toMapPayload(nro),
      },
    };
  }

  async findNearestNro(
    latitude: number,
    longitude: number,
    regionId?: string,
  ): Promise<NroDocument | null> {
    const filter: Record<string, unknown> = {
      status: NroStatus.ACTIVE,
    };

    if (regionId) {
      filter.regionId = regionId;
    }

    return this.nroModel
      .findOne({
        ...filter,
        location: {
          $near: {
            $geometry: {
              type: 'Point',
              coordinates: this.toCoordinates(latitude, longitude),
            },
          },
        },
      })
      .exec();
  }

  async findByExternalId(externalId: string): Promise<NroDocument | null> {
    return this.nroModel.findOne({ externalId }).exec();
  }

  async incrementLoad(nroId: string, bandwidth: number): Promise<NroDocument> {
    const nro = await this.nroModel.findOne({ externalId: nroId }).exec();

    if (!nro) {
      throw new NotFoundException(`NRO ${nroId} not found`);
    }

    nro.currentLoad += bandwidth;
    nro.status = nro.currentLoad >= nro.maxCapacity ? NroStatus.SATURATED : NroStatus.ACTIVE;
    await nro.save();
    return nro;
  }

  async decrementLoad(nroId: string, bandwidth: number): Promise<NroDocument> {
    const nro = await this.nroModel.findOne({ externalId: nroId }).exec();

    if (!nro) {
      throw new NotFoundException(`NRO ${nroId} not found`);
    }

    nro.currentLoad = Math.max(0, nro.currentLoad - bandwidth);
    if (nro.status !== NroStatus.DOWN && nro.status !== NroStatus.DELETED) {
      nro.status = nro.currentLoad >= nro.maxCapacity ? NroStatus.SATURATED : NroStatus.ACTIVE;
    }

    await nro.save();
    return nro;
  }
}