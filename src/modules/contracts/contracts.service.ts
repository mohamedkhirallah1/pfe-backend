import { BadRequestException, Injectable, Logger, NotFoundException, Optional } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import { NotificationsService } from '../notifications/notifications.service';
import { FdtService } from '../fdt/fdt.service';
import { NroService } from '../nro/nro.service';
import { TopologyService } from '../topology/topology.service';
import { isWithinTunisiaBounds } from '../zones/constants/tunisia-bounds.constant';
import { ZonesService } from '../zones/zones.service';
import { CancelContractEventDto } from './dto/cancel-contract-event.dto';
import { NewContractEventDto } from './dto/new-contract-event.dto';
import { CreateContractDto } from './dto/create-contract.dto';
import { Contract, ContractDocument, ContractStatus, ClientType } from './schemas/contract.schema';
import { NroStatus } from '../nro/schemas/nro.schema';
import { OperationActor } from '../../common/interfaces/operation-actor.interface';
import { AppRole } from '../auth/roles.enum';
import { WebsocketBroadcastGateway } from '../websocket-server/websocket-broadcast.gateway';

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
    private readonly topologyService: TopologyService,
    @Optional() private readonly websocketBroadcastGateway?: WebsocketBroadcastGateway,
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
        numeroTelephone: payload.numeroTelephone,
        numeroCIN: payload.numeroCIN,
        phoneNumber: payload.phoneNumber,
        cin: payload.cin,
        location: contractLocation,
        latitude: payload.latitude,
        longitude: payload.longitude,
        zoneId,
        regionId: zoneId,
        offreGB: payload.offreGB,
        bandwidth: payload.bandwidth,
        typeClient: payload.typeClient,
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

    if (!this.nroService.hasCapacityFor(nro, payload.offreGB)) {
      const rejectReason = 'CAPACITY_EXCEEDED';

      await this.contractModel.create({
        externalId: payload.externalId,
        numeroTelephone: payload.numeroTelephone,
        numeroCIN: payload.numeroCIN,
        phoneNumber: payload.phoneNumber,
        cin: payload.cin,
        location: contractLocation,
        latitude: payload.latitude,
        longitude: payload.longitude,
        zoneId,
        regionId: zoneId,
        nroId: nro.externalId,
        offreGB: payload.offreGB,
        bandwidth: payload.offreGB,
        typeClient: payload.typeClient,
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
          bandwidth: payload.offreGB,
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
        bandwidth: payload.offreGB,
        socketEvents: [
          {
            event: 'contract_failed',
            payload: {
              externalId: payload.externalId,
              latitude: payload.latitude,
              longitude: payload.longitude,
              coordinates: contractLocation.coordinates,
              bandwidth: payload.offreGB,
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

    // NRO capacity, FDT creation/port count, and the contract row must move together: if the
    // contract write failed after the NRO/FDT mutations, capacity was silently "leaked" (consumed
    // with no contract to show for it). A session transaction makes the three-step write atomic.
    let updatedNro: Awaited<ReturnType<NroService['updateCapacite']>>;
    let contract: ContractDocument;

    const executeContractCreation = async (session?: any) => {
      updatedNro = await this.nroService.updateCapacite(nro.externalId, payload.offreGB, session);

      await this.fdtService.handleNewFdtEvent(
        {
          externalId: fdtExternalId,
          nroId: updatedNro.externalId,
          regionId: zoneId,
          latitude: payload.latitude,
          longitude: payload.longitude,
        },
        session,
      );
      await this.fdtService.updatePorts(fdtExternalId, +1, session);

      contract = (await this.contractModel
        .findOneAndUpdate(
          { externalId: payload.externalId },
          {
            externalId: payload.externalId,
            numeroTelephone: payload.numeroTelephone,
            numeroCIN: payload.numeroCIN,
            phoneNumber: payload.phoneNumber,
            cin: payload.cin,
            location: contractLocation,
            latitude: payload.latitude,
            longitude: payload.longitude,
            zoneId,
            regionId: zoneId,
            nroId: updatedNro.externalId,
            fdtId: fdtExternalId,
            offreGB: payload.offreGB,
            bandwidth: payload.offreGB,
            typeClient: payload.typeClient,
            centraleId: updatedNro.centraleId,
            traceFDT: payload.traceFDT ? { type: 'LineString', coordinates: payload.traceFDT } : undefined,
            status: ContractStatus.ACTIVE,
            rejectReason: undefined,
            createdAt: new Date(),
          },
          { upsert: true, new: true, session },
        )
        .exec())!;
    };

    let session: any = null;
    try {
      session = await this.contractModel.db.startSession();
      await session.withTransaction(async () => {
        await executeContractCreation(session);
      });
    } catch (err: any) {
      if (err?.message && (err.message.includes('Transaction numbers') || err.message.includes('replica set'))) {
        await executeContractCreation(undefined);
      } else {
        throw err;
      }
    } finally {
      if (session) {
        await session.endSession();
      }
    }

    this.logger.log(`Contract ${payload.externalId} stored with status ACTIVE`);

    // Register the already-resolved FDT/NRO link in the topology counters. This does NOT
    // re-search for the nearest FDT/NRO (that already happened above, with capacity checks) —
    // it only increments the infrastructure counters so they stay consistent with this contract.
    try {
      await this.topologyService.registerContractLink(contract._id.toString(), fdtExternalId, updatedNro.externalId);
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      this.logger.warn(`Failed to register topology link for contract ${payload.externalId}: ${errorMessage}`);
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
      let updatedNro: Awaited<ReturnType<NroService['updateCapacite']>>;

      const executeContractCancel = async (cancelSession?: any) => {
        updatedNro = await this.nroService.updateCapacite(contract.nroId!, -contract.offreGB, cancelSession);

        // Update FDT ports
        if (contract.fdtId) {
          const fdt = await this.fdtService.findByExternalId(contract.fdtId);
          if (fdt) {
            await this.fdtService.updatePorts(fdt.externalId, -1, cancelSession);
          }
        }

        // Release the topology counters (activeClients/connectedFdtsCount) this contract had
        // claimed. Without this, activeClients only ever grows across contract cancellations.
        await this.topologyService.releaseContractTopology(contract._id.toString(), cancelSession);

        contract.status = ContractStatus.CANCELLED;
        contract.rejectReason = undefined;
        await contract.save({ session: cancelSession });
      };

      let cancelSession: any = null;
      try {
        cancelSession = await this.contractModel.db.startSession();
        await cancelSession.withTransaction(async () => {
          await executeContractCancel(cancelSession);
        });
      } catch (err: any) {
        if (err?.message && (err.message.includes('Transaction numbers') || err.message.includes('replica set'))) {
          await executeContractCancel(undefined);
        } else {
          throw err;
        }
      } finally {
        if (cancelSession) {
          await cancelSession.endSession();
        }
      }

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
          bandwidth: contract.offreGB,
          nroId: updatedNro.externalId,
        },
      );
    } else {
      // No NRO to release capacity from: a plain status update is already atomic as a single
      // document write, no transaction needed.
      contract.status = ContractStatus.CANCELLED;
      contract.rejectReason = undefined;
      await contract.save();
    }

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

    const releasedNro = contract.nroId ? await this.nroService.findByExternalId(contract.nroId) : null;

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
      socketEvents: releasedNro
        ? [
            {
              event: 'nro_updated',
              payload: {
                externalId: releasedNro.externalId,
                currentLoad: releasedNro.currentLoad,
                status: releasedNro.status,
                coordinates: releasedNro.location.coordinates,
                regionId: releasedNro.regionId,
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

  private toObjectId(id: string): Types.ObjectId {
    if (!Types.ObjectId.isValid(id)) {
      throw new BadRequestException(`Invalid contract id: ${id}`);
    }
    return new Types.ObjectId(id);
  }

  async findById(id: string): Promise<ContractDocument> {
    const contract = Types.ObjectId.isValid(id)
      ? await this.contractModel.findById(id).exec()
      : await this.contractModel.findOne({ externalId: id }).exec();

    if (!contract) {
      throw new NotFoundException(`Contract ${id} not found`);
    }
    return contract;
  }

  async findAll(zoneId?: string): Promise<ContractDocument[]> {
    const query = zoneId
      ? { $or: [{ zoneId }, { regionId: zoneId }] }
      : {};
    return this.contractModel.find(query).sort({ createdAt: -1 }).exec();
  }

  async createContract(dto: CreateContractDto, actor?: OperationActor): Promise<ContractDocument> {
    this.assertTunisiaCoordinates(dto.latitude, dto.longitude);

    if (!dto.fdtId) {
      throw new BadRequestException('Le point FDT parent (fdtId) est obligatoire pour créer un contrat.');
    }

    let fdt = await this.fdtService.findByExternalId(dto.fdtId);
    if (!fdt && Types.ObjectId.isValid(dto.fdtId)) {
      fdt = await this.fdtService.findById(dto.fdtId).catch(() => null);
    }
    if (!fdt) {
      throw new BadRequestException(`Point FDT parent introuvable ("${dto.fdtId}").`);
    }

    if (!fdt.nroId) {
      throw new BadRequestException('Le FDT sélectionné n\'est rattaché à aucun NRO parent.');
    }

    let nro = await this.nroService.findByExternalId(fdt.nroId);
    if (!nro && Types.ObjectId.isValid(fdt.nroId)) {
      nro = await this.nroService.findById(fdt.nroId).catch(() => null);
    }
    if (!nro) {
      throw new BadRequestException(`NRO parent (${fdt.nroId}) introuvable pour ce FDT.`);
    }

    if (dto.nroId && dto.nroId !== fdt.nroId && dto.nroId !== nro._id.toString()) {
      throw new BadRequestException('La hiérarchie FTTH sélectionnée est incohérente (FDT n\'appartient pas au NRO).');
    }

    if (dto.centraleId && nro.centraleId && nro.centraleId.toString() !== dto.centraleId) {
      throw new BadRequestException('La hiérarchie FTTH sélectionnée est incohérente (NRO n\'appartient pas à la Centrale).');
    }

    if (dto.regionId && nro.regionId && nro.regionId.toLowerCase() !== dto.regionId.toLowerCase()) {
      const nroZone = await this.zonesService.findByRegionIdentifier(nro.regionId);
      const dtoZone = await this.zonesService.findByRegionIdentifier(dto.regionId);
      if (nroZone && dtoZone && nroZone.name.toLowerCase() !== dtoZone.name.toLowerCase()) {
        throw new BadRequestException('La hiérarchie FTTH sélectionnée est incohérente (NRO n\'appartient pas à la Zone).');
      }
    }

    const externalId = dto.externalId || `CTR-${Date.now()}-${Math.floor(Math.random() * 1000)}`;
    const phone = dto.numeroTelephone || dto.phoneNumber || '';
    const cin = dto.numeroCIN || dto.cin || '';
    const bandwidth = dto.bandwidth ?? dto.offreGB ?? 50;

    // Check capacity
    if (!this.nroService.hasCapacityFor(nro, bandwidth)) {
      throw new BadRequestException(`Capacité du NRO ${nro.externalId} dépassée pour ce contrat.`);
    }

    // Update capacity & ports
    await this.nroService.updateCapacite(nro.externalId, bandwidth);
    await this.fdtService.updatePorts(fdt.externalId, +1);

    const contract = await this.contractModel.create({
      externalId,
      numeroTelephone: phone,
      phoneNumber: phone,
      numeroCIN: cin,
      cin,
      location: {
        type: 'Point',
        coordinates: this.toCoordinates(dto.latitude, dto.longitude),
      },
      latitude: dto.latitude,
      longitude: dto.longitude,
      zoneId: nro.regionId || dto.zoneId || dto.regionId,
      regionId: nro.regionId || dto.regionId || dto.zoneId,
      centraleId: nro.centraleId,
      nroId: nro.externalId,
      fdtId: fdt.externalId,
      bandwidth,
      offreGB: bandwidth,
      packageGb: bandwidth,
      typeClient: dto.typeClient ?? ClientType.MAISON,
      status: ContractStatus.ACTIVE,
      createdBy: actor?.userId,
      createdByRole: actor?.role,
      createdByEmail: actor?.email,
      createdAt: new Date(),
    });

    if (actor?.role === AppRole.SERVICE_CLIENT) {
      const msg = `Un nouveau contrat (${contract.externalId}) a été ajouté par le Service Client.`;
      if (this.notificationsService) {
        await this.notificationsService.notifyAdmin(msg, {
          eventType: 'CONTRACT_NEW',
          entityType: 'contract',
          externalId: contract.externalId,
          zoneId: contract.zoneId ?? contract.regionId,
          bandwidth: contract.bandwidth,
        });
        if (contract.zoneId || contract.regionId) {
          const targetZone = contract.zoneId || contract.regionId!;
          await this.notificationsService.notifyZoneManager(targetZone, msg, {
            eventType: 'CONTRACT_NEW',
            entityType: 'contract',
            externalId: contract.externalId,
            zoneId: targetZone,
            bandwidth: contract.bandwidth,
          });
        }
      }
      if (this.websocketBroadcastGateway) {
        this.websocketBroadcastGateway.broadcastEvent('contract.created', this.toContractMapPayload(contract));
        this.websocketBroadcastGateway.broadcastEvent('notification.created', {
          type: 'CONTRACT_NEW',
          message: msg,
          actor: { userId: actor.userId, role: actor.role, email: actor.email },
          timestamp: new Date().toISOString(),
        });
        this.websocketBroadcastGateway.broadcastMapUpdate({
          type: 'contract',
          action: 'upsert',
          payload: this.toContractMapPayload(contract),
        });
      }
    }

    return contract;
  }

  async deleteContract(id: string, actor?: OperationActor): Promise<void> {
    const contract = await this.findById(id);
    await this.handleCancelContractEvent({ externalId: contract.externalId });
    await this.contractModel.findByIdAndDelete(contract._id).exec();

    if (actor?.role === AppRole.SERVICE_CLIENT) {
      const msg = `Le contrat ${contract.externalId} a été supprimé par le Service Client.`;
      if (this.notificationsService) {
        await this.notificationsService.notifyAdmin(msg, {
          eventType: 'CONTRACT_CANCEL',
          entityType: 'contract',
          externalId: contract.externalId,
          zoneId: contract.zoneId ?? contract.regionId,
        });
        if (contract.zoneId || contract.regionId) {
          const targetZone = contract.zoneId || contract.regionId!;
          await this.notificationsService.notifyZoneManager(targetZone, msg, {
            eventType: 'CONTRACT_CANCEL',
            entityType: 'contract',
            externalId: contract.externalId,
            zoneId: targetZone,
          });
        }
      }
      if (this.websocketBroadcastGateway) {
        this.websocketBroadcastGateway.broadcastEvent('contract.deleted', {
          id: contract._id.toString(),
          externalId: contract.externalId,
          deletedBy: actor.email ?? actor.userId,
        });
        this.websocketBroadcastGateway.broadcastEvent('notification.created', {
          type: 'CONTRACT_DELETE',
          message: msg,
          actor: { userId: actor.userId, role: actor.role, email: actor.email },
          timestamp: new Date().toISOString(),
        });
        this.websocketBroadcastGateway.broadcastMapUpdate({
          type: 'contract',
          action: 'delete',
          payload: { externalId: contract.externalId },
        });
      }
    }
  }
}
