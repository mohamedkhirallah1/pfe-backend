import { Injectable, Logger, Optional } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { CentraleService } from '../../centrale/services/centrale.service';
import { Contract, ContractDocument } from '../../contracts/schemas/contract.schema';
import { Fdt, FdtDocument } from '../../fdt/schemas/fdt.schema';
import { NroService } from '../../nro/nro.service';
import { Nro, NroDocument } from '../../nro/schemas/nro.schema';
import { Reclamation, ReclamationDocument } from '../../reclamations/schemas/reclamation.schema';
import { isWithinTunisiaBounds } from '../../zones/constants/tunisia-bounds.constant';
import { ZonesService } from '../../zones/zones.service';
import { QlogService } from '../../../common/qlog/qlog.service';

export type CorrectionIssue = { message: string; zoneId?: string };

export type AutoCorrectionReport = {
  fixed: CorrectionIssue[];
  pending: CorrectionIssue[]; // issues detected but requiring admin approval (never auto-applied)
};

/**
 * Auto-fixes ONLY logical/software data-consistency problems (dangling references, missing
 * zone assignment resolvable from coordinates). It never touches physical infrastructure
 * (locations, capacities, topology parent links between real equipment) or contracts, and
 * never merges/deletes records on its own — those go to `pending` for an admin decision.
 */
@Injectable()
export class AutoCorrectionService {
  private readonly logger = new Logger(AutoCorrectionService.name);

  constructor(
    @InjectModel(Contract.name) private readonly contractModel: Model<ContractDocument>,
    @InjectModel(Reclamation.name) private readonly reclamationModel: Model<ReclamationDocument>,
    @InjectModel(Fdt.name) private readonly fdtModel: Model<FdtDocument>,
    @InjectModel(Nro.name) private readonly nroModel: Model<NroDocument>,
    private readonly zonesService: ZonesService,
    private readonly nroService: NroService,
    private readonly centraleService: CentraleService,
    @Optional() private readonly qlog?: QlogService,
  ) {}

  async runAudit(): Promise<AutoCorrectionReport> {
    const fixed: CorrectionIssue[] = [];
    const pending: CorrectionIssue[] = [];

    await this.resolveMissingZoneReferences(fixed, pending);
    await this.resolveOrphanFdtReferences(pending);
    await this.resolveOrphanNroReferences(fixed, pending);
    await this.flagDuplicateFdts(pending);
    await this.flagDuplicateGps(pending);
    await this.flagInvalidCoordinates(pending);
    await this.flagIncompleteHierarchy(pending);

    if (fixed.length > 0) {
      this.qlog?.logAi({
        analysisType: 'auto_correction',
        status: 'completed',
        metadata: {
          fixedCount: fixed.length,
          pendingCount: pending.length,
          fixes: fixed.map((f) => f.message),
        },
      });
    }

    return { fixed, pending };
  }

  /** Contracts/reclamations with valid Tunisia coordinates but no zoneId: resolve via geo lookup. */
  private async resolveMissingZoneReferences(fixed: CorrectionIssue[], pending: CorrectionIssue[]): Promise<void> {
    const orphanContracts = await this.contractModel
      .find({ $or: [{ zoneId: { $exists: false } }, { zoneId: null }, { zoneId: '' }] })
      .exec();

    for (const contract of orphanContracts) {
      if (!isWithinTunisiaBounds(contract.latitude, contract.longitude)) {
        pending.push({ message: `Contrat ${contract.externalId}: coordonnees invalides, zone non resolvable automatiquement` });
        continue;
      }
      const zone = await this.zonesService.findZoneByCoordinates(contract.latitude, contract.longitude);
      if (zone) {
        const zoneId = zone._id.toString();
        contract.zoneId = zoneId;
        contract.regionId = contract.regionId ?? zoneId;
        await contract.save();
        fixed.push({ message: `Contrat ${contract.externalId}: zoneId resolu vers "${zone.name}" via coordonnees`, zoneId });
      } else {
        pending.push({ message: `Contrat ${contract.externalId}: aucune zone ne contient ses coordonnees` });
      }
    }

    const orphanReclamations = await this.reclamationModel
      .find({ $or: [{ zoneId: { $exists: false } }, { zoneId: null }, { zoneId: '' }] })
      .exec();

    for (const reclamation of orphanReclamations) {
      if (!isWithinTunisiaBounds(reclamation.latitude, reclamation.longitude)) {
        pending.push({ message: `Reclamation ${reclamation.externalId}: coordonnees invalides, zone non resolvable automatiquement` });
        continue;
      }
      const zone = await this.zonesService.findZoneByCoordinates(reclamation.latitude, reclamation.longitude);
      if (zone) {
        const zoneId = zone._id.toString();
        reclamation.zoneId = zoneId;
        reclamation.regionId = reclamation.regionId ?? zoneId;
        await reclamation.save();
        fixed.push({ message: `Reclamation ${reclamation.externalId}: zoneId resolu vers "${zone.name}" via coordonnees`, zoneId });
      } else {
        pending.push({ message: `Reclamation ${reclamation.externalId}: aucune zone ne contient ses coordonnees` });
      }
    }
  }

  /**
   * FDTs whose nroId points at a NRO that no longer exists. Reported only: unlike a missing
   * zoneId (which coordinates can safely re-derive), there's no safe way to infer which NRO a
   * dangling FDT *should* belong to, so this stays an admin decision rather than being nulled
   * out automatically.
   */
  private async resolveOrphanFdtReferences(pending: CorrectionIssue[]): Promise<void> {
    const fdts = await this.fdtModel.find({ nroId: { $exists: true, $ne: null } }).exec();

    for (const fdt of fdts) {
      const nro = await this.nroService.findByExternalId(fdt.nroId as string);
      if (!nro) {
        pending.push({
          message: `FDT ${fdt.externalId}: reference NRO "${fdt.nroId}" introuvable (reattribution necessite une decision admin)`,
          zoneId: fdt.regionId,
        });
      }
    }
  }

  /** NROs whose centraleId points at a Centrale that no longer exists: clear it (logical FK repair only). */
  private async resolveOrphanNroReferences(fixed: CorrectionIssue[], pending: CorrectionIssue[]): Promise<void> {
    const nros = await this.nroModel.find({ centraleId: { $exists: true, $ne: null } }).exec();

    for (const nro of nros) {
      try {
        await this.centraleService.findById(nro.centraleId!.toString());
      } catch {
        nro.centraleId = undefined;
        await nro.save();
        fixed.push({ message: `NRO ${nro.externalId}: reference Centrale invalide supprimee (orpheline)`, zoneId: nro.regionId });
      }
    }
  }

  /** Two FDTs at (near-)identical coordinates under the same NRO: likely a duplicate entry. Report only. */
  private async flagDuplicateFdts(pending: CorrectionIssue[]): Promise<void> {
    const fdts = await this.fdtModel.find().exec();
    const seen = new Map<string, string>();

    for (const fdt of fdts) {
      const key = `${fdt.nroId ?? 'none'}:${fdt.location.coordinates[0].toFixed(4)}:${fdt.location.coordinates[1].toFixed(4)}`;
      const existing = seen.get(key);
      if (existing) {
        pending.push({ message: `FDT ${fdt.externalId} et ${existing}: memes coordonnees et meme NRO, doublon probable`, zoneId: fdt.regionId });
      } else {
        seen.set(key, fdt.externalId);
      }
    }
  }

  private async flagInvalidCoordinates(pending: CorrectionIssue[]): Promise<void> {
    const contracts = await this.contractModel.find().exec();
    for (const contract of contracts) {
      if (!isWithinTunisiaBounds(contract.latitude, contract.longitude)) {
        pending.push({
          message: `Contrat ${contract.externalId}: coordonnees hors limites Tunisie (${contract.latitude}, ${contract.longitude})`,
          zoneId: contract.zoneId,
        });
      }
    }
  }

  /** Two NROs or two Contracts sharing (near-)identical GPS coordinates: likely a duplicate entry. Report only. */
  private async flagDuplicateGps(pending: CorrectionIssue[]): Promise<void> {
    const nros = await this.nroModel.find().exec();
    const seenNro = new Map<string, string>();
    for (const nro of nros) {
      const key = `${nro.location.coordinates[0].toFixed(5)}:${nro.location.coordinates[1].toFixed(5)}`;
      const existing = seenNro.get(key);
      if (existing) {
        pending.push({ message: `NRO ${nro.externalId} et ${existing}: coordonnees GPS identiques, doublon probable`, zoneId: nro.regionId });
      } else {
        seenNro.set(key, nro.externalId);
      }
    }

    const contracts = await this.contractModel.find().exec();
    const seenContract = new Map<string, string>();
    for (const contract of contracts) {
      const key = `${contract.latitude.toFixed(5)}:${contract.longitude.toFixed(5)}`;
      const existing = seenContract.get(key);
      if (existing) {
        pending.push({
          message: `Contrat ${contract.externalId} et ${existing}: memes coordonnees GPS exactes, verifier doublon`,
          zoneId: contract.zoneId,
        });
      } else {
        seenContract.set(key, contract.externalId);
      }
    }
  }

  /**
   * Reports breaks in the Centrale -> NRO -> FDT -> Contract chain: a NRO with no Centrale, a
   * FDT with no NRO, a Contract with no FDT. These are allowed by the schema today (every
   * parent reference is optional) so this never blocks anything — it only surfaces the gap for
   * an admin to close by assigning the correct parent, which is a business decision this
   * service must never make on its own.
   */
  private async flagIncompleteHierarchy(pending: CorrectionIssue[]): Promise<void> {
    const orphanNros = await this.nroModel
      .find({ $or: [{ centraleId: { $exists: false } }, { centraleId: null }] })
      .exec();
    for (const nro of orphanNros) {
      pending.push({ message: `NRO ${nro.externalId}: aucune Centrale parente assignee`, zoneId: nro.regionId });
    }

    const orphanFdts = await this.fdtModel
      .find({ $or: [{ nroId: { $exists: false } }, { nroId: null }, { nroId: '' }] })
      .exec();
    for (const fdt of orphanFdts) {
      pending.push({ message: `FDT ${fdt.externalId}: aucun NRO parent assigne`, zoneId: fdt.regionId });
    }

    const orphanContracts = await this.contractModel
      .find({ $or: [{ fdtId: { $exists: false } }, { fdtId: null }, { fdtId: '' }] })
      .exec();
    for (const contract of orphanContracts) {
      pending.push({ message: `Contrat ${contract.externalId}: aucun FDT parent assigne`, zoneId: contract.zoneId });
    }
  }
}
