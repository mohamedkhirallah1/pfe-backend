import { Injectable, NotFoundException, BadRequestException, Optional } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import { Contract, ContractDocument } from '../../contracts/schemas/contract.schema';
import { Nro, NroDocument } from '../../nro/schemas/nro.schema';
import { Centrale, CentraleDocument, CentraleLocation } from '../schemas/centrale.schema';
import { CreateCentraleDto } from '../dto/create-centrale.dto';
import { UpdateCentraleDto } from '../dto/update-centrale.dto';
import { OperationActor } from '../../../common/interfaces/operation-actor.interface';
import { AppRole } from '../../auth/roles.enum';
import { NotificationsService } from '../../notifications/notifications.service';
import { WebsocketBroadcastGateway } from '../../websocket-server/websocket-broadcast.gateway';

@Injectable()
export class CentraleService {
  constructor(
    @InjectModel(Centrale.name) private centraleModel: Model<CentraleDocument>,
    @InjectModel(Nro.name) private nroModel: Model<NroDocument>,
    @InjectModel(Contract.name) private contractModel: Model<ContractDocument>,
    @Optional() private readonly notificationsService?: NotificationsService,
    @Optional() private readonly websocketBroadcastGateway?: WebsocketBroadcastGateway,
  ) {}

  /**
   * The DTO accepts a plain [lng, lat] tuple (simpler API contract); the schema stores a real
   * GeoJSON Point so the 2dsphere index works. This is the only place the conversion happens.
   */
  private toGeoJsonPoint(position: [number, number]): CentraleLocation {
    if (
      !Array.isArray(position) ||
      position.length !== 2 ||
      !position.every((coord) => typeof coord === 'number' && Number.isFinite(coord))
    ) {
      throw new BadRequestException('position must be a [longitude, latitude] tuple of numbers');
    }

    return { type: 'Point', coordinates: [position[0], position[1]] };
  }

  private toObjectId(id: string): Types.ObjectId {
    if (!Types.ObjectId.isValid(id)) {
      throw new BadRequestException(`Invalid centrale id: ${id}`);
    }
    return new Types.ObjectId(id);
  }

  async findAll(zoneId?: string): Promise<CentraleDocument[]> {
    const query = zoneId
      ? { regionId: this.toObjectId(zoneId) }
      : {};
    return this.centraleModel.find(query).exec();
  }

  async findById(id: string): Promise<CentraleDocument> {
    const centrale = await this.centraleModel
      .findById(this.toObjectId(id))
      .exec();
    if (!centrale) {
      throw new NotFoundException(`Centrale ${id} not found`);
    }
    return centrale;
  }

  async findByRegion(regionId: string): Promise<CentraleDocument[]> {
    return this.centraleModel
      .find({ regionId: this.toObjectId(regionId) })
      .exec();
  }

  async create(dto: CreateCentraleDto, actor?: OperationActor): Promise<CentraleDocument> {
    const centrale = new this.centraleModel({
      ...dto,
      regionId: this.toObjectId(dto.regionId),
      position: this.toGeoJsonPoint(dto.position),
      createdBy: actor?.userId,
      createdByRole: actor?.role,
      createdByEmail: actor?.email,
    });
    const saved = await centrale.save();

    if (actor?.role === AppRole.SERVICE_CLIENT) {
      const msg = `Une nouvelle centrale (${saved.nom} - ${saved.code}) a été ajoutée par le Service Client.`;
      if (this.notificationsService) {
        await this.notificationsService.notifyAdmin(msg, {
          eventType: 'CENTRALE_NEW',
          entityType: 'centrale',
          externalId: saved.code,
          regionId: saved.regionId?.toString(),
        });
        if (saved.regionId) {
          await this.notificationsService.notifyZoneManager(saved.regionId.toString(), msg, {
            eventType: 'CENTRALE_NEW',
            entityType: 'centrale',
            externalId: saved.code,
            regionId: saved.regionId.toString(),
          });
        }
      }
      if (this.websocketBroadcastGateway) {
        this.websocketBroadcastGateway.broadcastEvent('centrale.created', {
          id: saved._id.toString(),
          nom: saved.nom,
          code: saved.code,
          regionId: saved.regionId?.toString(),
          createdBy: actor.email ?? actor.userId,
        });
        this.websocketBroadcastGateway.broadcastEvent('notification.created', {
          type: 'CENTRALE_NEW',
          message: msg,
          actor: { userId: actor.userId, role: actor.role, email: actor.email },
          timestamp: new Date().toISOString(),
        });
        this.websocketBroadcastGateway.broadcastMapUpdate({
          type: 'centrale',
          action: 'create',
          payload: saved,
        });
      }
    }

    return saved;
  }

  async update(id: string, dto: UpdateCentraleDto): Promise<CentraleDocument> {
    const { position, regionId, ...rest } = dto;

    const update: Record<string, unknown> = { ...rest };
    if (position) {
      update.position = this.toGeoJsonPoint(position);
    }
    if (regionId) {
      update.regionId = this.toObjectId(regionId);
    }

    const centrale = await this.centraleModel
      .findByIdAndUpdate(this.toObjectId(id), { $set: update }, { new: true })
      .exec();
    if (!centrale) {
      throw new NotFoundException(`Centrale ${id} not found`);
    }
    return centrale;
  }

  async delete(id: string, actor?: OperationActor): Promise<void> {
    const centrale = await this.findById(id);
    const result = await this.centraleModel
      .findByIdAndDelete(this.toObjectId(id))
      .exec();
    if (!result) {
      throw new NotFoundException(`Centrale ${id} not found`);
    }

    if (actor?.role === AppRole.SERVICE_CLIENT) {
      const msg = `La centrale ${centrale.nom} (${centrale.code}) a été supprimée par le Service Client.`;
      if (this.notificationsService) {
        await this.notificationsService.notifyAdmin(msg, {
          eventType: 'CENTRALE_DELETE',
          entityType: 'centrale',
          externalId: centrale.code,
          regionId: centrale.regionId?.toString(),
        });
        if (centrale.regionId) {
          await this.notificationsService.notifyZoneManager(centrale.regionId.toString(), msg, {
            eventType: 'CENTRALE_DELETE',
            entityType: 'centrale',
            externalId: centrale.code,
            regionId: centrale.regionId.toString(),
          });
        }
      }
      if (this.websocketBroadcastGateway) {
        this.websocketBroadcastGateway.broadcastEvent('centrale.deleted', {
          id: centrale._id.toString(),
          nom: centrale.nom,
          code: centrale.code,
          regionId: centrale.regionId?.toString(),
          deletedBy: actor.email ?? actor.userId,
        });
        this.websocketBroadcastGateway.broadcastEvent('notification.created', {
          type: 'CENTRALE_DELETE',
          message: msg,
          actor: { userId: actor.userId, role: actor.role, email: actor.email },
          timestamp: new Date().toISOString(),
        });
        this.websocketBroadcastGateway.broadcastMapUpdate({
          type: 'centrale',
          action: 'delete',
          payload: { id: centrale._id.toString(), code: centrale.code },
        });
      }
    }
  }

  async findNrosByCentrale(id: string): Promise<NroDocument[]> {
    await this.findById(id); // 404s if the centrale itself doesn't exist
    return this.nroModel.find({ centraleId: this.toObjectId(id) }).exec();
  }

  async getStats(id: string): Promise<{
    capaciteTotal: number;
    nroCount: number;
    contratCount: number;
  }> {
    const centrale = await this.findById(id);
    const centraleId = this.toObjectId(id);

    const [nroCount, contratCount] = await Promise.all([
      this.nroModel.countDocuments({ centraleId }).exec(),
      this.contractModel.countDocuments({ centraleId }).exec(),
    ]);

    return {
      capaciteTotal: centrale.capaciteTotal,
      nroCount,
      contratCount,
    };
  }
}
