import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { CentraleService } from '../../centrale/services/centrale.service';
import { CentralFiber, CentralFiberDocument } from '../../central-fiber/schemas/central-fiber.schema';
import { Contract, ContractDocument, ContractStatus } from '../../contracts/schemas/contract.schema';
import { FdtDocument, FdtStatut } from '../../fdt/schemas/fdt.schema';
import { FdtService } from '../../fdt/fdt.service';
import { NroDocument, NroStatus, SaturationStatus } from '../../nro/schemas/nro.schema';
import { NroService } from '../../nro/nro.service';
import { Reclamation, ReclamationDocument } from '../../reclamations/schemas/reclamation.schema';
import { ZoneDocument } from '../../zones/schemas/zone.schema';
import { ZonesService } from '../../zones/zones.service';

export type ZoneSnapshotData = {
  zone: ZoneDocument;
  fdts: FdtDocument[];
  nros: NroDocument[];
  activeContractsCount: number;
  reclamationsLast30d: ReclamationDocument[];
  reclamationsPrev30d: ReclamationDocument[];
};

/**
 * Read-only aggregation layer for ai-supervisor. Reuses the existing domain services
 * (ZonesService/FdtService/NroService/CentraleService) wherever they already expose what's
 * needed, and injects the remaining models (Contract, Reclamation, CentralFiber) directly for
 * the cross-cutting counts none of the business services currently expose. Nothing here ever
 * writes to a business collection.
 */
@Injectable()
export class DataAggregatorService {
  constructor(
    @InjectModel(Contract.name) private readonly contractModel: Model<ContractDocument>,
    @InjectModel(Reclamation.name) private readonly reclamationModel: Model<ReclamationDocument>,
    @InjectModel(CentralFiber.name) private readonly centralFiberModel: Model<CentralFiberDocument>,
    private readonly zonesService: ZonesService,
    private readonly fdtService: FdtService,
    private readonly nroService: NroService,
    private readonly centraleService: CentraleService,
  ) {}

  /** Optional `zoneId` narrows to a single zone (RESPONSABLE_ZONE); omitted = all zones (ADMIN/global). */
  async findAllZones(zoneId?: string): Promise<ZoneDocument[]> {
    const zones = await this.zonesService.findAll();
    return zoneId ? zones.filter((z) => z._id.toString() === zoneId) : zones;
  }

  findAllContracts(zoneId?: string): Promise<ContractDocument[]> {
    if (!zoneId) return this.contractModel.find().exec();
    return this.contractModel.find({ $or: [{ zoneId }, { regionId: zoneId }] }).exec();
  }

  findAllReclamations(zoneId?: string): Promise<ReclamationDocument[]> {
    if (!zoneId) return this.reclamationModel.find().exec();
    return this.reclamationModel.find({ zoneId }).exec();
  }

  findAllCentralFibers(): Promise<CentralFiberDocument[]> {
    return this.centralFiberModel.find().exec();
  }

  findAllCentrales() {
    return this.centraleService.findAll();
  }

  findAllFdts(zoneId?: string): Promise<FdtDocument[]> {
    return this.fdtService.findAll(zoneId);
  }

  findAllNros(zoneId?: string): Promise<NroDocument[]> {
    return this.nroService.findAll(zoneId);
  }

  async getZoneSnapshot(zone: ZoneDocument): Promise<ZoneSnapshotData> {
    const zoneId = zone._id.toString();
    const now = Date.now();
    const day = 24 * 60 * 60 * 1000;
    const since30d = new Date(now - 30 * day);
    const since60d = new Date(now - 60 * day);

    const [fdts, nros, activeContractsCount, reclamationsLast30d, reclamationsPrev30d] = await Promise.all([
      this.fdtService.findAll(zoneId),
      this.nroService.findAll(zoneId),
      this.contractModel
        .countDocuments({ $or: [{ zoneId }, { regionId: zoneId }], status: ContractStatus.ACTIVE })
        .exec(),
      this.reclamationModel
        .find({ zoneId, createdAt: { $gte: since30d } })
        .exec(),
      this.reclamationModel
        .find({ zoneId, createdAt: { $gte: since60d, $lt: since30d } })
        .exec(),
    ]);

    return { zone, fdts, nros, activeContractsCount, reclamationsLast30d, reclamationsPrev30d };
  }

  async getGlobalCounts(zoneId?: string): Promise<{
    contractsActive: number;
    contractsCancelled: number;
    contractsFailed: number;
    reclamationsTotal: number;
    reclamationsLast24h: number;
    nrosActive: number;
    nrosSaturated: number;
    nrosDown: number;
    fdtsTotal: number;
    fdtsSaturated: number;
    centralFibersTotal: number;
  }> {
    const since24h = new Date(Date.now() - 24 * 60 * 60 * 1000);
    const contractZoneFilter = zoneId ? { $or: [{ zoneId }, { regionId: zoneId }] } : {};
    const reclamationZoneFilter = zoneId ? { zoneId } : {};

    const [
      contractsActive,
      contractsCancelled,
      contractsFailed,
      reclamationsTotal,
      reclamationsLast24h,
      nros,
      fdts,
      centralFibersTotal,
    ] = await Promise.all([
      this.contractModel.countDocuments({ ...contractZoneFilter, status: ContractStatus.ACTIVE }).exec(),
      this.contractModel.countDocuments({ ...contractZoneFilter, status: ContractStatus.CANCELLED }).exec(),
      this.contractModel.countDocuments({ ...contractZoneFilter, status: ContractStatus.FAILED }).exec(),
      this.reclamationModel.countDocuments(reclamationZoneFilter).exec(),
      this.reclamationModel.countDocuments({ ...reclamationZoneFilter, createdAt: { $gte: since24h } }).exec(),
      this.nroService.findAll(zoneId),
      this.fdtService.findAll(zoneId),
      // CentralFiber has no zone relation in the current schema — stays global for both scopes,
      // consistent with it not appearing anywhere in the zone-scoped report content requirements.
      this.centralFiberModel.countDocuments().exec(),
    ]);

    return {
      contractsActive,
      contractsCancelled,
      contractsFailed,
      reclamationsTotal,
      reclamationsLast24h,
      nrosActive: nros.filter((n) => n.status === NroStatus.ACTIVE).length,
      nrosSaturated: nros.filter((n) => n.status === NroStatus.SATURATED || n.statutSaturation === SaturationStatus.SATURE).length,
      nrosDown: nros.filter((n) => n.status === NroStatus.DOWN).length,
      fdtsTotal: fdts.length,
      fdtsSaturated: fdts.filter((f) => f.statutFdt === FdtStatut.PLEIN).length,
      centralFibersTotal,
    };
  }
}
