import { BadRequestException, Injectable, Logger } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { NotificationsService } from '../notifications/notifications.service';
import { FdtService } from '../fdt/fdt.service';
import { NroService } from '../nro/nro.service';
import { isWithinTunisiaBounds } from '../zones/constants/tunisia-bounds.constant';
import { ZonesService } from '../zones/zones.service';
import { CancelContractEventDto } from './dto/cancel-contract-event.dto';
import { NewContractEventDto } from './dto/new-contract-event.dto';
import { Contract, ContractDocument, ContractStatus } from './schemas/contract.schema';
import { NroStatus } from '../nro/schemas/nro.schema';

type SocketEmission = {
  event: string;
  payload: Record<string, unknown>;
};

type MapEventResult = {
  type: 'contracts.new' | 'contracts.cancel';
  externalId: string;
  zoneId?: string;
  latitude?: number;
  longitude?: number;
  status: string;
  nroId?: string;
  fdtId?: string;
  rejectReason?: string;
  bandwidth?: number;
  socketEvents: SocketEmission[];
  mapUpdate: Record<string, unknown> | null;
};

@Injectable()
export class ContractsService {
  private readonly logger = new Logger(ContractsService.name);

  private assertTunisiaCoordinates(latitude: number, longitude: number): void {
    if (!isWithinTunisiaBounds(latitude, longitude)) {
      throw new BadRequestException('Coordinates must be inside Tunisia');
    }
  }

  constructor(
    @InjectModel(Contract.name)
    private readonly contractModel: Model<ContractDocument>,
    private readonly zonesService: ZonesService,
    private readonly nroService: NroService,
    private readonly fdtService: FdtService,
    private readonly notificationsService: NotificationsService,
  ) {}

  private toCoordinates(latitude: number, longitude: number): [number, number] {
    return [longitude, latitude];
  }

  private toContractMapPayload(contract: ContractDocument): Record<string, unknown> {
    return {
      id: contract._id.toString(),
      externalId: contract.externalId,
      zoneId: contract.zoneId,
      regionId: contract.regionId,
      nroId: contract.nroId,
      fdtId: contract.fdtId,
      location: contract.location,
      latitude: contract.latitude,
      longitude: contract.longitude,
      bandwidth: contract.bandwidth,
      status: contract.status,
      rejectReason: contract.rejectReason,
    };
  }

  private async resolveZone(
    payload: NewContractEventDto,
  ): Promise<{ zoneId?: string; zoneName?: string } | null> {
    if (payload.regionId) {
      const zoneByIdentifier = await this.zonesService.findByRegionIdentifier(payload.regionId);

      if (zoneByIdentifier) {
        return { zoneId: zoneByIdentifier._id.toString(), zoneName: zoneByIdentifier.name };
      }
    }

    const zone = await this.zonesService.findZoneByCoordinates(payload.latitude, payload.longitude);

    if (!zone) {
      return null;
    }

    return { zoneId: zone._id.toString(), zoneName: zone.name };
  }

  private async resolveTargetNro(
    payload: NewContractEventDto,
    zoneId?: string,
  ): Promise<{ nro: ReturnType<NroService['findByExternalId']> extends Promise<infer T> ? T : never } | null> {
    const nro = await this.nroService.findNearestNro(payload.latitude, payload.longitude, zoneId);

    if (!nro || nro.status !== NroStatus.ACTIVE) {
      return null;
    }

    return { nro };
  }

  async findByPhoneOrCin(phoneNumber?: string, cin?: string): Promise<ContractDocument | null> {
    const filters: Array<Record<string, string>> = [];

    if (phoneNumber) {
      filters.push({ phoneNumber });
    }

    if (cin) {
      filters.push({ cin });
    }

    if (filters.length === 0) {
      return null;
    }

    return this.contractModel.findOne({ $or: filters }).exec();
  }

  async handleNewContractEvent(payload: NewContractEventDto): Promise<MapEventResult> {
    this.assertTunisiaCoordinates(payload.latitude, payload.longitude);
    const existing = await this.contractModel.findOne({ externalId: payload.externalId }).exec();

    if (existing) {
      return {
        type: 'contracts.new',
        externalId: existing.externalId,
        zoneId: existing.zoneId,
        latitude: existing.latitude,
        longitude: existing.longitude,
        status: existing.status,
        nroId: existing.nroId,
        fdtId: existing.fdtId,
        rejectReason: existing.rejectReason,
        bandwidth: existing.bandwidth,
        socketEvents: [],
        mapUpdate: null,
      };
    }

    const zoneResult = await this.resolveZone(payload);
    const zoneId = zoneResult?.zoneId;
    const fdtExternalId = `fdt-contract-${payload.externalId}`;
    const contractLocation = {
      type: 'Point' as const,
      coordinates: this.toCoordinates(payload.latitude, payload.longitude),
    };

    const targetNroResult = zoneId ? await this.resolveTargetNro(payload, zoneId) : null;

    if (!zoneId || !targetNroResult) {
      const rejectReason = 'NO_NRO_AVAILABLE';

      await this.contractModel.create({
        externalId: payload.externalId,
        phoneNumber: payload.phoneNumber,
        cin: payload.cin,
        location: contractLocation,
        latitude: payload.latitude,
        longitude: payload.longitude,
        zoneId,
        regionId: zoneId,
        bandwidth: payload.bandwidth,
        status: ContractStatus.FAILED,
        rejectReason,
        createdAt: new Date(),
      });

      await this.notificationsService.notifyAdmin(
        `Contract ${payload.externalId} FAILED: no active NRO available`,
        {
          eventType: 'CONTRACT_NEW',
          entityType: 'contract',
          externalId: payload.externalId,
          status: ContractStatus.FAILED,
          latitude: payload.latitude,
          longitude: payload.longitude,
          bandwidth: payload.bandwidth,
          rejectReason,
          regionId: zoneId,
        },
      );

      return {
        type: 'contracts.new',
        externalId: payload.externalId,
        zoneId,
        latitude: payload.latitude,
        longitude: payload.longitude,
        status: ContractStatus.FAILED,
        rejectReason,
        bandwidth: payload.bandwidth,
        socketEvents: [
          {
            event: 'contract_failed',
            payload: {
              externalId: payload.externalId,
              latitude: payload.latitude,
              longitude: payload.longitude,
              coordinates: contractLocation.coordinates,
              bandwidth: payload.bandwidth,
              status: ContractStatus.FAILED,
              rejectReason,
              regionId: zoneId,
            },
          },
        ],
        mapUpdate: {
          type: 'contract',
          action: 'upsert',
          payload: {
            externalId: payload.externalId,
            latitude: payload.latitude,
            longitude: payload.longitude,
            coordinates: contractLocation.coordinates,
            bandwidth: payload.bandwidth,
            status: ContractStatus.FAILED,
            rejectReason,
            regionId: zoneId,
          },
        },
      };
    }

    const nro = targetNroResult.nro;

    if (nro.currentLoad + payload.bandwidth > nro.maxCapacity) {
      const rejectReason = 'CAPACITY_EXCEEDED';

      await this.contractModel.create({
        externalId: payload.externalId,
        phoneNumber: payload.phoneNumber,
        cin: payload.cin,
        location: contractLocation,
        latitude: payload.latitude,
        longitude: payload.longitude,
        zoneId,
        regionId: zoneId,
        nroId: nro.externalId,
        bandwidth: payload.bandwidth,
        status: ContractStatus.FAILED,
        rejectReason,
        createdAt: new Date(),
      });

      await this.notificationsService.notifyAdmin(
        `Contract ${payload.externalId} FAILED: NRO ${nro.externalId} capacity exceeded`,
        {
          eventType: 'CONTRACT_NEW',
          entityType: 'contract',
          externalId: payload.externalId,
          status: ContractStatus.FAILED,
          latitude: payload.latitude,
          longitude: payload.longitude,
          bandwidth: payload.bandwidth,
          nroId: nro.externalId,
          regionId: zoneId,
          rejectReason,
        },
      );

      return {
        type: 'contracts.new',
        externalId: payload.externalId,
        zoneId,
        latitude: payload.latitude,
        longitude: payload.longitude,
        status: ContractStatus.FAILED,
        nroId: nro.externalId,
        rejectReason,
        bandwidth: payload.bandwidth,
        socketEvents: [
          {
            event: 'contract_failed',
            payload: {
              externalId: payload.externalId,
              latitude: payload.latitude,
              longitude: payload.longitude,
              coordinates: contractLocation.coordinates,
              bandwidth: payload.bandwidth,
              status: ContractStatus.FAILED,
              rejectReason,
              nroId: nro.externalId,
              regionId: zoneId,
            },
          },
        ],
        mapUpdate: {
          type: 'contract',
          action: 'upsert',
          payload: {
            externalId: payload.externalId,
            latitude: payload.latitude,
            longitude: payload.longitude,
            coordinates: contractLocation.coordinates,
            bandwidth: payload.bandwidth,
            status: ContractStatus.FAILED,
            rejectReason,
            nroId: nro.externalId,
            regionId: zoneId,
          },
        },
      };
    }

    const updatedNro = await this.nroService.incrementLoad(nro.externalId, payload.bandwidth);
    const fdtResult = await this.fdtService.handleNewFdtEvent({
      externalId: fdtExternalId,
      nroId: updatedNro.externalId,
      regionId: zoneId,
      latitude: payload.latitude,
      longitude: payload.longitude,
    });

    const contract = await this.contractModel.findOneAndUpdate(
      { externalId: payload.externalId },
      {
        externalId: payload.externalId,
        phoneNumber: payload.phoneNumber,
        cin: payload.cin,
        location: contractLocation,
        latitude: payload.latitude,
        longitude: payload.longitude,
        zoneId,
        regionId: zoneId,
        nroId: updatedNro.externalId,
        fdtId: fdtResult.mapUpdate ? fdtExternalId : undefined,
        bandwidth: payload.bandwidth,
        status: ContractStatus.ACTIVE,
        rejectReason: undefined,
        createdAt: new Date(),
      },
      { upsert: true, new: true },
    ).exec();

    this.logger.log(`Contract ${payload.externalId} stored with status ACTIVE`);

    if (updatedNro.currentLoad >= updatedNro.maxCapacity) {
      updatedNro.status = NroStatus.SATURATED;
      await updatedNro.save();
    }

    await this.notificationsService.notifyZoneManager(zoneId, `Contract ${payload.externalId} is ACTIVE`, {
      eventType: 'CONTRACT_NEW',
      entityType: 'contract',
      externalId: payload.externalId,
      status: ContractStatus.ACTIVE,
      latitude: payload.latitude,
      longitude: payload.longitude,
      coordinates: contractLocation.coordinates,
      bandwidth: payload.bandwidth,
      nroId: updatedNro.externalId,
      regionId: zoneId,
      fdtId: fdtExternalId,
    });

    return {
      type: 'contracts.new',
      externalId: payload.externalId,
      zoneId,
      latitude: payload.latitude,
      longitude: payload.longitude,
      status: ContractStatus.ACTIVE,
      nroId: updatedNro.externalId,
      fdtId: fdtExternalId,
      bandwidth: payload.bandwidth,
      socketEvents: [
        {
          event: 'new_contract',
          payload: {
            ...this.toContractMapPayload(contract),
            coordinates: contractLocation.coordinates,
            nroId: updatedNro.externalId,
            regionId: zoneId,
            fdtId: fdtExternalId,
          },
        },
        {
          event: 'new_fdt',
          payload: {
            externalId: fdtExternalId,
            nroId: updatedNro.externalId,
            regionId: zoneId,
            coordinates: [payload.longitude, payload.latitude],
            latitude: payload.latitude,
            longitude: payload.longitude,
          },
        },
        {
          event: 'nro_updated',
          payload: {
            externalId: updatedNro.externalId,
            currentLoad: updatedNro.currentLoad,
            maxCapacity: updatedNro.maxCapacity,
            status: updatedNro.status,
            regionId: updatedNro.regionId,
            coordinates: updatedNro.location.coordinates,
            location: updatedNro.location,
          },
        },
      ],
      mapUpdate: {
        type: 'contract',
        action: 'upsert',
        payload: {
          externalId: payload.externalId,
          zoneId,
          nroId: updatedNro.externalId,
          fdtId: fdtExternalId,
          latitude: payload.latitude,
          longitude: payload.longitude,
          coordinates: contractLocation.coordinates,
          bandwidth: payload.bandwidth,
          status: ContractStatus.ACTIVE,
          regionId: zoneId,
        },
      },
    };
  }

  async handleCancelContractEvent(payload: CancelContractEventDto): Promise<MapEventResult> {
    const contract = await this.contractModel.findOne({ externalId: payload.externalId }).exec();

    if (!contract) {
      this.logger.warn(`Cancel event ignored: contract ${payload.externalId} not found`);
      await this.notificationsService.notifyAdmin(
        `Cancel contract ignored for unknown externalId ${payload.externalId}`,
        {
          eventType: 'CONTRACT_CANCEL',
          entityType: 'contract',
          externalId: payload.externalId,
          status: 'UNKNOWN',
        },
      );
      return {
        type: 'contracts.cancel',
        externalId: payload.externalId,
        status: 'UNKNOWN',
        socketEvents: [],
        mapUpdate: null,
      };
    }

    if (contract.status === ContractStatus.CANCELLED) {
      return {
        type: 'contracts.cancel',
        externalId: payload.externalId,
        zoneId: contract.zoneId,
        latitude: contract.latitude,
        longitude: contract.longitude,
        status: ContractStatus.CANCELLED,
        bandwidth: contract.bandwidth,
        nroId: contract.nroId,
        fdtId: contract.fdtId,
        socketEvents: [],
        mapUpdate: null,
      };
    }

    if (contract.nroId) {
      const updatedNro = await this.nroService.decrementLoad(contract.nroId, contract.bandwidth);
      await this.notificationsService.notifyZoneManager(
        contract.zoneId ?? contract.regionId ?? '',
        `Contract ${payload.externalId} removed load from NRO ${updatedNro.externalId}`,
        {
          eventType: 'CONTRACT_CANCEL',
          entityType: 'contract',
          externalId: payload.externalId,
          status: updatedNro.status,
          latitude: contract.latitude,
          longitude: contract.longitude,
          bandwidth: contract.bandwidth,
          nroId: updatedNro.externalId,
        },
      );
    }

    contract.status = ContractStatus.CANCELLED;
    contract.rejectReason = undefined;
    await contract.save();

    if (contract.zoneId) {
      await this.notificationsService.notifyZoneManager(
        contract.zoneId,
        `Contract ${payload.externalId} has been CANCELLED`,
        {
          eventType: 'CONTRACT_CANCEL',
          entityType: 'contract',
          externalId: payload.externalId,
          status: ContractStatus.CANCELLED,
          latitude: contract.latitude,
          longitude: contract.longitude,
          bandwidth: contract.bandwidth,
        },
      );
    }

    return {
      type: 'contracts.cancel',
      externalId: payload.externalId,
      zoneId: contract.zoneId,
      latitude: contract.latitude,
      longitude: contract.longitude,
      status: ContractStatus.CANCELLED,
      bandwidth: contract.bandwidth,
      nroId: contract.nroId,
      fdtId: contract.fdtId,
      socketEvents: contract.nroId
        ? [
            {
              event: 'nro_updated',
              payload: {
                externalId: contract.nroId,
                currentLoad: (await this.nroService.findByExternalId(contract.nroId))?.currentLoad,
                status: (await this.nroService.findByExternalId(contract.nroId))?.status,
                coordinates: (await this.nroService.findByExternalId(contract.nroId))?.location.coordinates,
                regionId: (await this.nroService.findByExternalId(contract.nroId))?.regionId,
              },
            },
          ]
        : [],
      mapUpdate: {
        type: 'contract',
        action: 'cancel',
        payload: {
          externalId: payload.externalId,
          zoneId: contract.zoneId,
          nroId: contract.nroId,
          fdtId: contract.fdtId,
          latitude: contract.latitude,
          longitude: contract.longitude,
          bandwidth: contract.bandwidth,
          status: ContractStatus.CANCELLED,
        },
      },
    };
  }

  findAll() {
    return this.contractModel.find().exec();
  }
}
