import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import { AppRole } from '../auth/roles.enum';
import { Centrale, CentraleDocument } from '../centrale/schemas/centrale.schema';
import { Contract, ContractDocument } from '../contracts/schemas/contract.schema';
import { Fdt, FdtDocument } from '../fdt/schemas/fdt.schema';
import { NotificationsService } from '../notifications/notifications.service';
import { Nro, NroDocument } from '../nro/schemas/nro.schema';
import { Reclamation, ReclamationDocument } from '../reclamations/schemas/reclamation.schema';
import { Zone, ZoneDocument } from '../zones/schemas/zone.schema';
import { CentralFiber, CentralFiberDocument } from '../central-fiber/schemas/central-fiber.schema';
import { normalizeTunisiaRegionName } from '../zones/constants/tunisia-region-centers.constant';

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
  centralFiberId?: string;
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
  centralFiberId?: string;
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
    @InjectModel(Centrale.name)
    private readonly centraleModel: Model<CentraleDocument>,
    @InjectModel(CentralFiber.name)
    private readonly centralFiberModel: Model<CentralFiberDocument>,
    private readonly notificationsService: NotificationsService,
  ) {}

  private isAdmin(user: AuthUser): boolean {
    return user.role === AppRole.ADMIN;
  }

  private isGlobalViewer(user: AuthUser): boolean {
    return user.role === AppRole.ADMIN || user.role === AppRole.SERVICE_CLIENT;
  }

  private zoneFilter(user: AuthUser): Record<string, unknown> {
    return this.isGlobalViewer(user) ? {} : { zoneId: user.zoneId };
  }

  private regionFilter(user: AuthUser): Record<string, unknown> {
    return this.isGlobalViewer(user) ? {} : { regionId: user.zoneId };
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

  private toCentraleFeature(centrale: CentraleDocument) {
    return {
      type: 'Feature',
      geometry: centrale.position,
      properties: {
        id: centrale._id.toString(),
        nom: centrale.nom,
        code: centrale.code,
        ville: centrale.ville,
        regionId: centrale.regionId?.toString(),
        capaciteTotal: centrale.capaciteTotal,
        kind: 'centrale',
      },
    };
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
    centrales: CentraleDocument[],
  ): FeatureCollection {
    return {
      type: 'FeatureCollection',
      features: [
        ...centrales.map((centrale) => this.toCentraleFeature(centrale)),
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
    centrales: CentraleDocument[],
  ): FeatureCollection {
    return {
      type: 'FeatureCollection',
      features: [
        ...this.buildCentraleNroLinks(nros, centrales).features,
        ...this.buildNroContractLinks(contracts, nros).features,
        ...this.buildNroFdtLinks(fdts, nros).features,
        ...this.buildFdtContractLinks(contracts, fdts).features,
      ],
    };
  }

  private toLineFeature(
    from: [number, number],
    to: [number, number],
    kind: 'nro-contract' | 'nro-fdt' | 'fdt-contract' | 'centrale-nro',
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

  private buildCentraleNroLinks(nros: NroDocument[], centrales: CentraleDocument[]): FeatureCollection {
    const centraleById = new Map(centrales.map((centrale) => [centrale._id.toString(), centrale] as const));

    return {
      type: 'FeatureCollection',
      features: nros
        .filter((nro) => Boolean(nro.centraleId))
        .map((nro) => {
          const centrale = centraleById.get(nro.centraleId!.toString());

          if (!centrale) {
            return null;
          }

          return this.toLineFeature(
            centrale.position.coordinates,
            nro.location.coordinates,
            'centrale-nro',
            {
              nroId: nro._id.toString(),
              externalId: nro.externalId,
              centraleId: centrale._id.toString(),
              centraleCode: centrale.code,
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

  // ===========================================================================================
  // Hierarchy-derived endpoints (Step 5 / Step 4): unlike the geographic getNros()/getFdts()
  // above (which filter by each entity's own denormalized regionId — the right view for "what's
  // physically in my zone"), everything below walks the real FK chain
  // Zone -> Centrale.regionId -> Nro.centraleId -> Fdt.nroId -> Contract.fdtId, so a Centrale
  // that serves NROs outside its own HQ zone is still counted under the right zone here.
  // ===========================================================================================

  private groupBy<T, K>(items: T[], keyFn: (item: T) => K | undefined): Map<K, T[]> {
    const map = new Map<K, T[]>();
    for (const item of items) {
      const key = keyFn(item);
      if (key === undefined) continue;
      const bucket = map.get(key);
      if (bucket) bucket.push(item);
      else map.set(key, [item]);
    }
    return map;
  }
  private async getVisibleZones(user: AuthUser): Promise<ZoneDocument[]> {
    if (this.isGlobalViewer(user)) {
      return this.zoneModel.find({ isActive: true }).exec();
    }
    if (!user.zoneId) {
      return [];
    }
    if (Types.ObjectId.isValid(user.zoneId)) {
      const byId = await this.zoneModel.find({ _id: user.zoneId, isActive: true }).exec();
      if (byId.length > 0) return byId;
    }
    const normalized = normalizeTunisiaRegionName(user.zoneId);
    if (normalized) {
      return this.zoneModel.find({ name: normalized, isActive: true }).exec();
    }
    return this.zoneModel.find({ name: user.zoneId, isActive: true }).exec();
  }

  /** Zone -> Centrales -> NROs -> FDTs -> Contracts, fully nested, for the frontend to render
   *  the hierarchy directly instead of stitching flat collections back together itself. */
  async getHierarchy(user: AuthUser) {
    const [zones, centrales, nros, fdts, contracts] = await Promise.all([
      this.getVisibleZones(user),
      this.centraleModel.find().exec(),
      this.nroModel.find().exec(),
      this.fdtModel.find().exec(),
      this.contractModel.find().exec(),
    ]);

    const nrosByCentrale = this.groupBy(nros, (n) => n.centraleId?.toString());
    const fdtsByNro = this.groupBy(fdts, (f) => f.nroId);
    const contractsByFdt = this.groupBy(contracts, (c) => c.fdtId);

    return zones.map((zone) => {
      const zoneId = zone._id.toString();
      const zoneCentrales = centrales.filter((c) => c.regionId?.toString() === zoneId);

      return {
        zoneId,
        zoneName: zone.name,
        centrales: zoneCentrales.map((centrale) => {
          const centraleNros = nrosByCentrale.get(centrale._id.toString()) ?? [];

          return {
            id: centrale._id.toString(),
            nom: centrale.nom,
            code: centrale.code,
            ville: centrale.ville,
            capaciteTotal: centrale.capaciteTotal,
            position: centrale.position,
            nros: centraleNros.map((nro) => {
              const nroFdts = fdtsByNro.get(nro.externalId) ?? [];

              return {
                id: nro._id.toString(),
                externalId: nro.externalId,
                name: nro.name,
                location: nro.location,
                maxCapacity: nro.maxCapacity,
                currentLoad: nro.currentLoad,
                status: nro.status,
                fdts: nroFdts.map((fdt) => {
                  const fdtContracts = contractsByFdt.get(fdt.externalId) ?? [];

                  return {
                    id: fdt._id.toString(),
                    externalId: fdt.externalId,
                    location: fdt.location,
                    nbPortsTotal: fdt.nbPortsTotal,
                    nbPortsUtilises: fdt.nbPortsUtilises,
                    statutFdt: fdt.statutFdt,
                    status: fdt.status,
                    contracts: fdtContracts.map((contract) => ({
                      id: contract._id.toString(),
                      externalId: contract.externalId,
                      status: contract.status,
                      typeClient: contract.typeClient,
                      bandwidth: contract.bandwidth,
                      latitude: contract.latitude,
                      longitude: contract.longitude,
                    })),
                  };
                }),
              };
            }),
          };
        }),
      };
    });
  }

  /** Per-zone rollup (Step 4): counts + capacity + a simple health score, all derived through
   *  the same FK chain as getHierarchy(), not by trusting each entity's own zoneId shortcut. */
  async getZoneStatistics(user: AuthUser) {
    const [zones, centrales, nros, fdts, contracts, reclamations] = await Promise.all([
      this.getVisibleZones(user),
      this.centraleModel.find().exec(),
      this.nroModel.find().exec(),
      this.fdtModel.find().exec(),
      this.contractModel.find().exec(),
      this.reclamationModel.find().exec(),
    ]);

    const nrosByCentrale = this.groupBy(nros, (n) => n.centraleId?.toString());
    const fdtsByNro = this.groupBy(fdts, (f) => f.nroId);
    const contractsByFdt = this.groupBy(contracts, (c) => c.fdtId);
    const reclamationsByZone = this.groupBy(reclamations, (r) => r.zoneId);

    return zones.map((zone) => {
      const zoneId = zone._id.toString();
      const zoneCentrales = centrales.filter((c) => c.regionId?.toString() === zoneId);
      const zoneNros = zoneCentrales.flatMap((c) => nrosByCentrale.get(c._id.toString()) ?? []);
      const zoneFdts = zoneNros.flatMap((n) => fdtsByNro.get(n.externalId) ?? []);
      const zoneContracts = zoneFdts.flatMap((f) => contractsByFdt.get(f.externalId) ?? []);
      const zoneComplaints = reclamationsByZone.get(zoneId) ?? [];

      const totalNroCapacity = zoneNros.reduce((sum, n) => sum + n.maxCapacity, 0);
      const totalNroLoad = zoneNros.reduce((sum, n) => sum + n.currentLoad, 0);
      const totalFdtPorts = zoneFdts.reduce((sum, f) => sum + f.nbPortsTotal, 0);
      const totalFdtUsed = zoneFdts.reduce((sum, f) => sum + f.nbPortsUtilises, 0);

      const nroSaturationPct = totalNroCapacity > 0 ? (totalNroLoad / totalNroCapacity) * 100 : 0;
      const fdtSaturationPct = totalFdtPorts > 0 ? (totalFdtUsed / totalFdtPorts) * 100 : 0;
      const saturatedNros = zoneNros.filter((n) => n.maxCapacity > 0 && n.currentLoad >= n.maxCapacity).length;
      const saturatedFdts = zoneFdts.filter((f) => f.nbPortsTotal > 0 && f.nbPortsUtilises >= f.nbPortsTotal).length;

      // Simple, self-contained score (deliberately independent from the more elaborate
      // ai-supervisor ZoneHealthAgent formula, to avoid coupling the Map module to AI Supervisor).
      const healthScore = Math.max(
        0,
        Math.round(100 - nroSaturationPct * 0.3 - fdtSaturationPct * 0.25 - Math.min(30, zoneComplaints.length * 2)),
      );

      const alerts: string[] = [];
      if (saturatedNros > 0) alerts.push(`${saturatedNros} NRO sature(s)`);
      if (saturatedFdts > 0) alerts.push(`${saturatedFdts} FDT sature(s)`);
      if (zoneComplaints.length >= 10) alerts.push(`Pic de reclamations (${zoneComplaints.length} sur la periode)`);

      return {
        zoneId,
        zoneName: zone.name,
        centralesCount: zoneCentrales.length,
        nrosCount: zoneNros.length,
        fdtsCount: zoneFdts.length,
        contractsCount: zoneContracts.length,
        complaintsCount: zoneComplaints.length,
        capacity: {
          totalNroCapacity,
          totalNroLoad,
          nroSaturationPct: Math.round(nroSaturationPct * 10) / 10,
          totalFdtPorts,
          totalFdtUsed,
          fdtSaturationPct: Math.round(fdtSaturationPct * 10) / 10,
        },
        healthScore,
        alerts,
      };
    });
  }

  getContracts(user: AuthUser) {
    return this.contractModel
      .find(this.regionFilter(user))
      .exec()
      .then((contracts) => this.enrichContracts(contracts));
  }

  getReclamations(user: AuthUser) {
    return this.reclamationModel.find(this.zoneFilter(user)).exec();
  }

  getNros(user: AuthUser) {
    return this.nroModel.find(this.regionFilter(user)).exec();
  }

  /**
   * A Centrale's own `regionId` is just where the building sits (its HQ zone); a zone manager
   * should still see the Centrale that actually serves their zone via one of its NROs, so
   * non-admins are scoped by "has at least one NRO in my zone" rather than by regionId equality.
   */
  async getCentrales(user: AuthUser) {
    if (this.isGlobalViewer(user)) {
      return this.centraleModel.find().exec();
    }

    const nrosInZone = await this.nroModel.find({ regionId: user.zoneId }).exec();
    const centraleIds = [...new Set(nrosInZone.map((nro) => nro.centraleId?.toString()).filter(Boolean))];
    return this.centraleModel.find({ _id: { $in: centraleIds } }).exec();
  }

  getFdts(user: AuthUser) {
    return this.fdtModel.find(this.regionFilter(user)).exec();
  }

  getCentralFibers(user: AuthUser) {
    if (this.isGlobalViewer(user)) {
      return this.centralFiberModel.find().exec();
    }

    return this.centralFiberModel.find({ zoneId: user.zoneId }).exec();
  }

  getZones(user: AuthUser) {
    if (this.isGlobalViewer(user)) {
      return this.zoneModel.find({ isActive: true }).exec();
    }

    return this.zoneModel.find({ _id: user.zoneId, isActive: true }).exec();
  }

  getZoneById(id: string, user: AuthUser) {
    if (this.isGlobalViewer(user)) {
      return this.zoneModel.findById(id).exec();
    }

    if (user.zoneId !== id) {
      return null;
    }

    return this.zoneModel.findById(id).exec();
  }

  async getDashboard(user: AuthUser) {
    const [zones, contracts, reclamations, nros, fdts, centrales, history, zoneHealth] = await Promise.all([
      this.getZones(user),
      this.getContracts(user),
      this.getReclamations(user),
      this.getNros(user),
      this.getFdts(user),
      this.getCentrales(user),
      this.notificationsService.findRecent(this.isGlobalViewer(user) ? undefined : user.zoneId, 100),
      this.getZoneStatistics(user),
    ]);

    const servedZoneIds = new Set(nros.map((nro) => nro.regionId).filter(Boolean));
    const servedZones = zones.filter((zone) => servedZoneIds.has(zone._id.toString()));

    // Network-wide figures computed through the real hierarchy (Step 3), independent from the
    // geographic-filter counts in `stats` below (kept as-is for backward compatibility with
    // existing consumers of this endpoint).
    const networkHealth = zoneHealth.length
      ? Math.round(zoneHealth.reduce((sum, z) => sum + z.healthScore, 0) / zoneHealth.length)
      : 100;
    const criticalAlerts = zoneHealth.reduce((sum, z) => sum + z.alerts.length, 0);

    return {
      totalZones: zoneHealth.length,
      totalCentrales: zoneHealth.reduce((sum, z) => sum + z.centralesCount, 0),
      totalNros: zoneHealth.reduce((sum, z) => sum + z.nrosCount, 0),
      totalFdts: zoneHealth.reduce((sum, z) => sum + z.fdtsCount, 0),
      totalContracts: zoneHealth.reduce((sum, z) => sum + z.contractsCount, 0),
      totalComplaints: zoneHealth.reduce((sum, z) => sum + z.complaintsCount, 0),
      networkHealth,
      criticalAlerts,
      zoneHealth,
      stats: {
        zones: servedZones.length,
        contracts: contracts.length,
        reclamations: reclamations.length,
        nros: nros.length,
        fdts: fdts.length,
        centrales: centrales.length,
        history: history.length,
      },
      layers: {
        zones: {
          type: 'FeatureCollection',
          features: servedZones.map((zone) => this.toPolygonFeature(zone, true)),
        },
        centrales: {
          type: 'FeatureCollection',
          features: centrales.map((centrale) => this.toCentraleFeature(centrale)),
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
      centraleNroSchema: this.buildCentraleNroLinks(nros, centrales),
        contractSchema: this.buildNroContractLinks(contracts, nros),
        fdtSchema: this.buildNroFdtLinks(fdts, nros),
        fdtContractSchema: this.buildFdtContractLinks(contracts, fdts),
        graph: {
          nodes: this.buildGraphNodes(contracts, nros, fdts, centrales),
          edges: this.buildGraphEdges(contracts, nros, fdts, centrales),
        },
      },
      history,
    };
  }

  /**
   * Get Central Fibers as GeoJSON FeatureCollection
   */
  async getCentralFibersMap(user: AuthUser): Promise<FeatureCollection> {
    const centralFibers = await this.getCentralFibers(user);

    return {
      type: 'FeatureCollection',
      features: centralFibers.map((cf) => ({
        type: 'Feature',
        geometry: {
          type: 'Point',
          coordinates: [cf.location.coordinates[0], cf.location.coordinates[1]],
        },
        properties: {
          id: cf._id.toString(),
          externalId: cf.externalId,
          name: cf.name,
          city: cf.city,
          zoneId: cf.zoneId,
          status: cf.status,
          totalCapacityGb: cf.totalCapacityGb,
          usedCapacityGb: cf.usedCapacityGb,
          saturationRate: cf.saturationRate,
          type: 'central_fiber',
        },
      })),
    };
  }

  /**
   * Get topology links as LineStrings (Central Fiber → NRO → FDT → Contract relationships)
   */
  async getTopologyGraph(user: AuthUser): Promise<FeatureCollection> {
    const contracts = await this.getContracts(user);
    const features: Array<Record<string, unknown>> = [];

    for (const contract of contracts) {
      if (!contract.centralFiberId || !contract.nroId || !contract.fdtId) {
        continue;
      }

      // Find the linked infrastructure
      const [cf, nro, fdt] = await Promise.all([
        this.centralFiberModel.findOne({ externalId: contract.centralFiberId }).exec(),
        this.nroModel.findOne({ externalId: contract.nroId }).exec(),
        this.fdtModel.findOne({ externalId: contract.fdtId }).exec(),
      ]);

      if (!cf || !nro || !fdt) {
        continue;
      }

      // Create LineString from CF → NRO
      if (cf && nro) {
        features.push({
          type: 'Feature',
          geometry: {
            type: 'LineString',
            coordinates: [
              cf.location.coordinates,
              nro.location.coordinates,
            ],
          },
          properties: {
            type: 'topology_link',
            linkType: 'cf_to_nro',
            centralFiberId: cf.externalId,
            nroId: nro.externalId,
            saturation: nro.saturationRate,
          },
        });
      }

      // Create LineString from NRO → FDT
      if (nro && fdt) {
        features.push({
          type: 'Feature',
          geometry: {
            type: 'LineString',
            coordinates: [
              nro.location.coordinates,
              fdt.location.coordinates,
            ],
          },
          properties: {
            type: 'topology_link',
            linkType: 'nro_to_fdt',
            nroId: nro.externalId,
            fdtId: fdt.externalId,
            utilization: fdt.utilizationRate,
          },
        });
      }

      // Create LineString from FDT → Contract
      if (fdt && contract) {
        features.push({
          type: 'Feature',
          geometry: {
            type: 'LineString',
            coordinates: [
              fdt.location.coordinates,
              [contract.longitude, contract.latitude],
            ],
          },
          properties: {
            type: 'topology_link',
            linkType: 'fdt_to_contract',
            fdtId: fdt.externalId,
            contractId: contract.externalId,
            bandwidth: contract.bandwidth,
          },
        });
      }
    }

    return {
      type: 'FeatureCollection',
      features,
    };
  }
}