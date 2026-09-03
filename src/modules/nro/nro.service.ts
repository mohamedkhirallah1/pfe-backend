import { BadRequestException, ConflictException, Injectable, Logger, NotFoundException, Optional } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { ClientSession, Model, Types } from 'mongoose';
import { isWithinTunisiaBounds } from '../zones/constants/tunisia-bounds.constant';
import { ZonesService } from '../zones/zones.service';
import { CreateNroDto } from './dto/create-nro.dto';
import { DeleteNroEventDto } from './dto/delete-nro-event.dto';
import { NewNroEventDto } from './dto/new-nro-event.dto';
import { UpdateNroDto } from './dto/update-nro.dto';
import { UpdateNroEventDto } from './dto/update-nro-event.dto';
import { Nro, NroDocument, NroStatus, SaturationStatus } from './schemas/nro.schema';
import { Centrale, CentraleDocument } from '../centrale/schemas/centrale.schema';
import { OperationActor } from '../../common/interfaces/operation-actor.interface';
import { AppRole } from '../auth/roles.enum';
import { NotificationsService } from '../notifications/notifications.service';
import { WebsocketBroadcastGateway } from '../websocket-server/websocket-broadcast.gateway';

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
    @InjectModel(Centrale.name)
    private readonly centraleModel: Model<CentraleDocument>,
    private readonly zonesService: ZonesService,
    @Optional() private readonly notificationsService?: NotificationsService,
    @Optional() private readonly websocketBroadcastGateway?: WebsocketBroadcastGateway,
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

  /**
   * Recomputes tauxSaturation/statutSaturation/status from currentLoad/maxCapacity using the
   * same thresholds as updateCapacite, and persists the correction if stored values have
   * drifted. Used by the AI supervisor's self-healing pass. Returns true if a fix was applied.
   */
  async reconcileStatus(nro: NroDocument): Promise<boolean> {
    if (nro.maxCapacity <= 0 || nro.status === NroStatus.DOWN || nro.status === NroStatus.DELETED) {
      return false;
    }

    const taux = (nro.currentLoad / nro.maxCapacity) * 100;
    const expectedSaturation =
      taux < 70 ? SaturationStatus.NORMAL : taux <= 100 ? SaturationStatus.CHARGE : SaturationStatus.SATURE;
    const expectedStatus = nro.currentLoad >= nro.maxCapacity ? NroStatus.SATURATED : NroStatus.ACTIVE;

    const driftedSaturation = nro.statutSaturation !== expectedSaturation || Math.abs(nro.tauxSaturation - taux) > 0.5;
    const driftedStatus = nro.status !== expectedStatus;

    if (!driftedSaturation && !driftedStatus) {
      return false;
    }

    this.logger.warn(
      `NRO ${nro.externalId} saturation drift detected: statutSaturation=${nro.statutSaturation}->${expectedSaturation}, status=${nro.status}->${expectedStatus}. Auto-correcting.`,
    );
    nro.tauxSaturation = taux;
    nro.statutSaturation = expectedSaturation;
    nro.status = expectedStatus;
    await nro.save();
    return true;
  }

  /**
   * Single source of truth for NRO capacity accounting. `currentLoad`/`maxCapacity` are the
   * fields actually surfaced to the map/dashboard API, so they drive `status`; `capaciteUtilisee`/
   * `capacityGb`/`tauxSaturation`/`statutSaturation` are kept mirrored for any consumer still
   * reading the French-named fields, but are never the fields decisions are based on.
   * This replaces the old incrementLoad/decrementLoad pair, which nothing called and which
   * tracked capacity independently of this method — two competing systems that could disagree.
   */
  async updateCapacite(nroId: string, delta: number, session?: ClientSession): Promise<NroDocument> {
    const nro = await this.nroModel.findOne({ externalId: nroId }).session(session ?? null).exec();

    if (!nro) {
      throw new NotFoundException(`NRO ${nroId} not found`);
    }

    nro.currentLoad = Math.max(0, nro.currentLoad + delta);
    nro.capaciteUtilisee = nro.currentLoad;
    nro.capacityGb = nro.maxCapacity;

    const taux = nro.maxCapacity > 0 ? (nro.currentLoad / nro.maxCapacity) * 100 : 0;
    nro.tauxSaturation = taux;

    if (taux < 70) {
      nro.statutSaturation = SaturationStatus.NORMAL;
    } else if (taux <= 100) {
      nro.statutSaturation = SaturationStatus.CHARGE;
    } else {
      nro.statutSaturation = SaturationStatus.SATURE;
    }

    if (nro.status !== NroStatus.DOWN && nro.status !== NroStatus.DELETED) {
      nro.status = nro.currentLoad >= nro.maxCapacity ? NroStatus.SATURATED : NroStatus.ACTIVE;
    }

    await nro.save({ session });
    this.logger.log(
      `NRO ${nroId} capacity updated: delta=${delta}, currentLoad=${nro.currentLoad}/${nro.maxCapacity}, status=${nro.status}`,
    );

    return nro;
  }

  /**
   * True if adding `deltaGb` would push usage past maxCapacity. Used to reject a contract
   * before any state is mutated (contracts.service checks this ahead of updateCapacite).
   */
  hasCapacityFor(nro: NroDocument, deltaGb: number): boolean {
    if (nro.maxCapacity <= 0) {
      return true;
    }
    return nro.currentLoad + deltaGb <= nro.maxCapacity;
  }

  // ---- Manual admin CRUD (distinct from the event-driven handlers above) ----
  // Lets an admin create/fix/delete NRO records directly instead of depending solely on the
  // external event simulator, which is what was requested to unblock test-data management.

  private toObjectId(id: string): Types.ObjectId {
    if (!Types.ObjectId.isValid(id)) {
      throw new BadRequestException(`Invalid NRO id: ${id}`);
    }
    return new Types.ObjectId(id);
  }

  async findAll(regionId?: string): Promise<NroDocument[]> {
    const filter: Record<string, unknown> = { status: { $ne: NroStatus.DELETED } };
    if (regionId) {
      filter.regionId = regionId;
    }
    return this.nroModel.find(filter).exec();
  }

  async findById(id: string): Promise<NroDocument> {
    const nro = await this.nroModel.findById(this.toObjectId(id)).exec();
    if (!nro) {
      throw new NotFoundException(`NRO ${id} not found`);
    }
    return nro;
  }

  async create(dto: CreateNroDto, actor?: OperationActor): Promise<NroDocument> {
    this.assertTunisiaCoordinates(dto.latitude, dto.longitude);

    if (!dto.centraleId) {
      throw new BadRequestException('La Centrale parente est obligatoire pour créer un NRO.');
    }

    let centrale: CentraleDocument | null = null;
    if (Types.ObjectId.isValid(dto.centraleId)) {
      centrale = await this.centraleModel.findById(dto.centraleId).exec();
    }
    if (!centrale) {
      centrale = await this.centraleModel.findOne({ code: dto.centraleId }).exec();
    }
    if (!centrale) {
      throw new BadRequestException(`Centrale parente introuvable ("${dto.centraleId}").`);
    }

    // Verify Zone matching
    const zone = await this.zonesService.findByRegionIdentifier(dto.regionId);
    if (!zone) {
      throw new BadRequestException(`Zone "${dto.regionId}" introuvable.`);
    }
    const centraleZone = await this.zonesService.findByRegionIdentifier(centrale.regionId.toString());
    if (centraleZone && zone && centraleZone.name.toLowerCase() !== zone.name.toLowerCase()) {
      throw new BadRequestException(
        `La Centrale "${centrale.nom}" (${centrale.code}) appartient à la zone "${centraleZone.name}", et non à "${zone.name}".`,
      );
    }

    const existing = await this.nroModel.findOne({ externalId: dto.externalId }).exec();
    if (existing) {
      throw new ConflictException(`NRO with externalId "${dto.externalId}" already exists`);
    }

    const nro = await this.nroModel.create({
      externalId: dto.externalId,
      name: dto.name,
      regionId: zone.name,
      centraleId: centrale._id,
      location: {
        type: 'Point',
        coordinates: this.toCoordinates(dto.latitude, dto.longitude),
      },
      maxCapacity: dto.maxCapacity,
      status: dto.status ?? NroStatus.ACTIVE,
      lastEventType: 'MANUAL_CREATE',
      createdBy: actor?.userId,
      createdByRole: actor?.role,
      createdByEmail: actor?.email,
    });

    if (actor?.role === AppRole.SERVICE_CLIENT) {
      const msg = `Un nouveau NRO (${nro.name} - ${nro.externalId}) a été ajouté par le Service Client.`;
      if (this.notificationsService) {
        await this.notificationsService.notifyAdmin(msg, {
          eventType: 'NRO_NEW',
          entityType: 'nro',
          externalId: nro.externalId,
          regionId: nro.regionId,
        });
        if (nro.regionId) {
          await this.notificationsService.notifyZoneManager(nro.regionId, msg, {
            eventType: 'NRO_NEW',
            entityType: 'nro',
            externalId: nro.externalId,
            regionId: nro.regionId,
          });
        }
      }
      if (this.websocketBroadcastGateway) {
        this.websocketBroadcastGateway.broadcastEvent('nro.created', this.toMapPayload(nro));
        this.websocketBroadcastGateway.broadcastEvent('notification.created', {
          type: 'NRO_NEW',
          message: msg,
          actor: { userId: actor.userId, role: actor.role, email: actor.email },
          timestamp: new Date().toISOString(),
        });
        this.websocketBroadcastGateway.broadcastMapUpdate({
          type: 'nro',
          action: 'upsert',
          payload: this.toMapPayload(nro),
        });
      }
    }

    return nro;
  }

  async update(id: string, dto: UpdateNroDto): Promise<NroDocument> {
    const nro = await this.findById(id);

    if (dto.name !== undefined) {
      nro.name = dto.name;
    }
    if (dto.regionId !== undefined) {
      nro.regionId = dto.regionId;
    }
    if (dto.latitude !== undefined && dto.longitude !== undefined) {
      this.assertTunisiaCoordinates(dto.latitude, dto.longitude);
      nro.location = {
        type: 'Point',
        coordinates: this.toCoordinates(dto.latitude, dto.longitude),
      };
    }
    if (dto.maxCapacity !== undefined) {
      nro.maxCapacity = dto.maxCapacity;
    }
    if (dto.status !== undefined) {
      nro.status = dto.status;
    }

    nro.lastEventType = 'MANUAL_UPDATE';
    return nro.save();
  }

  async remove(id: string, actor?: OperationActor): Promise<void> {
    const nro = await this.findById(id);
    nro.status = NroStatus.DELETED;
    nro.deletedAt = new Date();
    nro.lastEventType = 'MANUAL_DELETE';
    await nro.save();

    if (actor?.role === AppRole.SERVICE_CLIENT) {
      const msg = `Le NRO ${nro.name} (${nro.externalId}) a été supprimé par le Service Client.`;
      if (this.notificationsService) {
        await this.notificationsService.notifyAdmin(msg, {
          eventType: 'NRO_DELETE',
          entityType: 'nro',
          externalId: nro.externalId,
          regionId: nro.regionId,
        });
        if (nro.regionId) {
          await this.notificationsService.notifyZoneManager(nro.regionId, msg, {
            eventType: 'NRO_DELETE',
            entityType: 'nro',
            externalId: nro.externalId,
            regionId: nro.regionId,
          });
        }
      }
      if (this.websocketBroadcastGateway) {
        this.websocketBroadcastGateway.broadcastEvent('nro.deleted', this.toMapPayload(nro));
        this.websocketBroadcastGateway.broadcastEvent('notification.created', {
          type: 'NRO_DELETE',
          message: msg,
          actor: { userId: actor.userId, role: actor.role, email: actor.email },
          timestamp: new Date().toISOString(),
        });
        this.websocketBroadcastGateway.broadcastMapUpdate({
          type: 'nro',
          action: 'delete',
          payload: this.toMapPayload(nro),
        });
      }
    }
  }
}