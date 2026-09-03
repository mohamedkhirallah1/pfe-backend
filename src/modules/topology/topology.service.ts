import { Injectable, Logger } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { ClientSession, Model } from 'mongoose';
import { Contract, ContractDocument } from '../contracts/schemas/contract.schema';
import { Fdt, FdtDocument } from '../fdt/schemas/fdt.schema';
import { Nro, NroDocument } from '../nro/schemas/nro.schema';
import { CentralFiber, CentralFiberDocument } from '../central-fiber/schemas/central-fiber.schema';
import { Zone, ZoneDocument } from '../zones/schemas/zone.schema';

export type TopologyLink = {
  centralFiberId?: string;
  nroId?: string;
  fdtId?: string;
  zoneId?: string;
  regionId?: string;
};

@Injectable()
export class TopologyService {
  private readonly logger = new Logger(TopologyService.name);

  constructor(
    @InjectModel(Contract.name)
    private readonly contractModel: Model<ContractDocument>,
    @InjectModel(Fdt.name)
    private readonly fdtModel: Model<FdtDocument>,
    @InjectModel(Nro.name)
    private readonly nroModel: Model<NroDocument>,
    @InjectModel(CentralFiber.name)
    private readonly centralFiberModel: Model<CentralFiberDocument>,
    @InjectModel(Zone.name)
    private readonly zoneModel: Model<ZoneDocument>,
  ) {}

  /**
   * Register a contract against the FDT/NRO it was already linked to by ContractsService
   * (which resolves the target NRO/FDT with capacity checks). This method does NOT re-search
   * for the nearest infrastructure and does NOT overwrite contract.fdtId/nroId/zoneId — an
   * earlier version did both, independently of the capacity-checked assignment, which could
   * silently reassign a contract to a different, non-capacity-checked NRO/FDT. It only keeps
   * the infrastructure-side counters (activeClients, connectedFdtsCount) in sync.
   */
  async registerContractLink(
    contractId: string,
    fdtExternalId: string,
    nroExternalId?: string,
    session?: ClientSession,
  ): Promise<TopologyLink> {
    const fdt = await this.fdtModel.findOne({ externalId: fdtExternalId }).session(session ?? null).exec();
    if (!fdt) {
      this.logger.warn(`registerContractLink: FDT ${fdtExternalId} not found for contract ${contractId}`);
      return {};
    }

    fdt.activeClients = (fdt.activeClients || 0) + 1;
    await fdt.save({ session });

    let nro: NroDocument | null = null;
    if (nroExternalId) {
      nro = await this.nroModel.findOne({ externalId: nroExternalId }).session(session ?? null).exec();
      if (nro) {
        nro.connectedFdtsCount = await this.fdtModel
          .countDocuments({ nroId: nro.externalId })
          .session(session ?? null)
          .exec();
        await nro.save({ session });
      }
    }

    const topology: TopologyLink = {
      fdtId: fdt.externalId,
      nroId: nro?.externalId,
    };

    this.logger.log(`Registered contract ${contractId} topology link:`, topology);
    return topology;
  }

  /**
   * Find nearest FDT to a location (within 10km). Used by callers with no pre-existing FDT
   * assignment yet (e.g. standalone FDT lookups), not by the contract pipeline itself anymore.
   */
  async findNearestFdt(latitude: number, longitude: number): Promise<FdtDocument | null> {
    return this.fdtModel
      .findOne({
        location: {
          $near: {
            $geometry: {
              type: 'Point',
              coordinates: [longitude, latitude],
            },
            $maxDistance: 10000, // 10km
          },
        },
      })
      .exec();
  }

  /**
   * Get full topology path for a contract
   */
  async getTopologyPath(contractId: string): Promise<Record<string, unknown> | null> {
    const contract = await this.contractModel.findById(contractId).exec();
    if (!contract) {
      return null;
    }

    const topology: Record<string, unknown> = {
      contract: {
        id: contract._id.toString(),
        externalId: contract.externalId,
        location: {
          latitude: contract.latitude,
          longitude: contract.longitude,
        },
      },
    };

    if (contract.fdtId) {
      const fdt = await this.fdtModel.findOne({ externalId: contract.fdtId }).exec();
      if (fdt) {
        topology.fdt = {
          id: fdt._id.toString(),
          externalId: fdt.externalId,
          activeClients: fdt.activeClients,
          maxClients: fdt.maxClients,
          utilizationRate: fdt.utilizationRate,
        };
      }
    }

    if (contract.nroId) {
      const nro = await this.nroModel.findOne({ externalId: contract.nroId }).exec();
      if (nro) {
        topology.nro = {
          id: nro._id.toString(),
          externalId: nro.externalId,
          capacityGb: nro.capacityGb,
          usedGb: nro.usedGb,
          saturationRate: nro.saturationRate,
        };
      }
    }

    if (contract.centralFiberId) {
      const cf = await this.centralFiberModel.findOne({ externalId: contract.centralFiberId }).exec();
      if (cf) {
        topology.centralFiber = {
          id: cf._id.toString(),
          externalId: cf.externalId,
          name: cf.name,
          city: cf.city,
          totalCapacityGb: cf.totalCapacityGb,
          usedCapacityGb: cf.usedCapacityGb,
          saturationRate: cf.saturationRate,
        };
      }
    }

    return topology;
  }

  /**
   * Release a cancelled contract's claim on its FDT (decrements activeClients). Called from
   * ContractsService.handleCancelContractEvent — previously nothing called this, so
   * fdt.activeClients only ever grew across the lifetime of the system.
   */
  async releaseContractTopology(contractId: string, session?: ClientSession): Promise<void> {
    const contract = await this.contractModel.findById(contractId).session(session ?? null).exec();
    if (!contract) {
      return;
    }

    if (contract.fdtId) {
      const fdt = await this.fdtModel.findOne({ externalId: contract.fdtId }).session(session ?? null).exec();
      if (fdt) {
        fdt.activeClients = Math.max((fdt.activeClients || 1) - 1, 0);
        await fdt.save({ session });
      }
    }

    this.logger.log(`Released contract ${contractId} from topology`);
  }

  /**
   * Get statistics on topology saturation
   */
  async getTopologyStats(): Promise<Record<string, unknown>> {
    const centralFiberCount = await this.centralFiberModel.countDocuments().exec();
    const nroCount = await this.nroModel.countDocuments().exec();
    const fdtCount = await this.fdtModel.countDocuments().exec();
    const contractCount = await this.contractModel.countDocuments().exec();

    const saturationRiskNros = await this.nroModel.countDocuments({ $expr: { $gte: ['$saturationRate', 70] } }).exec();
    const saturationRiskFdts = await this.fdtModel
      .countDocuments({ $expr: { $gte: [{ $divide: ['$activeClients', '$maxClients'] }, 0.7] } })
      .exec();

    return {
      topology: {
        centralFibers: centralFiberCount,
        nros: nroCount,
        fdts: fdtCount,
        contracts: contractCount,
      },
      saturationRisks: {
        nros: saturationRiskNros,
        fdts: saturationRiskFdts,
      },
      links: {
        contractsLinked: await this.contractModel.countDocuments({ fdtId: { $exists: true, $ne: null } }).exec(),
        fdtsLinkedToNro: await this.fdtModel.countDocuments({ nroId: { $exists: true, $ne: null } }).exec(),
        nrosLinkedToCF: await this.nroModel.countDocuments({ centralFiberId: { $exists: true, $ne: null } }).exec(),
      },
    };
  }
}
