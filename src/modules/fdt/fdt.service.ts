import { BadRequestException, ConflictException, Injectable, Logger, NotFoundException, Optional } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { ClientSession, Model, Types } from 'mongoose';
import { NroService } from '../nro/nro.service';
import { isWithinTunisiaBounds } from '../zones/constants/tunisia-bounds.constant';
import { ZonesService } from '../zones/zones.service';
import { CreateFdtDto } from './dto/create-fdt.dto';
import { NewFdtEventDto } from './dto/new-fdt-event.dto';
import { UpdateFdtDto } from './dto/update-fdt.dto';
import { Fdt, FdtDocument, FdtStatus, FdtStatut } from './schemas/fdt.schema';
import { OperationActor } from '../../common/interfaces/operation-actor.interface';
import { AppRole } from '../auth/roles.enum';
import { NotificationsService } from '../notifications/notifications.service';
import { WebsocketBroadcastGateway } from '../websocket-server/websocket-broadcast.gateway';

type SocketEmission = {
  event: 'new_fdt' | 'fdt_created' | 'fdt_deleted';
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
    @Optional() private readonly notificationsService?: NotificationsService,
    @Optional() private readonly websocketBroadcastGateway?: WebsocketBroadcastGateway,
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

  async handleNewFdtEvent(payload: NewFdtEventDto, session?: ClientSession): Promise<FdtProcessResult> {
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
      { upsert: true, new: true, session },
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

  async updatePorts(fdtId: string, delta: number, session?: ClientSession): Promise<FdtDocument> {
    const fdt = await this.fdtModel.findOne({ externalId: fdtId }).session(session ?? null).exec();

    if (!fdt) {
      throw new NotFoundException(`FDT ${fdtId} not found`);
    }

    // Update ports usage, ensure it stays within bounds
    fdt.nbPortsUtilises = Math.max(0, Math.min(fdt.nbPortsTotal, fdt.nbPortsUtilises + delta));

    // Recalculate FDT status based on port occupation
    const occupation = (fdt.nbPortsUtilises / fdt.nbPortsTotal) * 100;

    if (occupation < 70) {
      fdt.statutFdt = FdtStatut.DISPONIBLE;
    } else if (occupation < 100) {
      fdt.statutFdt = FdtStatut.CHARGE;
    } else {
      fdt.statutFdt = FdtStatut.PLEIN;
    }

    await fdt.save({ session });
    this.logger.log(`FDT ${fdtId} ports updated: delta=${delta}, occupation=${occupation}%, status=${fdt.statutFdt}`);

    return fdt;
  }

  // Public lookup helpers so other services don't access the model directly
  async findByExternalId(externalId: string): Promise<FdtDocument | null> {
    return this.fdtModel.findOne({ externalId }).exec();
  }

  /**
   * Recomputes statutFdt from nbPortsUtilises/nbPortsTotal using the same thresholds as
   * updatePorts, and persists the correction if the stored value has drifted (e.g. a port
   * count was edited manually without going through updatePorts). Used by the AI supervisor's
   * self-healing pass. Returns true if a fix was applied.
   */
  async reconcileStatus(fdt: FdtDocument): Promise<boolean> {
    if (fdt.nbPortsTotal <= 0) {
      return false;
    }

    const occupation = (fdt.nbPortsUtilises / fdt.nbPortsTotal) * 100;
    const expected =
      occupation < 70 ? FdtStatut.DISPONIBLE : occupation < 100 ? FdtStatut.CHARGE : FdtStatut.PLEIN;

    if (fdt.statutFdt === expected) {
      return false;
    }

    this.logger.warn(
      `FDT ${fdt.externalId} statutFdt drift detected: stored=${fdt.statutFdt}, expected=${expected} (occupation=${occupation.toFixed(1)}%). Auto-correcting.`,
    );
    fdt.statutFdt = expected;
    await fdt.save();
    return true;
  }

  private toObjectId(id: string): Types.ObjectId {
    if (!Types.ObjectId.isValid(id)) {
      throw new BadRequestException(`Invalid FDT id: ${id}`);
    }
    return new Types.ObjectId(id);
  }

  async findById(id: string): Promise<FdtDocument> {
    const fdt = await this.fdtModel.findById(this.toObjectId(id)).exec();
    if (!fdt) {
      throw new NotFoundException(`FDT ${id} not found`);
    }
    return fdt;
  }

  // ---- Manual admin CRUD (distinct from the event-driven handlers above) ----
  // Lets an admin create/fix/delete FDT records directly instead of depending solely on the
  // external event simulator, which is what was requested to unblock test-data management.

  async findAll(regionId?: string): Promise<FdtDocument[]> {
    const filter: Record<string, unknown> = {};
    if (regionId) {
      filter.regionId = regionId;
    }
    return this.fdtModel.find(filter).exec();
  }

  async create(dto: CreateFdtDto, actor?: OperationActor): Promise<FdtDocument> {
    this.assertTunisiaCoordinates(dto.latitude, dto.longitude);

    if (!dto.nroId) {
      throw new BadRequestException('Le NRO parent (nroId) est obligatoire pour créer un FDT.');
    }

    let nro = await this.nroService.findByExternalId(dto.nroId);
    if (!nro && Types.ObjectId.isValid(dto.nroId)) {
      nro = await this.nroService.findById(dto.nroId).catch(() => null);
    }
    if (!nro) {
      throw new BadRequestException(`NRO parent introuvable ("${dto.nroId}").`);
    }

    if (dto.centraleId && nro.centraleId && nro.centraleId.toString() !== dto.centraleId) {
      throw new BadRequestException('Le NRO sélectionné n\'appartient pas à la Centrale choisie.');
    }

    if (dto.regionId && nro.regionId && nro.regionId.toLowerCase() !== dto.regionId.toLowerCase()) {
      const nroZone = await this.zonesService.findByRegionIdentifier(nro.regionId);
      const dtoZone = await this.zonesService.findByRegionIdentifier(dto.regionId);
      if (nroZone && dtoZone && nroZone.name.toLowerCase() !== dtoZone.name.toLowerCase()) {
        throw new BadRequestException('Le NRO sélectionné n\'appartient pas à la Zone choisie.');
      }
    }

    const existing = await this.fdtModel.findOne({ externalId: dto.externalId }).exec();
    if (existing) {
      throw new ConflictException(`FDT with externalId "${dto.externalId}" already exists`);
    }

    const fdt = await this.fdtModel.create({
      externalId: dto.externalId,
      nroId: nro.externalId,
      centraleId: nro.centraleId,
      regionId: nro.regionId ?? dto.regionId,
      location: {
        type: 'Point',
        coordinates: this.toCoordinates(dto.latitude, dto.longitude),
      },
      nbPortsTotal: dto.nbPortsTotal || 64,
      maxClients: dto.maxClients || dto.nbPortsTotal || 64,
      status: dto.status ?? FdtStatus.ACTIVE,
      createdBy: actor?.userId,
      createdByRole: actor?.role,
      createdByEmail: actor?.email,
    });

    if (actor?.role === AppRole.SERVICE_CLIENT) {
      const msg = `Un nouveau FDT (${fdt.externalId}) a été ajouté par le Service Client.`;
      if (this.notificationsService) {
        await this.notificationsService.notifyAdmin(msg, {
          eventType: 'FDT_NEW',
          entityType: 'fdt',
          externalId: fdt.externalId,
          regionId: fdt.regionId,
        });
        if (fdt.regionId) {
          await this.notificationsService.notifyZoneManager(fdt.regionId, msg, {
            eventType: 'FDT_NEW',
            entityType: 'fdt',
            externalId: fdt.externalId,
            regionId: fdt.regionId,
          });
        }
      }
      if (this.websocketBroadcastGateway) {
        this.websocketBroadcastGateway.broadcastEvent('fdt.created', this.toMapPayload(fdt));
        this.websocketBroadcastGateway.broadcastEvent('notification.created', {
          type: 'FDT_NEW',
          message: msg,
          actor: { userId: actor.userId, role: actor.role, email: actor.email },
          timestamp: new Date().toISOString(),
        });
        this.websocketBroadcastGateway.broadcastMapUpdate({
          type: 'fdt',
          action: 'upsert',
          payload: this.toMapPayload(fdt),
        });
      }
    }

    return fdt;
  }

  async update(id: string, dto: UpdateFdtDto): Promise<FdtDocument> {
    const fdt = await this.findById(id);

    if (dto.nroId !== undefined) {
      fdt.nroId = dto.nroId;
    }
    if (dto.regionId !== undefined) {
      fdt.regionId = dto.regionId;
    }
    if (dto.latitude !== undefined && dto.longitude !== undefined) {
      this.assertTunisiaCoordinates(dto.latitude, dto.longitude);
      fdt.location = {
        type: 'Point',
        coordinates: this.toCoordinates(dto.latitude, dto.longitude),
      };
    }
    if (dto.nbPortsTotal !== undefined) {
      fdt.nbPortsTotal = dto.nbPortsTotal;
    }
    if (dto.maxClients !== undefined) {
      fdt.maxClients = dto.maxClients;
    }
    if (dto.status !== undefined) {
      fdt.status = dto.status;
    }

    return fdt.save();
  }

  async remove(id: string, actor?: OperationActor): Promise<void> {
    const fdt = await this.findById(id);
    const result = await this.fdtModel.findByIdAndDelete(this.toObjectId(id)).exec();
    if (!result) {
      throw new NotFoundException(`FDT ${id} not found`);
    }

    if (actor?.role === AppRole.SERVICE_CLIENT) {
      const msg = `Le FDT ${fdt.externalId} a été supprimé par le Service Client.`;
      if (this.notificationsService) {
        await this.notificationsService.notifyAdmin(msg, {
          eventType: 'FDT_DELETE',
          entityType: 'fdt',
          externalId: fdt.externalId,
          regionId: fdt.regionId,
        });
        if (fdt.regionId) {
          await this.notificationsService.notifyZoneManager(fdt.regionId, msg, {
            eventType: 'FDT_DELETE',
            entityType: 'fdt',
            externalId: fdt.externalId,
            regionId: fdt.regionId,
          });
        }
      }
      if (this.websocketBroadcastGateway) {
        this.websocketBroadcastGateway.broadcastEvent('fdt.deleted', this.toMapPayload(fdt));
        this.websocketBroadcastGateway.broadcastEvent('notification.created', {
          type: 'FDT_DELETE',
          message: msg,
          actor: { userId: actor.userId, role: actor.role, email: actor.email },
          timestamp: new Date().toISOString(),
        });
        this.websocketBroadcastGateway.broadcastMapUpdate({
          type: 'fdt',
          action: 'delete',
          payload: this.toMapPayload(fdt),
        });
      }
    }
  }
}