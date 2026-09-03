import { Test, TestingModule } from '@nestjs/testing';
import { getModelToken, getConnectionToken } from '@nestjs/mongoose';
import { BadRequestException, ForbiddenException, NotFoundException } from '@nestjs/common';
import { Types } from 'mongoose';
import { ZonesService } from './zones.service';
import { Zone } from './schemas/zone.schema';
import { Centrale } from '../centrale/schemas/centrale.schema';
import { Nro } from '../nro/schemas/nro.schema';
import { Fdt } from '../fdt/schemas/fdt.schema';
import { Contract } from '../contracts/schemas/contract.schema';
import { AppRole } from '../auth/roles.enum';

describe('ZonesService - GeoJSON Import & Synchronization', () => {
  let service: ZonesService;

  const mockZoneId = new Types.ObjectId().toString();
  const mockOtherZoneId = new Types.ObjectId().toString();

  const mockZoneDoc = {
    _id: new Types.ObjectId(mockZoneId),
    name: 'Tunis',
    isActive: true,
    geometry: {
      type: 'Polygon',
      coordinates: [
        [
          [10.1, 36.7],
          [10.3, 36.7],
          [10.3, 36.9],
          [10.1, 36.9],
          [10.1, 36.7],
        ],
      ],
    },
    save: jest.fn().mockResolvedValue(true),
  };

  const mockZoneModel: any = {
    findOne: jest.fn(),
    findById: jest.fn(),
    find: jest.fn(),
    findByIdAndUpdate: jest.fn(),
    create: jest.fn(),
  };

  const mockCentraleModel: any = {
    find: jest.fn(),
    findOne: jest.fn(),
    create: jest.fn(),
  };

  const mockNroModel: any = {
    find: jest.fn(),
    findOne: jest.fn(),
    countDocuments: jest.fn(),
    create: jest.fn(),
  };

  const mockFdtModel: any = {
    find: jest.fn(),
    findOne: jest.fn(),
    countDocuments: jest.fn(),
    create: jest.fn(),
  };

  const mockContractModel: any = {
    find: jest.fn(),
    findOne: jest.fn(),
    countDocuments: jest.fn(),
    create: jest.fn(),
  };

  const mockSession = {
    startTransaction: jest.fn(),
    commitTransaction: jest.fn(),
    abortTransaction: jest.fn(),
    endSession: jest.fn(),
  };

  const mockConnection = {
    startSession: jest.fn().mockResolvedValue(mockSession),
  };

  beforeEach(async () => {
    jest.clearAllMocks();

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        ZonesService,
        { provide: getModelToken(Zone.name), useValue: mockZoneModel },
        { provide: getModelToken(Centrale.name), useValue: mockCentraleModel },
        { provide: getModelToken(Nro.name), useValue: mockNroModel },
        { provide: getModelToken(Fdt.name), useValue: mockFdtModel },
        { provide: getModelToken(Contract.name), useValue: mockContractModel },
        { provide: getConnectionToken(), useValue: mockConnection },
      ],
    }).compile();

    service = module.get<ZonesService>(ZonesService);

    // Default mock behavior for zone lookup
    mockZoneModel.findById.mockImplementation((id: string) => ({
      exec: jest.fn().mockResolvedValue(id === mockZoneId ? mockZoneDoc : null),
    }));

    // Default mock behavior for findByRegionIdentifier
    mockZoneModel.findOne.mockImplementation(({ name }: { name?: string }) => ({
      exec: jest.fn().mockResolvedValue(name === 'Tunis' ? mockZoneDoc : null),
    }));

    // Default mocks for query lists
    mockCentraleModel.find.mockReturnValue({
      exec: jest.fn().mockResolvedValue([]),
      session: jest.fn().mockReturnValue({ exec: jest.fn().mockResolvedValue([]) }),
    });
    mockNroModel.find.mockReturnValue({
      exec: jest.fn().mockResolvedValue([]),
      session: jest.fn().mockReturnValue({ exec: jest.fn().mockResolvedValue([]) }),
    });
    mockFdtModel.find.mockReturnValue({
      exec: jest.fn().mockResolvedValue([]),
      session: jest.fn().mockReturnValue({ exec: jest.fn().mockResolvedValue([]) }),
    });
    mockContractModel.find.mockReturnValue({
      exec: jest.fn().mockResolvedValue([]),
      session: jest.fn().mockReturnValue({ exec: jest.fn().mockResolvedValue([]) }),
    });

    mockNroModel.countDocuments.mockReturnValue({
      session: jest.fn().mockReturnValue({ exec: jest.fn().mockResolvedValue(0) }),
      exec: jest.fn().mockResolvedValue(0),
    });
    mockFdtModel.countDocuments.mockReturnValue({
      session: jest.fn().mockReturnValue({ exec: jest.fn().mockResolvedValue(0) }),
      exec: jest.fn().mockResolvedValue(0),
    });
    mockContractModel.countDocuments.mockReturnValue({
      session: jest.fn().mockReturnValue({ exec: jest.fn().mockResolvedValue(0) }),
      exec: jest.fn().mockResolvedValue(0),
    });
  });

  describe('Disallowing zone creation (24 fixed zones guarantee)', () => {
    it('should throw BadRequestException when create() is invoked', () => {
      expect(() => service.create()).toThrow(BadRequestException);
      expect(() => service.create()).toThrow(
        /Creating new zones is permanently disabled/i,
      );
    });
  });

  describe('RBAC and Target Zone validation', () => {
    it('should throw NotFoundException if target zone does not exist', async () => {
      const nonExistentId = new Types.ObjectId().toString();
      await expect(
        service.importZoneGeoJson(
          nonExistentId,
          { type: 'FeatureCollection', features: [] },
          { sub: 'user-1', role: AppRole.ADMIN },
        ),
      ).rejects.toThrow(NotFoundException);
    });

    it('should allow ADMIN to import for any existing zone', async () => {
      const validPayload = {
        type: 'FeatureCollection',
        features: [
          {
            type: 'Feature',
            geometry: {
              type: 'Point',
              coordinates: [10.18, 36.8],
            },
            properties: {
              kind: 'centrale',
              code: 'CO-TUN-01',
              nom: 'Centrale Tunis Centre',
            },
          },
        ],
      };

      mockCentraleModel.findOne.mockReturnValue({
        session: jest.fn().mockReturnValue({ exec: jest.fn().mockResolvedValue(null) }),
        exec: jest.fn().mockResolvedValue(null),
      });
      mockCentraleModel.create.mockResolvedValue([
        {
          _id: new Types.ObjectId(),
          code: 'CO-TUN-01',
          nom: 'Centrale Tunis Centre',
        },
      ]);

      const result = await service.importZoneGeoJson(
        mockZoneId,
        validPayload,
        { sub: 'admin-1', role: AppRole.ADMIN },
      );

      expect(result.success).toBe(true);
      expect(result.zoneName).toBe('Tunis');
      expect(result.summary.centrales.created).toBe(1);
    });

    it('should allow RESPONSABLE_ZONE to import for their own assigned zone', async () => {
      const validPayload = {
        type: 'FeatureCollection',
        features: [
          {
            type: 'Feature',
            geometry: {
              type: 'Point',
              coordinates: [10.18, 36.8],
            },
            properties: {
              kind: 'centrale',
              code: 'CO-TUN-01',
              nom: 'Centrale Tunis Centre',
            },
          },
        ],
      };

      mockCentraleModel.findOne.mockReturnValue({
        session: jest.fn().mockReturnValue({ exec: jest.fn().mockResolvedValue(null) }),
        exec: jest.fn().mockResolvedValue(null),
      });
      mockCentraleModel.create.mockResolvedValue([
        {
          _id: new Types.ObjectId(),
          code: 'CO-TUN-01',
          nom: 'Centrale Tunis Centre',
        },
      ]);

      const result = await service.importZoneGeoJson(
        mockZoneId,
        validPayload,
        { sub: 'resp-1', role: AppRole.RESPONSABLE_ZONE, zoneId: mockZoneId },
      );

      expect(result.success).toBe(true);
    });

    it('should throw ForbiddenException if RESPONSABLE_ZONE attempts to import another zone', async () => {
      const validPayload = {
        type: 'FeatureCollection',
        features: [],
      };

      await expect(
        service.importZoneGeoJson(
          mockZoneId,
          validPayload,
          { sub: 'resp-1', role: AppRole.RESPONSABLE_ZONE, zoneId: mockOtherZoneId },
        ),
      ).rejects.toThrow(ForbiddenException);
    });

    it('should reject GeoJSON if zone name does not match target zone (e.g. Sfax into Tunis)', async () => {
      const mismatchPayload = {
        type: 'FeatureCollection',
        features: [
          {
            type: 'Feature',
            geometry: {
              type: 'Polygon',
              coordinates: [
                [
                  [10.7, 34.7],
                  [10.8, 34.7],
                  [10.8, 34.8],
                  [10.7, 34.8],
                  [10.7, 34.7],
                ],
              ],
            },
            properties: {
              kind: 'zone',
              name: 'Sfax',
            },
          },
        ],
      };

      await expect(
        service.importZoneGeoJson(
          mockZoneId,
          mismatchPayload,
          { sub: 'admin-1', role: AppRole.ADMIN },
        ),
      ).rejects.toThrow(BadRequestException);
    });
  });

  describe('GeoJSON Coordinate Validation (Tunisia bounds)', () => {
    it('should throw BadRequestException if coordinates are outside Tunisia bounds', async () => {
      const outOfBoundsPayload = {
        type: 'FeatureCollection',
        features: [
          {
            type: 'Feature',
            geometry: {
              type: 'Point',
              coordinates: [2.35, 48.85], // Paris, France
            },
            properties: {
              kind: 'nro',
              externalId: 'NRO-PARIS-01',
            },
          },
        ],
      };

      await expect(
        service.importZoneGeoJson(
          mockZoneId,
          outOfBoundsPayload,
          { sub: 'admin-1', role: AppRole.ADMIN },
        ),
      ).rejects.toThrow(/outside Tunisia bounds/i);
    });
  });

  describe('Duplicate Detection in GeoJSON', () => {
    it('should throw BadRequestException on duplicate Centrale code', async () => {
      const payload = {
        type: 'FeatureCollection',
        features: [
          {
            type: 'Feature',
            geometry: { type: 'Point', coordinates: [10.18, 36.8] },
            properties: { kind: 'centrale', code: 'CO-TUN-01' },
          },
          {
            type: 'Feature',
            geometry: { type: 'Point', coordinates: [10.19, 36.81] },
            properties: { kind: 'centrale', code: 'CO-TUN-01' },
          },
        ],
      };

      await expect(
        service.importZoneGeoJson(mockZoneId, payload, { sub: 'admin-1', role: AppRole.ADMIN }),
      ).rejects.toThrow(/Duplicate Centrale code/i);
    });

    it('should throw BadRequestException on duplicate NRO externalId', async () => {
      const payload = {
        type: 'FeatureCollection',
        features: [
          {
            type: 'Feature',
            geometry: { type: 'Point', coordinates: [10.18, 36.8] },
            properties: { kind: 'nro', externalId: 'NRO-TUN-01' },
          },
          {
            type: 'Feature',
            geometry: { type: 'Point', coordinates: [10.19, 36.81] },
            properties: { kind: 'nro', externalId: 'NRO-TUN-01' },
          },
        ],
      };

      await expect(
        service.importZoneGeoJson(mockZoneId, payload, { sub: 'admin-1', role: AppRole.ADMIN }),
      ).rejects.toThrow(/Duplicate NRO externalId/i);
    });

    it('should throw BadRequestException on duplicate FDT externalId', async () => {
      const payload = {
        type: 'FeatureCollection',
        features: [
          {
            type: 'Feature',
            geometry: { type: 'Point', coordinates: [10.18, 36.8] },
            properties: { kind: 'nro', externalId: 'NRO-TUN-01' },
          },
          {
            type: 'Feature',
            geometry: { type: 'Point', coordinates: [10.181, 36.801] },
            properties: { kind: 'fdt', externalId: 'FDT-TUN-11', nroId: 'NRO-TUN-01' },
          },
          {
            type: 'Feature',
            geometry: { type: 'Point', coordinates: [10.182, 36.802] },
            properties: { kind: 'fdt', externalId: 'FDT-TUN-11', nroId: 'NRO-TUN-01' },
          },
        ],
      };

      await expect(
        service.importZoneGeoJson(mockZoneId, payload, { sub: 'admin-1', role: AppRole.ADMIN }),
      ).rejects.toThrow(/Duplicate FDT externalId/i);
    });

    it('should throw BadRequestException on duplicate Contract externalId', async () => {
      const payload = {
        type: 'FeatureCollection',
        features: [
          {
            type: 'Feature',
            geometry: { type: 'Point', coordinates: [10.18, 36.8] },
            properties: { kind: 'nro', externalId: 'NRO-TUN-01' },
          },
          {
            type: 'Feature',
            geometry: { type: 'Point', coordinates: [10.181, 36.801] },
            properties: { kind: 'fdt', externalId: 'FDT-TUN-11', nroId: 'NRO-TUN-01' },
          },
          {
            type: 'Feature',
            geometry: { type: 'Point', coordinates: [10.182, 36.802] },
            properties: {
              kind: 'contract',
              externalId: 'EXT-101',
              numeroTelephone: '20111222',
              fdtId: 'FDT-TUN-11',
            },
          },
          {
            type: 'Feature',
            geometry: { type: 'Point', coordinates: [10.183, 36.803] },
            properties: {
              kind: 'contract',
              externalId: 'EXT-101',
              numeroTelephone: '20333444',
              fdtId: 'FDT-TUN-11',
            },
          },
        ],
      };

      await expect(
        service.importZoneGeoJson(mockZoneId, payload, { sub: 'admin-1', role: AppRole.ADMIN }),
      ).rejects.toThrow(/Duplicate Contract externalId/i);
    });

    it('should throw BadRequestException on duplicate Contract telephone number', async () => {
      const payload = {
        type: 'FeatureCollection',
        features: [
          {
            type: 'Feature',
            geometry: { type: 'Point', coordinates: [10.18, 36.8] },
            properties: { kind: 'nro', externalId: 'NRO-TUN-01' },
          },
          {
            type: 'Feature',
            geometry: { type: 'Point', coordinates: [10.181, 36.801] },
            properties: { kind: 'fdt', externalId: 'FDT-TUN-11', nroId: 'NRO-TUN-01' },
          },
          {
            type: 'Feature',
            geometry: { type: 'Point', coordinates: [10.182, 36.802] },
            properties: {
              kind: 'contract',
              externalId: 'EXT-101',
              numeroTelephone: '20111222',
              fdtId: 'FDT-TUN-11',
            },
          },
          {
            type: 'Feature',
            geometry: { type: 'Point', coordinates: [10.183, 36.803] },
            properties: {
              kind: 'contract',
              externalId: 'EXT-102',
              numeroTelephone: '20111222',
              fdtId: 'FDT-TUN-11',
            },
          },
        ],
      };

      await expect(
        service.importZoneGeoJson(mockZoneId, payload, { sub: 'admin-1', role: AppRole.ADMIN }),
      ).rejects.toThrow(/Duplicate numeroTelephone/i);
    });
  });

  describe('Hierarchical Validation', () => {
    it('should throw BadRequestException if NRO references an unknown Centrale', async () => {
      const payload = {
        type: 'FeatureCollection',
        features: [
          {
            type: 'Feature',
            geometry: { type: 'Point', coordinates: [10.18, 36.8] },
            properties: {
              kind: 'nro',
              externalId: 'NRO-TUN-01',
              centraleCode: 'CO-UNKNOWN-99',
            },
          },
        ],
      };

      await expect(
        service.importZoneGeoJson(mockZoneId, payload, { sub: 'admin-1', role: AppRole.ADMIN }),
      ).rejects.toThrow(/unknown Centrale/i);
    });

    it('should throw BadRequestException if FDT references an unknown NRO', async () => {
      const payload = {
        type: 'FeatureCollection',
        features: [
          {
            type: 'Feature',
            geometry: { type: 'Point', coordinates: [10.18, 36.8] },
            properties: {
              kind: 'fdt',
              externalId: 'FDT-TUN-11',
              nroId: 'NRO-NONEXISTENT',
            },
          },
        ],
      };

      await expect(
        service.importZoneGeoJson(mockZoneId, payload, { sub: 'admin-1', role: AppRole.ADMIN }),
      ).rejects.toThrow(/unknown NRO/i);
    });

    it('should throw BadRequestException if Contract references an unknown FDT', async () => {
      const payload = {
        type: 'FeatureCollection',
        features: [
          {
            type: 'Feature',
            geometry: { type: 'Point', coordinates: [10.18, 36.8] },
            properties: { kind: 'nro', externalId: 'NRO-TUN-01' },
          },
          {
            type: 'Feature',
            geometry: { type: 'Point', coordinates: [10.181, 36.801] },
            properties: {
              kind: 'contract',
              externalId: 'EXT-101',
              numeroTelephone: '20111222',
              fdtId: 'FDT-NONEXISTENT',
            },
          },
        ],
      };

      await expect(
        service.importZoneGeoJson(mockZoneId, payload, { sub: 'admin-1', role: AppRole.ADMIN }),
      ).rejects.toThrow(/unknown FDT/i);
    });
  });

  describe('Complete Valid GeoJSON Import & Synchronization', () => {
    it('should successfully import complete infrastructure hierarchy', async () => {
      const completeGeoJson = {
        type: 'FeatureCollection',
        features: [
          // 1. Zone Polygon
          {
            type: 'Feature',
            geometry: {
              type: 'Polygon',
              coordinates: [
                [
                  [10.1, 36.7],
                  [10.3, 36.7],
                  [10.3, 36.9],
                  [10.1, 36.9],
                  [10.1, 36.7],
                ],
              ],
            },
            properties: {
              kind: 'zone',
              name: 'Tunis',
            },
          },
          // 2. Centrale
          {
            type: 'Feature',
            geometry: { type: 'Point', coordinates: [10.18, 36.8] },
            properties: {
              kind: 'centrale',
              code: 'CO-TUN-01',
              nom: 'Centrale Tunis Centre',
              capaciteTotal: 1000,
            },
          },
          // 3. NRO
          {
            type: 'Feature',
            geometry: { type: 'Point', coordinates: [10.185, 36.805] },
            properties: {
              kind: 'nro',
              externalId: 'NRO-TUN-01',
              name: 'NRO Tunis Nord',
              centraleCode: 'CO-TUN-01',
              maxCapacity: 600,
            },
          },
          // 4. FDT
          {
            type: 'Feature',
            geometry: { type: 'Point', coordinates: [10.188, 36.808] },
            properties: {
              kind: 'fdt',
              externalId: 'FDT-TUN-11',
              nroId: 'NRO-TUN-01',
              maxClients: 128,
              nbPortsTotal: 32,
            },
          },
          // 5. Contract
          {
            type: 'Feature',
            geometry: { type: 'Point', coordinates: [10.19, 36.81] },
            properties: {
              kind: 'contract',
              externalId: 'EXT-10001',
              numeroTelephone: '20111222',
              numeroCIN: '12345678',
              fdtId: 'FDT-TUN-11',
              bandwidth: 50,
              typeClient: 'MAISON',
            },
          },
        ],
      };

      // Mocking finding / creating entities
      const centraleDoc = {
        _id: new Types.ObjectId(),
        code: 'CO-TUN-01',
        nom: 'Centrale Tunis Centre',
        save: jest.fn().mockResolvedValue(true),
      };
      const nroDoc = {
        _id: new Types.ObjectId(),
        externalId: 'NRO-TUN-01',
        name: 'NRO Tunis Nord',
        centraleId: centraleDoc._id,
        save: jest.fn().mockResolvedValue(true),
      };
      const fdtDoc = {
        _id: new Types.ObjectId(),
        externalId: 'FDT-TUN-11',
        nroId: 'NRO-TUN-01',
        centraleId: centraleDoc._id,
        location: { coordinates: [10.188, 36.808] },
        save: jest.fn().mockResolvedValue(true),
      };

      mockCentraleModel.findOne.mockReturnValue({
        session: jest.fn().mockReturnValue({ exec: jest.fn().mockResolvedValue(null) }),
        exec: jest.fn().mockResolvedValue(null),
      });
      mockCentraleModel.create.mockResolvedValue([centraleDoc]);

      mockNroModel.findOne.mockReturnValue({
        session: jest.fn().mockReturnValue({ exec: jest.fn().mockResolvedValue(null) }),
        exec: jest.fn().mockResolvedValue(null),
      });
      mockNroModel.create.mockResolvedValue([nroDoc]);

      mockFdtModel.findOne.mockReturnValue({
        session: jest.fn().mockReturnValue({ exec: jest.fn().mockResolvedValue(null) }),
        exec: jest.fn().mockResolvedValue(null),
      });
      mockFdtModel.create.mockResolvedValue([fdtDoc]);

      mockContractModel.findOne.mockReturnValue({
        session: jest.fn().mockReturnValue({ exec: jest.fn().mockResolvedValue(null) }),
        exec: jest.fn().mockResolvedValue(null),
      });
      mockContractModel.create.mockResolvedValue([{ externalId: 'EXT-10001' }]);

      mockZoneModel.findByIdAndUpdate.mockResolvedValue(mockZoneDoc);

      const result = await service.importZoneGeoJson(
        mockZoneId,
        completeGeoJson,
        { sub: 'admin-1', role: AppRole.ADMIN },
      );

      expect(result.success).toBe(true);
      expect(result.zoneName).toBe('Tunis');
      expect(result.summary.zoneGeometryUpdated).toBe(true);
      expect(result.summary.centrales.created).toBe(1);
      expect(result.summary.nros.created).toBe(1);
      expect(result.summary.fdts.created).toBe(1);
      expect(result.summary.contracts.created).toBe(1);
      expect(mockSession.commitTransaction).toHaveBeenCalled();
    });

    it('should abort transaction and rethrow if an error occurs during execution', async () => {
      const completeGeoJson = {
        type: 'FeatureCollection',
        features: [
          {
            type: 'Feature',
            geometry: { type: 'Point', coordinates: [10.18, 36.8] },
            properties: { kind: 'centrale', code: 'CO-TUN-01' },
          },
        ],
      };

      mockCentraleModel.findOne.mockReturnValue({
        session: jest.fn().mockReturnValue({
          exec: jest.fn().mockRejectedValue(new Error('Simulated DB write failure')),
        }),
      });

      await expect(
        service.importZoneGeoJson(
          mockZoneId,
          completeGeoJson,
          { sub: 'admin-1', role: AppRole.ADMIN },
        ),
      ).rejects.toThrow('Simulated DB write failure');

      expect(mockSession.abortTransaction).toHaveBeenCalled();
    });
  });
});
