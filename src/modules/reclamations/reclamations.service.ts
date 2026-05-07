import { BadRequestException, Injectable, Logger } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { AiService } from '../ai/ai.service';
import { NotificationsService } from '../notifications/notifications.service';
import { ContractsService } from '../contracts/contracts.service';
import { NroService } from '../nro/nro.service';
import { isWithinTunisiaBounds } from '../zones/constants/tunisia-bounds.constant';
import { ZonesService } from '../zones/zones.service';
import { NewReclamationEventDto } from './dto/new-reclamation-event.dto';
import { Reclamation, ReclamationDocument } from './schemas/reclamation.schema';

type SocketEmission = {
  event: 'new_reclamation';
  payload: Record<string, unknown>;
};

type MapEventResult = {
  type: 'reclamations.new';
  externalId: string;
  zoneId?: string;
  latitude?: number;
  longitude?: number;
  status: string;
  contractId?: string;
  nroId?: string;
  socketEvents: SocketEmission[];
  mapUpdate: Record<string, unknown> | null;
};

@Injectable()
export class ReclamationsService {
  private readonly logger = new Logger(ReclamationsService.name);

  private assertTunisiaCoordinates(latitude: number, longitude: number): void {
    if (!isWithinTunisiaBounds(latitude, longitude)) {
      throw new BadRequestException('Coordinates must be inside Tunisia');
    }
  }

  constructor(
    @InjectModel(Reclamation.name)
    private readonly reclamationModel: Model<ReclamationDocument>,
    private readonly zonesService: ZonesService,
    private readonly contractsService: ContractsService,
    private readonly nroService: NroService,
    private readonly aiService: AiService,
    private readonly notificationsService: NotificationsService,
  ) {}

  async handleNewReclamationEvent(payload: NewReclamationEventDto): Promise<MapEventResult> {
    this.assertTunisiaCoordinates(payload.latitude, payload.longitude);

    const contract = await this.contractsService.findByPhoneOrCin(payload.phoneNumber, payload.cin);
    const zone = contract?.zoneId
      ? await this.zonesService.findByRegionIdentifier(contract.zoneId)
      : contract?.regionId
        ? await this.zonesService.findByRegionIdentifier(contract.regionId)
        : await this.zonesService.findZoneByCoordinates(payload.latitude, payload.longitude);
    const nro = contract?.nroId ? await this.nroService.findByExternalId(contract.nroId) : null;
    const analysis = this.aiService.analyze(payload.type);

    const reclamation = await this.reclamationModel.findOneAndUpdate(
      { externalId: payload.externalId },
      {
        externalId: payload.externalId,
        phoneNumber: payload.phoneNumber,
        cin: payload.cin,
        description: payload.type,
        type: payload.type,
        latitude: payload.latitude,
        longitude: payload.longitude,
        zoneId: zone?._id.toString(),
        regionId: zone?._id.toString(),
        nroId: nro?._id.toString(),
        contractId: contract?._id.toString(),
        status: 'NEW',
        category: analysis.category,
        priority: analysis.priority,
        recommendation: analysis.recommendation,
        createdAt: new Date(),
      },
      { upsert: true, new: true },
    );

    this.logger.log(`Reclamation ${payload.externalId} stored`);

    if (zone) {
      await this.notificationsService.notifyZoneManager(
        zone._id.toString(),
        `New reclamation ${payload.externalId} in zone ${zone.name}`,
        {
          eventType: 'RECLAMATION_NEW',
          entityType: 'reclamation',
          externalId: payload.externalId,
          status: 'NEW',
          latitude: payload.latitude,
          longitude: payload.longitude,
          contractId: contract?._id.toString(),
          nroId: nro?._id.toString(),
        },
      );
      return {
        type: 'reclamations.new',
        externalId: payload.externalId,
        zoneId: zone._id.toString(),
        latitude: payload.latitude,
        longitude: payload.longitude,
        status: 'NEW',
        contractId: contract?._id.toString(),
        nroId: nro?._id.toString(),
        socketEvents: [
          {
            event: 'new_reclamation',
            payload: {
              externalId: payload.externalId,
              zoneId: zone._id.toString(),
              contractId: contract?._id.toString(),
              nroId: nro?._id.toString(),
              latitude: payload.latitude,
              longitude: payload.longitude,
              status: 'NEW',
            },
          },
        ],
        mapUpdate: {
          type: 'reclamation',
          action: 'upsert',
          payload: {
            externalId: payload.externalId,
            zoneId: zone._id.toString(),
            contractId: contract?._id.toString(),
            nroId: nro?._id.toString(),
            latitude: payload.latitude,
            longitude: payload.longitude,
            status: 'NEW',
          },
        },
      };
    }

    await this.notificationsService.notifyAdmin(
      `Reclamation ${payload.externalId} has no matching zone`,
      {
        eventType: 'RECLAMATION_NEW',
        entityType: 'reclamation',
        externalId: payload.externalId,
        status: 'NEW',
        latitude: payload.latitude,
        longitude: payload.longitude,
        contractId: contract?._id.toString(),
        nroId: nro?._id.toString(),
      },
    );

    return {
      type: 'reclamations.new',
      externalId: payload.externalId,
      latitude: payload.latitude,
      longitude: payload.longitude,
      status: 'NEW',
      contractId: contract?._id.toString(),
      nroId: nro?._id.toString(),
      socketEvents: [
        {
          event: 'new_reclamation',
          payload: {
            externalId: payload.externalId,
            contractId: contract?._id.toString(),
            nroId: nro?._id.toString(),
            latitude: payload.latitude,
            longitude: payload.longitude,
            status: 'NEW',
          },
        },
      ],
      mapUpdate: {
        type: 'reclamation',
        action: 'upsert',
        payload: {
          externalId: payload.externalId,
          contractId: contract?._id.toString(),
          nroId: nro?._id.toString(),
          latitude: payload.latitude,
          longitude: payload.longitude,
          status: 'NEW',
        },
      },
    };
  }

  findAll() {
    return this.reclamationModel.find().exec();
  }

  async findAllReclamations(): Promise<ReclamationDocument[]> {
    return this.reclamationModel
      .find()
      .sort({ createdAt: -1 })
      .exec();
  }

  async findReclamationsByZone(zoneId: string): Promise<ReclamationDocument[]> {
    return this.reclamationModel
      .find({ zoneId })
      .sort({ createdAt: -1 })
      .exec();
  }

  async getReclamationStats(): Promise<{
    total: number;
    byStatus: Record<string, number>;
    byZone: Record<string, number>;
  }> {
    const reclamations = await this.reclamationModel.find().exec();

    const byStatus: Record<string, number> = {};
    const byZone: Record<string, number> = {};

    reclamations.forEach((rec) => {
      byStatus[rec.status] = (byStatus[rec.status] ?? 0) + 1;
      if (rec.zoneId) {
        byZone[rec.zoneId] = (byZone[rec.zoneId] ?? 0) + 1;
      }
    });

    return {
      total: reclamations.length,
      byStatus,
      byZone,
    };
  }
}
