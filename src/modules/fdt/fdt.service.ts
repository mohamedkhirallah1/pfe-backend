import { BadRequestException, Injectable, Logger, NotFoundException } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { NroService } from '../nro/nro.service';
import { isWithinTunisiaBounds } from '../zones/constants/tunisia-bounds.constant';
import { ZonesService } from '../zones/zones.service';
import { NewFdtEventDto } from './dto/new-fdt-event.dto';
import { Fdt, FdtDocument } from './schemas/fdt.schema';

type SocketEmission = {
  event: 'new_fdt';
  payload: Record<string, unknown>;
};

export type FdtProcessResult = {
  socketEvents: SocketEmission[];
  mapUpdate: Record<string, unknown> | null;
};

@Injectable()
export class FdtService {
  private readonly logger = new Logger(FdtService.name);

  private assertTunisiaCoordinates(latitude: number, longitude: number): void {
    if (!isWithinTunisiaBounds(latitude, longitude)) {
      throw new BadRequestException('Coordinates must be inside Tunisia');
    }
  }

  constructor(
    @InjectModel(Fdt.name)
    private readonly fdtModel: Model<FdtDocument>,
    private readonly nroService: NroService,
    private readonly zonesService: ZonesService,
  ) {}

  private toCoordinates(latitude: number, longitude: number): [number, number] {
    return [longitude, latitude];
  }

  private toMapPayload(fdt: FdtDocument): Record<string, unknown> {
    return {
      id: fdt._id.toString(),
      externalId: fdt.externalId,
      nroId: fdt.nroId,
      regionId: fdt.regionId,
      location: fdt.location,
      coordinates: fdt.location.coordinates,
    };
  }

  async handleNewFdtEvent(payload: NewFdtEventDto): Promise<FdtProcessResult> {
    this.assertTunisiaCoordinates(payload.latitude, payload.longitude);

    const zone = payload.regionId
      ? await this.zonesService.findByRegionIdentifier(payload.regionId)
      : await this.zonesService.findZoneByCoordinates(payload.latitude, payload.longitude);

    let nro = payload.nroId ? await this.nroService.findByExternalId(payload.nroId) : null;

    if (!nro) {
      nro = await this.nroService.findNearestNro(
        payload.latitude,
        payload.longitude,
        zone?._id.toString(),
      );
    }

    const fdt = await this.fdtModel.findOneAndUpdate(
      { externalId: payload.externalId },
      {
        externalId: payload.externalId,
        nroId: nro?.externalId,
        regionId: nro?.regionId ?? zone?._id.toString(),
        location: {
          type: 'Point',
          coordinates: this.toCoordinates(payload.latitude, payload.longitude),
        },
      },
      { upsert: true, new: true },
    ).exec();

    this.logger.log(`FDT ${payload.externalId} linked to NRO ${nro?.externalId ?? 'none'}`);

    return {
      socketEvents: [
        {
          event: 'new_fdt',
          payload: this.toMapPayload(fdt),
        },
      ],
      mapUpdate: {
        type: 'fdt',
        action: 'upsert',
        payload: this.toMapPayload(fdt),
      },
    };
  }

  async attachToNro(externalId: string, nroId: string): Promise<FdtDocument> {
    const fdt = await this.fdtModel.findOne({ externalId }).exec();

    if (!fdt) {
      throw new NotFoundException(`FDT ${externalId} not found`);
    }

    fdt.nroId = nroId;
    return fdt.save();
  }
}