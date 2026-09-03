import { BadRequestException, Injectable, Logger, NotFoundException, Optional } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import { AiService } from '../ai/ai.service';
import { NotificationsService } from '../notifications/notifications.service';
import { ContractsService } from '../contracts/contracts.service';
import { NroService } from '../nro/nro.service';
import { isWithinTunisiaBounds } from '../zones/constants/tunisia-bounds.constant';
import { ZonesService } from '../zones/zones.service';
import { NewReclamationEventDto } from './dto/new-reclamation-event.dto';
import { CreateReclamationDto } from './dto/create-reclamation.dto';
import { Reclamation, ReclamationDocument, TypeReclamation } from './schemas/reclamation.schema';
import { OperationActor } from '../../common/interfaces/operation-actor.interface';
import { AppRole } from '../auth/roles.enum';
import { WebsocketBroadcastGateway } from '../websocket-server/websocket-broadcast.gateway';

type SocketEmission = {
  event: 'new_reclamation' | 'reclamation_created' | 'reclamation_deleted';
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

  /**
   * Maps the free-text issue type reported by the external system to the closed
   * TypeReclamation enum the schema requires. Independent from AiService.analyze's
   * category/priority, which stay free-text metadata for triage.
   */
  private resolveTypeReclamation(type: string): TypeReclamation {
    const text = type.toLowerCase();

    if (text.includes('coupure') || text.includes('panne') || text.includes('pas de signal')) {
      return TypeReclamation.COUPURE;
    }

    if (text.includes('lent') || text.includes('faible') || text.includes('debit') || text.includes('débit')) {
      return TypeReclamation.FAIBLE_DEBIT;
    }

    return TypeReclamation.REINITIALISATION;
  }

  constructor(
    @InjectModel(Reclamation.name)
    private readonly reclamationModel: Model<ReclamationDocument>,
    private readonly zonesService: ZonesService,
    private readonly contractsService: ContractsService,
    private readonly nroService: NroService,
    private readonly aiService: AiService,
    private readonly notificationsService: NotificationsService,
    @Optional() private readonly websocketBroadcastGateway?: WebsocketBroadcastGateway,
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
        numeroCIN: payload.numeroCIN,
        description: payload.type,
        typeReclamation: this.resolveTypeReclamation(payload.type),
        latitude: payload.latitude,
        longitude: payload.longitude,
        zoneId: zone?._id.toString(),
        regionId: zone?._id.toString(),
        // Same convention as Contract.nroId/Fdt.nroId (externalId, not _id) — read straight off
        // the linked contract, which already carries the full FTTH chain denormalized.
        nroId: contract?.nroId ?? nro?.externalId,
        fdtId: contract?.fdtId,
        centraleId: contract?.centraleId,
        contractId: contract?._id.toString(),
        status: 'NEW',
        category: analysis.category,
        priority: analysis.priority,
        recommendation: analysis.recommendation,
        urgence: analysis.priority === 'high',
        createdAt: new Date(),
      },
      { upsert: true, new: true, setDefaultsOnInsert: true },
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

  private toObjectId(id: string): Types.ObjectId {
    if (!Types.ObjectId.isValid(id)) {
      throw new BadRequestException(`Invalid reclamation id: ${id}`);
    }
    return new Types.ObjectId(id);
  }

  async findById(id: string): Promise<ReclamationDocument> {
    const rec = await this.reclamationModel.findById(this.toObjectId(id)).exec();
    if (!rec) {
      throw new NotFoundException(`Reclamation ${id} not found`);
    }
    return rec;
  }

  async createReclamation(dto: CreateReclamationDto, actor?: OperationActor): Promise<ReclamationDocument> {
    this.assertTunisiaCoordinates(dto.latitude, dto.longitude);

    const externalId = dto.externalId || `REC-${Date.now()}-${Math.floor(Math.random() * 1000)}`;
    const phone = dto.phoneNumber || dto.numeroTelephone || '';
    const cin = dto.numeroCIN || dto.cin || '';
    const descriptionText = dto.description || dto.type || 'Problème de connexion';

    const contract = await this.contractsService.findByPhoneOrCin(phone, cin);
    const zone = dto.zoneId || dto.regionId
      ? await this.zonesService.findByRegionIdentifier(dto.zoneId || dto.regionId!)
      : contract?.zoneId
        ? await this.zonesService.findByRegionIdentifier(contract.zoneId)
        : await this.zonesService.findZoneByCoordinates(dto.latitude, dto.longitude);

    const nro = dto.nroId
      ? await this.nroService.findByExternalId(dto.nroId)
      : contract?.nroId
        ? await this.nroService.findByExternalId(contract.nroId)
        : null;

    const analysis = this.aiService.analyze(descriptionText);
    const typeRecl = dto.typeReclamation || this.resolveTypeReclamation(descriptionText);

    const reclamation = await this.reclamationModel.create({
      externalId,
      phoneNumber: phone,
      cin,
      numeroCIN: cin,
      description: descriptionText,
      typeReclamation: typeRecl,
      latitude: dto.latitude,
      longitude: dto.longitude,
      zoneId: zone?._id.toString() || dto.zoneId,
      regionId: zone?._id.toString() || dto.regionId,
      nroId: dto.nroId || contract?.nroId || nro?.externalId,
      fdtId: dto.fdtId || contract?.fdtId,
      centraleId: contract?.centraleId,
      contractId: contract?._id.toString(),
      status: 'NEW',
      category: analysis.category,
      priority: analysis.priority,
      recommendation: analysis.recommendation,
      urgence: analysis.priority === 'high',
      createdBy: actor?.userId,
      createdByRole: actor?.role,
      createdByEmail: actor?.email,
      createdAt: new Date(),
    });

    if (actor?.role === AppRole.SERVICE_CLIENT) {
      const msg = `Une nouvelle réclamation (${externalId}) a été créée par le Service Client.`;
      if (this.notificationsService) {
        await this.notificationsService.notifyAdmin(msg, {
          eventType: 'RECLAMATION_NEW',
          entityType: 'reclamation',
          externalId,
          status: 'NEW',
          zoneId: reclamation.zoneId,
        });
        if (reclamation.zoneId) {
          await this.notificationsService.notifyZoneManager(reclamation.zoneId, msg, {
            eventType: 'RECLAMATION_NEW',
            entityType: 'reclamation',
            externalId,
            status: 'NEW',
            zoneId: reclamation.zoneId,
          });
        }
      }
      if (this.websocketBroadcastGateway) {
        this.websocketBroadcastGateway.broadcastEvent('reclamation.created', {
          id: reclamation._id.toString(),
          externalId: reclamation.externalId,
          zoneId: reclamation.zoneId,
          typeReclamation: reclamation.typeReclamation,
          status: reclamation.status,
          priority: reclamation.priority,
          createdBy: actor.email ?? actor.userId,
        });
        this.websocketBroadcastGateway.broadcastEvent('notification.created', {
          type: 'RECLAMATION_NEW',
          message: msg,
          actor: { userId: actor.userId, role: actor.role, email: actor.email },
          timestamp: new Date().toISOString(),
        });
      }
    }

    return reclamation;
  }

  async deleteReclamation(id: string, actor?: OperationActor): Promise<void> {
    const rec = await this.findById(id);
    await this.reclamationModel.findByIdAndDelete(this.toObjectId(id)).exec();

    if (actor?.role === AppRole.SERVICE_CLIENT) {
      const msg = `La réclamation ${rec.externalId} a été supprimée par le Service Client.`;
      if (this.notificationsService) {
        await this.notificationsService.notifyAdmin(msg, {
          eventType: 'RECLAMATION_DELETE',
          entityType: 'reclamation',
          externalId: rec.externalId,
          zoneId: rec.zoneId,
        });
        if (rec.zoneId) {
          await this.notificationsService.notifyZoneManager(rec.zoneId, msg, {
            eventType: 'RECLAMATION_DELETE',
            entityType: 'reclamation',
            externalId: rec.externalId,
            zoneId: rec.zoneId,
          });
        }
      }
      if (this.websocketBroadcastGateway) {
        this.websocketBroadcastGateway.broadcastEvent('reclamation.deleted', {
          id: rec._id.toString(),
          externalId: rec.externalId,
          zoneId: rec.zoneId,
          deletedBy: actor.email ?? actor.userId,
        });
        this.websocketBroadcastGateway.broadcastEvent('notification.created', {
          type: 'RECLAMATION_DELETE',
          message: msg,
          actor: { userId: actor.userId, role: actor.role, email: actor.email },
          timestamp: new Date().toISOString(),
        });
      }
    }
  }

  async findAll(): Promise<ReclamationDocument[]> {
    return this.reclamationModel.find().sort({ createdAt: -1 }).exec();
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
