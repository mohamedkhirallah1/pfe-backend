import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { AppRole } from '../auth/roles.enum';
import { Contract, ContractDocument } from '../contracts/schemas/contract.schema';
import { Fdt, FdtDocument } from '../fdt/schemas/fdt.schema';
import { NotificationsService } from '../notifications/notifications.service';
import { Nro, NroDocument } from '../nro/schemas/nro.schema';
import { Reclamation, ReclamationDocument } from '../reclamations/schemas/reclamation.schema';
import { Zone, ZoneDocument } from '../zones/schemas/zone.schema';

type AuthUser = {
  sub: string;
  role: AppRole;
  zoneId?: string;
};

type PointRecord = {
  _id: unknown;
  externalId: string;
  latitude: number;
  longitude: number;
  zoneId?: string;
  regionId?: string;
  status?: string;
  bandwidth?: number;
  nroId?: string;
  fdtId?: string;
  category?: string;
  priority?: string;
  recommendation?: string;
  description?: string;
  phoneNumber?: string;
  cin?: string;
  nro?: NroSummary | null;
  fdt?: FdtSummary | null;
};

type NroSummary = {
  _id: unknown;
  externalId: string;
  name: string;
  regionId?: string;
  location: { type: 'Point'; coordinates: [number, number] };
  maxCapacity: number;
  currentLoad: number;
  status: string;
};

type FdtSummary = {
  _id: unknown;
  externalId: string;
  nroId?: string;
  regionId?: string;
  location: { type: 'Point'; coordinates: [number, number] };
};

type EnrichedContract = {
  _id: unknown;
  externalId: string;
  location: { type: 'Point'; coordinates: [number, number] };
  phoneNumber?: string;
  cin?: string;
  status: string;
  latitude: number;
  longitude: number;
  bandwidth: number;
  zoneId?: string;
  nroId?: string;
  fdtId?: string;
  rejectReason?: string;
  regionId?: string;
  createdAt: Date;
  nro?: NroSummary | null;
  fdt?: FdtSummary | null;
};
type ContractLike = {
  _id: unknown;
  externalId: string;
  latitude: number;
  longitude: number;
  zoneId?: string;
  regionId?: string;
  status?: string;
  bandwidth?: number;
  nroId?: string;
  fdtId?: string;
  phoneNumber?: string;
  cin?: string;
  nro?: NroSummary | null;
  fdt?: FdtSummary | null;
};

type FeatureCollection = {
  type: 'FeatureCollection';
  features: Array<Record<string, unknown>>;
};

@Injectable()
export class MapService {
  constructor(
    @InjectModel(Contract.name)
    private readonly contractModel: Model<ContractDocument>,
    @InjectModel(Reclamation.name)
    private readonly reclamationModel: Model<ReclamationDocument>,
    @InjectModel(Zone.name)
    private readonly zoneModel: Model<ZoneDocument>,
    @InjectModel(Nro.name)
    private readonly nroModel: Model<NroDocument>,
    @InjectModel(Fdt.name)
    private readonly fdtModel: Model<FdtDocument>,
    private readonly notificationsService: NotificationsService,
  ) {}

  private isAdmin(user: AuthUser): boolean {
    return user.role === AppRole.ADMIN;
  }

  private zoneFilter(user: AuthUser): Record<string, unknown> {
    return this.isAdmin(user) ? {} : { zoneId: user.zoneId };
  }

  private regionFilter(user: AuthUser): Record<string, unknown> {
    return this.isAdmin(user) ? {} : { regionId: user.zoneId };
  }

  private toPointFeature(item: PointRecord, kind: 'contract' | 'reclamation') {
    return {
      type: 'Feature',
      geometry: {
        type: 'Point',
        coordinates: [item.longitude, item.latitude],
      },
      properties: {
        id: item._id,
        externalId: item.externalId,
        zoneId: item.zoneId,
        regionId: item.regionId,
        status: item.status,
        kind,
        bandwidth: item.bandwidth,
        nroId: item.nroId,
        fdtId: item.fdtId,
        category: item.category,
        priority: item.priority,
        recommendation: item.recommendation,
        description: item.description,
        phoneNumber: item.phoneNumber,
        cin: item.cin,
      },
    };
  }

  private async enrichContracts(contracts: ContractDocument[]): Promise<EnrichedContract[]> {
    const nroIds = [...new Set(contracts.map((contract) => contract.nroId).filter(Boolean))] as string[];
    const fdtIds = [...new Set(contracts.map((contract) => contract.fdtId).filter(Boolean))] as string[];

    const [nros, fdts] = await Promise.all([
      nroIds.length ? this.nroModel.find({ externalId: { $in: nroIds } }).exec() : Promise.resolve([]),
      fdtIds.length ? this.fdtModel.find({ externalId: { $in: fdtIds } }).exec() : Promise.resolve([]),
    ]);

    const nroByExternalId = new Map(nros.map((nro) => [nro.externalId, nro] as const));
    const fdtByExternalId = new Map(fdts.map((fdt) => [fdt.externalId, fdt] as const));

    return contracts.map((contract) => ({
      ...contract.toObject(),
      nro: contract.nroId ? (nroByExternalId.get(contract.nroId)?.toObject() ?? null) : null,
      fdt: contract.fdtId ? (fdtByExternalId.get(contract.fdtId)?.toObject() ?? null) : null,
    })) as EnrichedContract[];
  }

  private toNroFeature(nro: NroDocument) {
    return {
      type: 'Feature',
      geometry: nro.location,
      properties: {
        id: nro._id.toString(),
        externalId: nro.externalId,
        name: nro.name,
        regionId: nro.regionId,
        maxCapacity: nro.maxCapacity,
        currentLoad: nro.currentLoad,
        status: nro.status,
        kind: 'nro',
      },
    };
  }

  private toFdtFeature(fdt: FdtDocument) {
    return {
      type: 'Feature',
      geometry: fdt.location,
      properties: {
        id: fdt._id.toString(),
        externalId: fdt.externalId,
        nroId: fdt.nroId,
        regionId: fdt.regionId,
        kind: 'fdt',
      },
    };
  }

  private toPolygonFeature(zone: ZoneDocument, isServed: boolean) {
    return {
      type: 'Feature',
      geometry: zone.geometry,
      properties: {
        id: zone._id.toString(),
        name: zone.name,
        managerUserId: zone.managerUserId,
        kind: 'zone',
        isServed,
        coverageStatus: isServed ? 'ACTIVE' : 'INACTIVE',
      },
    };
  }

  private buildGraphNodes(
    contracts: ContractLike[],
    nros: NroDocument[],
    fdts: FdtDocument[],
  ): FeatureCollection {
    return {
      type: 'FeatureCollection',
      features: [
        ...nros.map((nro) => this.toNroFeature(nro)),
        ...fdts.map((fdt) => this.toFdtFeature(fdt)),
        ...contracts.map((contract) =>
          this.toPointFeature(
            {
              _id: contract._id,
              externalId: contract.externalId,
              latitude: contract.latitude,
              longitude: contract.longitude,
              zoneId: contract.zoneId,
              regionId: contract.regionId,
              status: contract.status,
              bandwidth: contract.bandwidth,
              nroId: contract.nroId,
              fdtId: contract.fdtId,
              phoneNumber: contract.phoneNumber,
              cin: contract.cin,
            },
            'contract',
          ),
        ),
      ],
    };
  }

  private buildGraphEdges(
    contracts: ContractLike[],
    nros: NroDocument[],
    fdts: FdtDocument[],
  ): FeatureCollection {
    return {
      type: 'FeatureCollection',
      features: [
        ...this.buildNroContractLinks(contracts, nros).features,
        ...this.buildNroFdtLinks(fdts, nros).features,
        ...this.buildFdtContractLinks(contracts, fdts).features,
      ],
    };
  }

  private toLineFeature(
    from: [number, number],
    to: [number, number],
    kind: 'nro-contract' | 'nro-fdt' | 'fdt-contract',
    properties: Record<string, unknown>,
  ) {
    return {
      type: 'Feature',
      geometry: {
        type: 'LineString',
        coordinates: [from, to],
      },
      properties: {
        kind,
        ...properties,
      },
    };
  }

  private buildNroContractLinks(contracts: ContractLike[], nros: NroDocument[]): FeatureCollection {
    const nroById = new Map(
      nros.flatMap((nro) => [
        [nro.externalId, nro] as const,
        [nro._id.toString(), nro] as const,
      ]),
    );

    return {
      type: 'FeatureCollection',
      features: contracts
        .filter((contract) => Boolean(contract.nroId))
        .map((contract) => {
          const nro = nroById.get(contract.nroId ?? '');

          if (!nro) {
            return null;
          }

          return this.toLineFeature(
            nro.location.coordinates,
            [contract.longitude, contract.latitude],
            'nro-contract',
            {
              contractId: contract._id.toString(),
              externalId: contract.externalId,
              nroId: nro._id.toString(),
              bandwidth: contract.bandwidth,
            },
          );
        })
        .filter((feature) => feature !== null) as Array<Record<string, unknown>>,
    };
  }

  private buildNroFdtLinks(fdts: FdtDocument[], nros: NroDocument[]): FeatureCollection {
    const nroById = new Map(
      nros.flatMap((nro) => [
        [nro.externalId, nro] as const,
        [nro._id.toString(), nro] as const,
      ]),
    );

    return {
      type: 'FeatureCollection',
      features: fdts
        .filter((fdt) => Boolean(fdt.nroId))
        .map((fdt) => {
          const nro = nroById.get(fdt.nroId ?? '');

          if (!nro) {
            return null;
          }

          return this.toLineFeature(
            nro.location.coordinates,
            fdt.location.coordinates,
            'nro-fdt',
            {
              fdtId: fdt._id.toString(),
              externalId: fdt.externalId,
              nroId: nro._id.toString(),
            },
          );
        })
        .filter((feature) => feature !== null) as Array<Record<string, unknown>>,
    };
  }

  private buildFdtContractLinks(contracts: ContractLike[], fdts: FdtDocument[]): FeatureCollection {
    const fdtById = new Map(
      fdts.flatMap((fdt) => [
        [fdt.externalId, fdt] as const,
        [fdt._id.toString(), fdt] as const,
      ]),
    );

    return {
      type: 'FeatureCollection',
      features: contracts
        .filter((contract) => Boolean(contract.fdtId))
        .map((contract) => {
          const fdt = fdtById.get(contract.fdtId ?? '');

          if (!fdt) {
            return null;
          }

          return this.toLineFeature(
            fdt.location.coordinates,
            [contract.longitude, contract.latitude],
            'fdt-contract',
            {
              contractId: contract._id.toString(),
              externalId: contract.externalId,
              fdtId: fdt._id.toString(),
              fdtExternalId: fdt.externalId,
              nroId: contract.nroId,
              bandwidth: contract.bandwidth,
            },
          );
        })
        .filter((feature) => feature !== null) as Array<Record<string, unknown>>,
    };
  }

  async getContracts(user: AuthUser) {
    const contracts = await this.contractModel.find(this.zoneFilter(user)).exec();
    return this.enrichContracts(contracts);
  }

  getReclamations(user: AuthUser) {
    return this.reclamationModel.find(this.zoneFilter(user)).exec();
  }

  getNros(user: AuthUser) {
    return this.nroModel.find(this.regionFilter(user)).exec();
  }

  getFdts(user: AuthUser) {
    return this.fdtModel.find(this.regionFilter(user)).exec();
  }

  getZones(user: AuthUser) {
    if (this.isAdmin(user)) {
      return this.zoneModel.find({ isActive: true }).exec();
    }

    return this.zoneModel.find({ _id: user.zoneId, isActive: true }).exec();
  }

  getZoneById(id: string, user: AuthUser) {
    if (this.isAdmin(user)) {
      return this.zoneModel.findById(id).exec();
    }

    if (user.zoneId !== id) {
      return null;
    }

    return this.zoneModel.findById(id).exec();
  }

  async getDashboard(user: AuthUser) {
    const [zones, contracts, reclamations, nros, fdts, history] = await Promise.all([
      this.getZones(user),
      this.getContracts(user),
      this.getReclamations(user),
      this.getNros(user),
      this.getFdts(user),
      this.notificationsService.findRecent(this.isAdmin(user) ? undefined : user.zoneId, 100),
    ]);

    const servedZoneIds = new Set(nros.map((nro) => nro.regionId).filter(Boolean));
    const servedZones = zones.filter((zone) => servedZoneIds.has(zone._id.toString()));

    return {
      stats: {
        zones: servedZones.length,
        contracts: contracts.length,
        reclamations: reclamations.length,
        nros: nros.length,
        fdts: fdts.length,
        history: history.length,
      },
      layers: {
        zones: {
          type: 'FeatureCollection',
          features: servedZones.map((zone) => this.toPolygonFeature(zone, true)),
        },
        contracts: {
          type: 'FeatureCollection',
          features: contracts.map((contract) =>
            this.toPointFeature(
              {
                _id: contract._id,
                externalId: contract.externalId,
                latitude: contract.latitude,
                longitude: contract.longitude,
                zoneId: contract.zoneId,
                regionId: contract.regionId,
                status: contract.status,
                bandwidth: contract.bandwidth,
                nroId: contract.nroId,
                fdtId: contract.fdtId,
                nro: contract.nro,
                fdt: contract.fdt,
                phoneNumber: contract.phoneNumber,
                cin: contract.cin,
              },
              'contract',
            ),
          ),
        },
        reclamations: {
          type: 'FeatureCollection',
          features: reclamations.map((reclamation) =>
            this.toPointFeature(
              {
                _id: reclamation._id,
                externalId: reclamation.externalId,
                latitude: reclamation.latitude,
                longitude: reclamation.longitude,
                zoneId: reclamation.zoneId,
                regionId: reclamation.regionId,
                status: reclamation.status,
                nroId: reclamation.nroId,
                category: reclamation.category,
                priority: reclamation.priority,
                recommendation: reclamation.recommendation,
                description: reclamation.description,
                phoneNumber: reclamation.phoneNumber,
                cin: reclamation.cin,
              },
              'reclamation',
            ),
          ),
        },
        nros: {
          type: 'FeatureCollection',
          features: nros.map((nro) => this.toNroFeature(nro)),
        },
        fdts: {
          type: 'FeatureCollection',
          features: fdts.map((fdt) => this.toFdtFeature(fdt)),
        },
        contractSchema: this.buildNroContractLinks(contracts, nros),
        fdtSchema: this.buildNroFdtLinks(fdts, nros),
        fdtContractSchema: this.buildFdtContractLinks(contracts, fdts),
        graph: {
          nodes: this.buildGraphNodes(contracts, nros, fdts),
          edges: this.buildGraphEdges(contracts, nros, fdts),
        },
      },
      history,
    };
  }
}