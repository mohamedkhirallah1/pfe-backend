import {
  Injectable,
  Logger,
  ConflictException,
  NotFoundException,
  BadRequestException,
  ForbiddenException,
  OnModuleInit,
} from '@nestjs/common';
import { InjectConnection, InjectModel } from '@nestjs/mongoose';
import { ClientSession, Connection, Model, Types } from 'mongoose';
import { Zone, ZoneDocument } from './schemas/zone.schema';
import { UpdateZoneDto } from './dto/update-zone.dto';
import {
  normalizeTunisiaRegionName,
  TUNISIA_REGION_CENTERS,
} from './constants/tunisia-region-centers.constant';
import { TUNISIA_REGIONS } from '../users/constants/tunisia-regions.constant';
import { isWithinTunisiaBounds } from './constants/tunisia-bounds.constant';
import { Centrale, CentraleDocument } from '../centrale/schemas/centrale.schema';
import { Nro, NroDocument, NroStatus, SaturationStatus } from '../nro/schemas/nro.schema';
import { Fdt, FdtDocument, FdtStatus, FdtStatut } from '../fdt/schemas/fdt.schema';
import {
  Contract,
  ContractDocument,
  ContractStatus,
  ClientType,
  InstallationStatus,
} from '../contracts/schemas/contract.schema';
import { AppRole } from '../auth/roles.enum';

export type AuthContextUser = {
  sub: string;
  role: AppRole;
  zoneId?: string;
};

export type ImportZoneResult = {
  success: boolean;
  message: string;
  zoneId: string;
  zoneName: string;
  summary: {
    zoneGeometryUpdated: boolean;
    centrales: { created: number; updated: number };
    nros: { created: number; updated: number };
    fdts: { created: number; updated: number };
    contracts: { created: number; updated: number };
  };
};

interface ParsedCentrale {
  code: string;
  nom: string;
  ville: string;
  position: [number, number]; // [lng, lat]
  capaciteTotal: number;
  oltIds: string[];
}

interface ParsedNro {
  externalId: string;
  name: string;
  centraleCode?: string;
  location: [number, number]; // [lng, lat]
  maxCapacity: number;
  capacityGb: number;
  status: string;
  statutSaturation: string;
  performanceScore: number;
}

interface ParsedFdt {
  externalId: string;
  nroId: string;
  location: [number, number]; // [lng, lat]
  maxClients: number;
  nbPortsTotal: number;
  status: string;
  statutFdt: string;
  signalQuality: number;
}

interface ParsedContract {
  externalId: string;
  numeroTelephone: string;
  numeroCIN: string;
  fdtId: string;
  nroId?: string;
  location: [number, number]; // [lng, lat]
  bandwidth: number;
  typeClient: string;
  status: string;
  installationStatus: string;
  traceFDT?: {
    type: 'LineString';
    coordinates: [number, number][];
  };
}

interface ParsedGeoJsonData {
  polygonGeometry: { type: 'Polygon'; coordinates: number[][][] } | null;
  centrales: ParsedCentrale[];
  nros: ParsedNro[];
  fdts: ParsedFdt[];
  contracts: ParsedContract[];
}

@Injectable()
export class ZonesService implements OnModuleInit {
  private readonly logger = new Logger(ZonesService.name);

  constructor(
    @InjectModel(Zone.name)
    private readonly zoneModel: Model<ZoneDocument>,
    @InjectModel(Centrale.name)
    private readonly centraleModel: Model<CentraleDocument>,
    @InjectModel(Nro.name)
    private readonly nroModel: Model<NroDocument>,
    @InjectModel(Fdt.name)
    private readonly fdtModel: Model<FdtDocument>,
    @InjectModel(Contract.name)
    private readonly contractModel: Model<ContractDocument>,
    @InjectConnection()
    private readonly connection: Connection,
  ) {}

  async onModuleInit(): Promise<void> {
    await this.ensurePredefinedZones();
  }

  private buildDefaultPolygon(name: keyof typeof TUNISIA_REGION_CENTERS): {
    type: 'Polygon';
    coordinates: number[][][];
  } {
    const center = TUNISIA_REGION_CENTERS[name];
    const delta = 0.15;

    const ring = [
      [center.lng - delta, center.lat - delta],
      [center.lng + delta, center.lat - delta],
      [center.lng + delta, center.lat + delta],
      [center.lng - delta, center.lat + delta],
      [center.lng - delta, center.lat - delta],
    ];

    return {
      type: 'Polygon',
      coordinates: [ring],
    };
  }

  private async ensurePredefinedZones(): Promise<void> {
    for (const regionName of TUNISIA_REGIONS) {
      const existing = await this.zoneModel.findOne({ name: regionName }).exec();
      if (existing) {
        continue;
      }

      await this.zoneModel.create({
        name: regionName,
        geometry: this.buildDefaultPolygon(regionName),
        isActive: true,
      });
    }
  }

  async getPredefinedRegions(): Promise<
    Array<{
      name: string;
      lat: number;
      lng: number;
      zoneId?: string;
      isActive: boolean;
      hasManager: boolean;
    }>
  > {
    const zones = await this.zoneModel
      .find({ name: { $in: TUNISIA_REGIONS as readonly string[] } })
      .exec();
    const zoneByName = new Map(zones.map((zone) => [zone.name, zone]));

    return TUNISIA_REGIONS.map((name) => {
      const center = TUNISIA_REGION_CENTERS[name];
      const zone = zoneByName.get(name);
      return {
        name,
        lat: center.lat,
        lng: center.lng,
        zoneId: zone?._id.toString(),
        isActive: zone?.isActive ?? false,
        hasManager: Boolean(zone?.managerUserId),
      };
    });
  }

  async findZoneByCoordinates(lat: number, lng: number): Promise<ZoneDocument | null> {
    this.logger.debug(`Finding zone for coordinates lat=${lat}, lng=${lng}`);

    return this.zoneModel.findOne({
      geometry: {
        $geoIntersects: {
          $geometry: {
            type: 'Point',
            coordinates: [lng, lat],
          },
        },
      },
    });
  }

  async findByName(name: string): Promise<ZoneDocument | null> {
    return this.zoneModel.findOne({ name }).exec();
  }

  async findByRegionIdentifier(identifier: string): Promise<ZoneDocument | null> {
    const value = identifier.trim();

    if (!value) {
      return null;
    }

    if (Types.ObjectId.isValid(value)) {
      const byId = await this.zoneModel.findById(value).exec();
      if (byId) {
        return byId;
      }
    }

    const normalized = normalizeTunisiaRegionName(value);
    if (normalized) {
      return this.zoneModel.findOne({ name: normalized }).exec();
    }

    return this.zoneModel.findOne({ name: value }).exec();
  }

  findAll(): Promise<ZoneDocument[]> {
    return this.zoneModel.find({ isActive: true }).exec();
  }

  findById(id: string): Promise<ZoneDocument | null> {
    if (!Types.ObjectId.isValid(id)) {
      return Promise.resolve(null);
    }
    return this.zoneModel.findById(id).exec();
  }

  /**
   * Creating new zones is permanently forbidden.
   * The system operates with exactly 24 fixed Tunisian governorate zones.
   */
  create(): never {
    throw new BadRequestException(
      'Creating new zones is permanently disabled. The system operates strictly with 24 predefined zones. Use the GeoJSON import endpoint to update an existing zone.',
    );
  }

  async update(id: string, dto: UpdateZoneDto): Promise<ZoneDocument> {
    if (!Types.ObjectId.isValid(id)) {
      throw new NotFoundException(`Zone ${id} not found`);
    }

    const zone = await this.zoneModel.findById(id).exec();

    if (!zone) {
      throw new NotFoundException('Zone not found');
    }

    if (dto.name) {
      const normalizedName = normalizeTunisiaRegionName(dto.name);
      if (!normalizedName) {
        throw new BadRequestException('Only Tunisia predefined regions are allowed');
      }

      const existing = await this.zoneModel.findOne({ name: dto.name, _id: { $ne: id } }).exec();
      if (existing) {
        throw new ConflictException(`Zone "${dto.name}" already exists`);
      }
      zone.name = normalizedName;
    }

    if (dto.managerUserId !== undefined) {
      zone.managerUserId = dto.managerUserId;
    }

    if (dto.geometry) {
      zone.geometry = dto.geometry as ZoneDocument['geometry'];
    }

    if (dto.isActive !== undefined) {
      zone.isActive = dto.isActive;
    }

    return zone.save();
  }

  async remove(id: string): Promise<{ message: string }> {
    if (!Types.ObjectId.isValid(id)) {
      throw new NotFoundException(`Zone ${id} not found`);
    }

    const zone = await this.zoneModel.findById(id).exec();

    if (!zone) {
      throw new NotFoundException('Zone not found');
    }

    zone.isActive = false;
    await zone.save();

    return { message: 'Zone deactivated successfully' };
  }

  // ==========================================
  // GEOJSON IMPORT & SYNCHRONIZATION
  // ==========================================

  /**
   * Import GeoJSON and synchronize Zone, Centrales, NROs, FDTs, and Contracts.
   * Ensures fail-fast pre-validation, RBAC, hierarchical integrity, and atomic DB updates.
   */
  async importZoneGeoJson(
    zoneId: string,
    geojsonPayload: any,
    user: AuthContextUser,
  ): Promise<ImportZoneResult> {
    // 1. Resolve and validate target zone
    const targetZone = await this.resolveTargetZone(zoneId);

    // 2. Validate RBAC permissions
    if (user.role === AppRole.RESPONSABLE_ZONE) {
      if (!user.zoneId || user.zoneId.toString() !== targetZone._id.toString()) {
        throw new ForbiddenException('You can only import data for your assigned zone');
      }
    }

    // 3. Extract and parse GeoJSON features
    const features = this.extractGeoJsonFeatures(geojsonPayload);

    // 4. Validate & parse all features in-memory before writing anything to MongoDB
    const parsedData = await this.validateAndParseGeoJson(features, targetZone);

    // 5. Execute DB updates with session/transaction if supported
    return this.executeSynchronization(targetZone, parsedData);
  }

  private async resolveTargetZone(zoneId: string): Promise<ZoneDocument> {
    if (!zoneId || zoneId.trim() === '') {
      throw new BadRequestException('Target zoneId is required');
    }

    let targetZone: ZoneDocument | null = null;

    if (Types.ObjectId.isValid(zoneId)) {
      targetZone = await this.zoneModel.findById(zoneId).exec();
    }

    if (!targetZone) {
      targetZone = await this.findByRegionIdentifier(zoneId);
    }

    if (!targetZone || !targetZone.isActive) {
      throw new NotFoundException(`Target zone "${zoneId}" not found or inactive`);
    }

    const canonicalName = normalizeTunisiaRegionName(targetZone.name);
    if (!canonicalName) {
      throw new BadRequestException(`Zone "${targetZone.name}" is not a recognized Tunisian region`);
    }

    return targetZone;
  }

  private extractGeoJsonFeatures(payload: any): any[] {
    if (!payload) {
      throw new BadRequestException('GeoJSON payload cannot be empty');
    }

    let data = payload;
    if (typeof data === 'string') {
      try {
        data = JSON.parse(data);
      } catch {
        throw new BadRequestException('Invalid JSON payload');
      }
    }

    if (data.geojson) {
      data = data.geojson;
      if (typeof data === 'string') {
        try {
          data = JSON.parse(data);
        } catch {
          throw new BadRequestException('Invalid JSON inside geojson field');
        }
      }
    }

    if (data.type === 'FeatureCollection' && Array.isArray(data.features)) {
      if (data.features.length === 0) {
        throw new BadRequestException('GeoJSON FeatureCollection contains no features');
      }
      return data.features;
    }

    if (data.type === 'Feature') {
      return [data];
    }

    if (Array.isArray(data)) {
      if (data.length === 0) {
        throw new BadRequestException('GeoJSON feature array is empty');
      }
      return data;
    }

    throw new BadRequestException(
      'Invalid GeoJSON structure: expected FeatureCollection or Feature object',
    );
  }

  private async validateAndParseGeoJson(
    features: any[],
    targetZone: ZoneDocument,
  ): Promise<ParsedGeoJsonData> {
    const parsed: ParsedGeoJsonData = {
      polygonGeometry: null,
      centrales: [],
      nros: [],
      fdts: [],
      contracts: [],
    };

    const centraleCodes = new Set<string>();
    const nroExternalIds = new Set<string>();
    const fdtExternalIds = new Set<string>();
    const contractExternalIds = new Set<string>();
    const phoneNumbers = new Set<string>();

    for (let i = 0; i < features.length; i++) {
      const feature = features[i];
      if (!feature || typeof feature !== 'object') {
        throw new BadRequestException(`Feature at index ${i} is not a valid object`);
      }

      if (!feature.geometry || typeof feature.geometry.type !== 'string') {
        throw new BadRequestException(`Feature at index ${i} is missing geometry or geometry.type`);
      }

      const geomType = feature.geometry.type;
      const coords = feature.geometry.coordinates;
      const props = feature.properties || {};

      // 1. Zone Polygon
      if (
        geomType === 'Polygon' ||
        props.kind?.toLowerCase() === 'zone' ||
        props.type?.toLowerCase() === 'zone' ||
        props.layer?.toLowerCase() === 'zone'
      ) {
        if (geomType !== 'Polygon') {
          throw new BadRequestException(
            `Zone geometry must be a Polygon, got "${geomType}" at index ${i}`,
          );
        }
        this.validatePolygonCoordinates(coords, i);

        if (props.name) {
          const normalizedFeatureName = normalizeTunisiaRegionName(props.name);
          if (normalizedFeatureName && normalizedFeatureName !== targetZone.name) {
            throw new BadRequestException(
              `GeoJSON zone name "${props.name}" does not match target zone "${targetZone.name}"`,
            );
          }
        }

        parsed.polygonGeometry = {
          type: 'Polygon',
          coordinates: coords,
        };
        continue;
      }

      // 2. Centrale
      if (
        props.kind?.toLowerCase() === 'centrale' ||
        props.kind?.toLowerCase() === 'central_fiber' ||
        props.type?.toLowerCase() === 'centrale' ||
        String(props.code || '').startsWith('CO-') ||
        (props.capaciteTotal !== undefined &&
          !props.nroId &&
          !props.fdtId &&
          !props.numeroTelephone &&
          !props.phoneNumber)
      ) {
        const point = this.validatePointCoordinates(geomType, coords, 'Centrale', i);
        const code = String(props.code || '').trim();
        if (!code) {
          throw new BadRequestException(`Centrale at index ${i} is missing required "code"`);
        }

        if (centraleCodes.has(code)) {
          throw new BadRequestException(`Duplicate Centrale code "${code}" found in GeoJSON`);
        }
        centraleCodes.add(code);

        parsed.centrales.push({
          code,
          nom: props.nom || props.name || `Centrale ${targetZone.name}`,
          ville: props.ville || targetZone.name,
          position: point,
          capaciteTotal: Number(props.capaciteTotal) || 0,
          oltIds: Array.isArray(props.oltIds) ? props.oltIds : [],
        });
        continue;
      }

      // 3. NRO
      if (
        props.kind?.toLowerCase() === 'nro' ||
        props.type?.toLowerCase() === 'nro' ||
        String(props.externalId || '').startsWith('NRO-') ||
        (props.maxCapacity !== undefined &&
          !props.nbPortsTotal &&
          !props.numeroTelephone &&
          !props.phoneNumber)
      ) {
        const point = this.validatePointCoordinates(geomType, coords, 'NRO', i);
        const externalId = String(props.externalId || props.nroId || props.code || '').trim();
        if (!externalId) {
          throw new BadRequestException(`NRO at index ${i} is missing required "externalId"`);
        }

        if (nroExternalIds.has(externalId)) {
          throw new BadRequestException(`Duplicate NRO externalId "${externalId}" found in GeoJSON`);
        }
        nroExternalIds.add(externalId);

        parsed.nros.push({
          externalId,
          name: props.name || props.nom || `NRO ${externalId}`,
          centraleCode: props.centraleCode || props.centraleId || props.centralFiberId,
          location: point,
          maxCapacity: Number(props.maxCapacity || props.capacityGb) || 600,
          capacityGb: Number(props.capacityGb || props.maxCapacity) || 600,
          status: props.status || NroStatus.ACTIVE,
          statutSaturation: props.statutSaturation || SaturationStatus.NORMAL,
          performanceScore: Number(props.performanceScore) || 90,
        });
        continue;
      }

      // 4. FDT
      if (
        props.kind?.toLowerCase() === 'fdt' ||
        props.type?.toLowerCase() === 'fdt' ||
        String(props.externalId || '').startsWith('FDT-') ||
        props.nbPortsTotal !== undefined ||
        props.statutFdt !== undefined ||
        (props.nroId &&
          !props.phoneNumber &&
          !props.numeroTelephone &&
          !props.numeroCIN &&
          !props.bandwidth)
      ) {
        const point = this.validatePointCoordinates(geomType, coords, 'FDT', i);
        const externalId = String(props.externalId || props.fdtId || props.code || '').trim();
        if (!externalId) {
          throw new BadRequestException(`FDT at index ${i} is missing required "externalId"`);
        }

        if (fdtExternalIds.has(externalId)) {
          throw new BadRequestException(`Duplicate FDT externalId "${externalId}" found in GeoJSON`);
        }
        fdtExternalIds.add(externalId);

        const nroId = String(props.nroId || props.nroExternalId || '').trim();
        if (!nroId) {
          throw new BadRequestException(`FDT "${externalId}" at index ${i} must specify a parent "nroId"`);
        }

        parsed.fdts.push({
          externalId,
          nroId,
          location: point,
          maxClients: Number(props.maxClients || props.nbPortsTotal) || 128,
          nbPortsTotal: Number(props.nbPortsTotal || props.maxClients) || 32,
          status: props.status || FdtStatus.ACTIVE,
          statutFdt: props.statutFdt || FdtStatut.DISPONIBLE,
          signalQuality: Number(props.signalQuality) || 90,
        });
        continue;
      }

      // 5. Contract
      if (
        props.kind?.toLowerCase() === 'contract' ||
        props.type?.toLowerCase() === 'contract' ||
        String(props.externalId || '').startsWith('EXT-') ||
        String(props.externalId || '').startsWith('CONT-') ||
        props.phoneNumber !== undefined ||
        props.numeroTelephone !== undefined ||
        props.numeroCIN !== undefined ||
        props.cin !== undefined ||
        props.bandwidth !== undefined ||
        props.offreGB !== undefined ||
        props.typeClient !== undefined
      ) {
        const point = this.validatePointCoordinates(geomType, coords, 'Contract', i);
        const externalId = String(props.externalId || props.contractId || props.code || '').trim();
        if (!externalId) {
          throw new BadRequestException(`Contract at index ${i} is missing required "externalId"`);
        }

        if (contractExternalIds.has(externalId)) {
          throw new BadRequestException(
            `Duplicate Contract externalId "${externalId}" found in GeoJSON`,
          );
        }
        contractExternalIds.add(externalId);

        const numeroTelephone = String(props.numeroTelephone || props.phoneNumber || '').trim();
        if (!numeroTelephone) {
          throw new BadRequestException(
            `Contract "${externalId}" at index ${i} is missing required "numeroTelephone"`,
          );
        }

        if (phoneNumbers.has(numeroTelephone)) {
          throw new BadRequestException(
            `Duplicate numeroTelephone "${numeroTelephone}" found in GeoJSON`,
          );
        }
        phoneNumbers.add(numeroTelephone);

        const fdtId = String(props.fdtId || props.fdtExternalId || '').trim();
        if (!fdtId) {
          throw new BadRequestException(
            `Contract "${externalId}" at index ${i} must specify a parent "fdtId"`,
          );
        }

        parsed.contracts.push({
          externalId,
          numeroTelephone,
          numeroCIN: String(props.numeroCIN || props.cin || '10000000').trim(),
          fdtId,
          nroId: String(props.nroId || props.nroExternalId || '').trim() || undefined,
          location: point,
          bandwidth: Number(props.bandwidth || props.offreGB || props.packageGb) || 20,
          typeClient: props.typeClient || ClientType.MAISON,
          status: props.status || ContractStatus.ACTIVE,
          installationStatus: props.installationStatus || InstallationStatus.COMPLETED,
          traceFDT: props.traceFDT,
        });
        continue;
      }

      // If feature type is unrecognized
      throw new BadRequestException(
        `Feature at index ${i} could not be classified into Zone, Centrale, NRO, FDT, or Contract`,
      );
    }

    // Validate hierarchical relations against existing database records for this zone
    await this.validateHierarchy(parsed, targetZone);

    return parsed;
  }

  private validatePointCoordinates(
    geomType: string,
    coords: any,
    entityName: string,
    index: number,
  ): [number, number] {
    if (geomType !== 'Point' || !Array.isArray(coords) || coords.length < 2) {
      throw new BadRequestException(
        `${entityName} at index ${index} must have a Point geometry with [longitude, latitude]`,
      );
    }

    const lng = Number(coords[0]);
    const lat = Number(coords[1]);

    if (!Number.isFinite(lng) || !Number.isFinite(lat)) {
      throw new BadRequestException(
        `${entityName} at index ${index} contains invalid non-numeric coordinates`,
      );
    }

    if (!isWithinTunisiaBounds(lat, lng)) {
      throw new BadRequestException(
        `${entityName} coordinates [lng: ${lng}, lat: ${lat}] at index ${index} are outside Tunisia bounds`,
      );
    }

    return [lng, lat];
  }

  private validatePolygonCoordinates(coords: any, index: number): void {
    if (!Array.isArray(coords) || coords.length === 0 || !Array.isArray(coords[0])) {
      throw new BadRequestException(
        `Zone Polygon at index ${index} has invalid coordinates structure`,
      );
    }

    for (const ring of coords) {
      if (!Array.isArray(ring) || ring.length < 4) {
        throw new BadRequestException(
          `Zone Polygon ring at index ${index} must contain at least 4 positions`,
        );
      }

      for (const pos of ring) {
        if (!Array.isArray(pos) || pos.length < 2) {
          throw new BadRequestException(
            `Zone Polygon position at index ${index} is invalid`,
          );
        }

        const lng = Number(pos[0]);
        const lat = Number(pos[1]);

        if (!Number.isFinite(lng) || !Number.isFinite(lat)) {
          throw new BadRequestException(
            `Zone Polygon coordinate [${pos}] at index ${index} is not numeric`,
          );
        }

        if (!isWithinTunisiaBounds(lat, lng)) {
          throw new BadRequestException(
            `Zone Polygon coordinate [lng: ${lng}, lat: ${lat}] at index ${index} is outside Tunisia bounds`,
          );
        }
      }
    }
  }

  private async validateHierarchy(
    parsed: ParsedGeoJsonData,
    targetZone: ZoneDocument,
  ): Promise<void> {
    const zoneIdStr = targetZone._id.toString();

    // Fetch existing entities in DB for this zone
    const [existingCentrales, existingNros, existingFdts] = await Promise.all([
      this.centraleModel.find({ regionId: targetZone._id }).exec(),
      this.nroModel.find({ regionId: zoneIdStr }).exec(),
      this.fdtModel.find({ regionId: zoneIdStr }).exec(),
    ]);

    // Available Centrales: in batch OR already in DB for this zone
    const availableCentraleCodes = new Set<string>([
      ...parsed.centrales.map((c) => c.code),
      ...existingCentrales.map((c) => c.code),
    ]);

    // Validate NRO -> Centrale
    for (const nro of parsed.nros) {
      if (nro.centraleCode) {
        if (!availableCentraleCodes.has(nro.centraleCode)) {
          throw new BadRequestException(
            `NRO "${nro.externalId}" references unknown Centrale "${nro.centraleCode}" in zone "${targetZone.name}"`,
          );
        }
      }
    }

    // Available NROs: in batch OR already in DB for this zone
    const availableNroIds = new Set<string>([
      ...parsed.nros.map((n) => n.externalId),
      ...existingNros.map((n) => n.externalId),
    ]);

    // Validate FDT -> NRO
    for (const fdt of parsed.fdts) {
      if (!availableNroIds.has(fdt.nroId)) {
        throw new BadRequestException(
          `FDT "${fdt.externalId}" references unknown NRO "${fdt.nroId}" in zone "${targetZone.name}"`,
        );
      }
    }

    // Available FDTs: in batch OR already in DB for this zone
    const availableFdtIds = new Set<string>([
      ...parsed.fdts.map((f) => f.externalId),
      ...existingFdts.map((f) => f.externalId),
    ]);

    // Validate Contract -> FDT (& NRO)
    for (const contract of parsed.contracts) {
      if (!availableFdtIds.has(contract.fdtId)) {
        throw new BadRequestException(
          `Contract "${contract.externalId}" references unknown FDT "${contract.fdtId}" in zone "${targetZone.name}"`,
        );
      }

      if (contract.nroId && !availableNroIds.has(contract.nroId)) {
        throw new BadRequestException(
          `Contract "${contract.externalId}" references unknown NRO "${contract.nroId}" in zone "${targetZone.name}"`,
        );
      }
    }
  }

  private async executeSynchronization(
    targetZone: ZoneDocument,
    parsed: ParsedGeoJsonData,
  ): Promise<ImportZoneResult> {
    let session: ClientSession | null = null;
    let isTransactionActive = false;

    try {
      let isStandalone = false;
      try {
        const desc = ((this.connection as any)?.client as any)?.topology?.description;
        if (desc && !desc.setName && desc.type === 'Single') {
          isStandalone = true;
        }
      } catch {
        isStandalone = false;
      }

      if (!isStandalone && this.connection?.startSession) {
        session = await this.connection.startSession();
        if (session) {
          session.startTransaction();
          isTransactionActive = true;
        }
      }
    } catch (sessionErr: any) {
      this.logger.debug(
        `MongoDB transactions not active (standalone mode): ${sessionErr?.message}. Proceeding with pre-validated atomic execution.`,
      );
      if (session) {
        try {
          await session.endSession();
        } catch {
          // ignore
        }
        session = null;
      }
    }

    const summary = {
      zoneGeometryUpdated: false,
      centrales: { created: 0, updated: 0 },
      nros: { created: 0, updated: 0 },
      fdts: { created: 0, updated: 0 },
      contracts: { created: 0, updated: 0 },
    };

    try {
      const zoneIdStr = targetZone._id.toString();
      const sessionOption = session ? { session } : undefined;
      const sessionArg = session ?? undefined;

      // 1. Update Zone Polygon if provided
      if (parsed.polygonGeometry) {
        await this.zoneModel.findByIdAndUpdate(
          targetZone._id,
          { $set: { geometry: parsed.polygonGeometry } },
          sessionOption,
        );
        summary.zoneGeometryUpdated = true;
      }

      // 2. Synchronize Centrales
      const persistedCentrales = new Map<string, CentraleDocument>();
      for (const c of parsed.centrales) {
        const existing = await this.centraleModel
          .findOne({ code: c.code })
          .session(sessionArg ?? null)
          .exec();

        if (existing) {
          existing.nom = c.nom;
          existing.ville = c.ville;
          existing.regionId = targetZone._id;
          existing.position = { type: 'Point', coordinates: c.position };
          existing.capaciteTotal = c.capaciteTotal;
          if (c.oltIds?.length) {
            existing.oltIds = c.oltIds;
          }
          const saved = await existing.save(sessionOption);
          persistedCentrales.set(c.code, saved);
          summary.centrales.updated++;
        } else {
          const created = await this.centraleModel.create(
            [
              {
                nom: c.nom,
                code: c.code,
                ville: c.ville,
                regionId: targetZone._id,
                position: { type: 'Point', coordinates: c.position },
                capaciteTotal: c.capaciteTotal,
                oltIds: c.oltIds || [],
              },
            ],
            sessionOption,
          );
          persistedCentrales.set(c.code, created[0]);
          summary.centrales.created++;
        }
      }

      // Load all zone centrales for reference
      const allZoneCentrales = await this.centraleModel
        .find({ regionId: targetZone._id })
        .session(sessionArg ?? null)
        .exec();

      for (const c of allZoneCentrales) {
        if (!persistedCentrales.has(c.code)) {
          persistedCentrales.set(c.code, c);
        }
      }

      const defaultCentrale =
        persistedCentrales.values().next().value || allZoneCentrales[0] || null;

      // 3. Synchronize NROs
      const persistedNros = new Map<string, NroDocument>();
      for (const n of parsed.nros) {
        const parentCentrale = n.centraleCode
          ? persistedCentrales.get(n.centraleCode)
          : defaultCentrale;

        const existing = await this.nroModel
          .findOne({ externalId: n.externalId })
          .session(sessionArg ?? null)
          .exec();

        if (existing) {
          existing.name = n.name;
          existing.regionId = zoneIdStr;
          if (parentCentrale) {
            existing.centraleId = parentCentrale._id;
          }
          existing.location = { type: 'Point', coordinates: n.location };
          existing.maxCapacity = n.maxCapacity;
          existing.capacityGb = n.capacityGb;
          existing.status = (n.status as NroStatus) || NroStatus.ACTIVE;
          existing.statutSaturation =
            (n.statutSaturation as SaturationStatus) || SaturationStatus.NORMAL;
          existing.performanceScore = n.performanceScore;
          const saved = await existing.save(sessionOption);
          persistedNros.set(n.externalId, saved);
          summary.nros.updated++;
        } else {
          const created = await this.nroModel.create(
            [
              {
                externalId: n.externalId,
                name: n.name,
                regionId: zoneIdStr,
                centraleId: parentCentrale?._id,
                location: { type: 'Point', coordinates: n.location },
                maxCapacity: n.maxCapacity,
                capacityGb: n.capacityGb,
                status: (n.status as NroStatus) || NroStatus.ACTIVE,
                statutSaturation:
                  (n.statutSaturation as SaturationStatus) || SaturationStatus.NORMAL,
                performanceScore: n.performanceScore,
                currentLoad: 0,
                capaciteUtilisee: 0,
                usedGb: 0,
                tauxSaturation: 0,
                connectedFdtsCount: 0,
              },
            ],
            sessionOption,
          );
          persistedNros.set(n.externalId, created[0]);
          summary.nros.created++;
        }
      }

      // Load all zone NROs for reference
      const allZoneNros = await this.nroModel
        .find({ regionId: zoneIdStr })
        .session(sessionArg ?? null)
        .exec();

      for (const n of allZoneNros) {
        if (!persistedNros.has(n.externalId)) {
          persistedNros.set(n.externalId, n);
        }
      }

      // 4. Synchronize FDTs
      const persistedFdts = new Map<string, FdtDocument>();
      for (const f of parsed.fdts) {
        const parentNro = persistedNros.get(f.nroId);

        const existing = await this.fdtModel
          .findOne({ externalId: f.externalId })
          .session(sessionArg ?? null)
          .exec();

        if (existing) {
          existing.nroId = f.nroId;
          existing.regionId = zoneIdStr;
          if (parentNro?.centraleId) {
            existing.centraleId = parentNro.centraleId;
          }
          existing.location = { type: 'Point', coordinates: f.location };
          existing.maxClients = f.maxClients;
          existing.nbPortsTotal = f.nbPortsTotal;
          existing.status = (f.status as FdtStatus) || FdtStatus.ACTIVE;
          existing.statutFdt = (f.statutFdt as FdtStatut) || FdtStatut.DISPONIBLE;
          existing.signalQuality = f.signalQuality;
          const saved = await existing.save(sessionOption);
          persistedFdts.set(f.externalId, saved);
          summary.fdts.updated++;
        } else {
          const created = await this.fdtModel.create(
            [
              {
                externalId: f.externalId,
                nroId: f.nroId,
                regionId: zoneIdStr,
                centraleId: parentNro?.centraleId,
                location: { type: 'Point', coordinates: f.location },
                maxClients: f.maxClients,
                nbPortsTotal: f.nbPortsTotal,
                status: (f.status as FdtStatus) || FdtStatus.ACTIVE,
                statutFdt: (f.statutFdt as FdtStatut) || FdtStatut.DISPONIBLE,
                signalQuality: f.signalQuality,
                activeClients: 0,
                nbPortsUtilises: 0,
              },
            ],
            sessionOption,
          );
          persistedFdts.set(f.externalId, created[0]);
          summary.fdts.created++;
        }
      }

      // Load all zone FDTs for reference
      const allZoneFdts = await this.fdtModel
        .find({ regionId: zoneIdStr })
        .session(sessionArg ?? null)
        .exec();

      for (const f of allZoneFdts) {
        if (!persistedFdts.has(f.externalId)) {
          persistedFdts.set(f.externalId, f);
        }
      }

      // 5. Synchronize Contracts
      for (const c of parsed.contracts) {
        const parentFdt = persistedFdts.get(c.fdtId);
        const parentNroId = c.nroId || parentFdt?.nroId || '';
        const parentNro = persistedNros.get(parentNroId);

        const traceFDT = c.traceFDT || {
          type: 'LineString' as const,
          coordinates: [
            parentFdt?.location?.coordinates || c.location,
            c.location,
          ],
        };

        const existing = await this.contractModel
          .findOne({
            $or: [{ externalId: c.externalId }, { numeroTelephone: c.numeroTelephone }],
          })
          .session(sessionArg ?? null)
          .exec();

        if (existing) {
          existing.externalId = c.externalId;
          existing.location = { type: 'Point', coordinates: c.location };
          existing.latitude = c.location[1];
          existing.longitude = c.location[0];
          existing.numeroTelephone = c.numeroTelephone;
          existing.numeroCIN = c.numeroCIN;
          existing.phoneNumber = c.numeroTelephone;
          existing.cin = c.numeroCIN;
          existing.bandwidth = c.bandwidth;
          existing.offreGB = c.bandwidth;
          existing.packageGb = c.bandwidth;
          existing.typeClient = (c.typeClient as ClientType) || ClientType.MAISON;
          existing.status = (c.status as ContractStatus) || ContractStatus.ACTIVE;
          existing.installationStatus =
            (c.installationStatus as InstallationStatus) || InstallationStatus.COMPLETED;
          existing.zoneId = zoneIdStr;
          existing.regionId = zoneIdStr;
          existing.fdtId = c.fdtId;
          existing.nroId = parentNroId;
          if (parentNro?.centraleId) {
            existing.centraleId = parentNro.centraleId;
          }
          existing.traceFDT = traceFDT;
          await existing.save(sessionOption);
          summary.contracts.updated++;
        } else {
          await this.contractModel.create(
            [
              {
                externalId: c.externalId,
                location: { type: 'Point', coordinates: c.location },
                latitude: c.location[1],
                longitude: c.location[0],
                numeroTelephone: c.numeroTelephone,
                numeroCIN: c.numeroCIN,
                phoneNumber: c.numeroTelephone,
                cin: c.numeroCIN,
                bandwidth: c.bandwidth,
                offreGB: c.bandwidth,
                packageGb: c.bandwidth,
                typeClient: (c.typeClient as ClientType) || ClientType.MAISON,
                status: (c.status as ContractStatus) || ContractStatus.ACTIVE,
                installationStatus:
                  (c.installationStatus as InstallationStatus) || InstallationStatus.COMPLETED,
                zoneId: zoneIdStr,
                regionId: zoneIdStr,
                fdtId: c.fdtId,
                nroId: parentNroId,
                centraleId: parentNro?.centraleId,
                traceFDT,
              },
            ],
            sessionOption,
          );
          summary.contracts.created++;
        }
      }

      // 6. Recalculate Metrics for zone FDTs, NROs, and Centrales
      await this.recalculateZoneMetrics(zoneIdStr, sessionOption, sessionArg);

      // Commit transaction if active
      if (isTransactionActive && session) {
        await session.commitTransaction();
      }

      this.logger.log(
        `Zone "${targetZone.name}" infrastructure synchronized: ` +
          `Centrale (+${summary.centrales.created}/~${summary.centrales.updated}), ` +
          `NRO (+${summary.nros.created}/~${summary.nros.updated}), ` +
          `FDT (+${summary.fdts.created}/~${summary.fdts.updated}), ` +
          `Contracts (+${summary.contracts.created}/~${summary.contracts.updated})`,
      );

      return {
        success: true,
        message: `Zone "${targetZone.name}" infrastructure synchronized successfully`,
        zoneId: targetZone._id.toString(),
        zoneName: targetZone.name,
        summary,
      };
    } catch (error: any) {
      this.logger.error(`Failed to synchronize zone "${targetZone.name}": ${error.message}`, error.stack);

      if (isTransactionActive && session) {
        try {
          await session.abortTransaction();
        } catch {
          // ignore
        }
      }
      throw error;
    } finally {
      if (session) {
        try {
          await session.endSession();
        } catch {
          // ignore
        }
      }
    }
  }

  private async recalculateZoneMetrics(
    zoneIdStr: string,
    sessionOption: { session: ClientSession } | undefined,
    sessionArg: ClientSession | undefined,
  ): Promise<void> {
    const zoneObjectId = new Types.ObjectId(zoneIdStr);

    // 1. Recalculate FDT metrics
    const zoneFdts = await this.fdtModel
      .find({ regionId: zoneIdStr })
      .session(sessionArg ?? null)
      .exec();

    for (const fdt of zoneFdts) {
      const activeContracts = await this.contractModel
        .countDocuments({ fdtId: fdt.externalId, status: ContractStatus.ACTIVE })
        .session(sessionArg ?? null)
        .exec();

      fdt.activeClients = activeContracts;
      fdt.nbPortsUtilises = activeContracts;
      if (activeContracts >= fdt.nbPortsTotal) {
        fdt.statutFdt = FdtStatut.PLEIN;
      } else if (activeContracts >= fdt.nbPortsTotal * 0.8) {
        fdt.statutFdt = FdtStatut.CHARGE;
      } else {
        fdt.statutFdt = FdtStatut.DISPONIBLE;
      }
      await fdt.save(sessionOption);
    }

    // 2. Recalculate NRO metrics
    const zoneNros = await this.nroModel
      .find({ regionId: zoneIdStr })
      .session(sessionArg ?? null)
      .exec();

    for (const nro of zoneNros) {
      const connectedFdts = await this.fdtModel
        .countDocuments({ nroId: nro.externalId })
        .session(sessionArg ?? null)
        .exec();

      const activeContracts = await this.contractModel
        .find({ nroId: nro.externalId, status: ContractStatus.ACTIVE })
        .session(sessionArg ?? null)
        .exec();

      const totalUsedGb = activeContracts.reduce(
        (sum, contract) => sum + (contract.bandwidth || 0),
        0,
      );

      nro.connectedFdtsCount = connectedFdts;
      nro.currentLoad = activeContracts.length;
      nro.usedGb = totalUsedGb;
      nro.capaciteUtilisee = totalUsedGb;
      nro.tauxSaturation =
        nro.capacityGb > 0 ? (totalUsedGb / nro.capacityGb) * 100 : 0;

      if (nro.tauxSaturation >= 90) {
        nro.statutSaturation = SaturationStatus.SATURE;
      } else if (nro.tauxSaturation >= 75) {
        nro.statutSaturation = SaturationStatus.CHARGE;
      } else {
        nro.statutSaturation = SaturationStatus.NORMAL;
      }

      await nro.save(sessionOption);
    }

    // 3. Recalculate Centrale capacity
    const zoneCentrales = await this.centraleModel
      .find({ regionId: zoneObjectId })
      .session(sessionArg ?? null)
      .exec();

    for (const centrale of zoneCentrales) {
      const centraleNros = await this.nroModel
        .find({ centraleId: centrale._id })
        .session(sessionArg ?? null)
        .exec();

      centrale.capaciteTotal = centraleNros.reduce(
        (sum, nro) => sum + (nro.capacityGb || 0),
        0,
      );

      await centrale.save(sessionOption);
    }
  }
}
