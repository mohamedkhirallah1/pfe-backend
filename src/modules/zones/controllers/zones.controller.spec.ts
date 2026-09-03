import { Test, TestingModule } from '@nestjs/testing';
import { BadRequestException, ForbiddenException } from '@nestjs/common';
import { ZonesController } from './zones.controller';
import { ZonesService } from '../zones.service';
import { AppRole } from '../../auth/roles.enum';

describe('ZonesController', () => {
  let controller: ZonesController;
  let service: ZonesService;

  const mockZonesService = {
    getPredefinedRegions: jest.fn().mockResolvedValue([]),
    findAll: jest.fn().mockResolvedValue([]),
    findById: jest.fn().mockResolvedValue({ _id: 'zone-123', name: 'Tunis' }),
    update: jest.fn().mockResolvedValue({ _id: 'zone-123', name: 'Tunis' }),
    remove: jest.fn().mockResolvedValue({ message: 'Zone deactivated successfully' }),
    importZoneGeoJson: jest.fn().mockResolvedValue({
      success: true,
      message: 'Zone synchronized',
      zoneId: 'zone-123',
      zoneName: 'Tunis',
    }),
  };

  beforeEach(async () => {
    jest.clearAllMocks();

    const module: TestingModule = await Test.createTestingModule({
      controllers: [ZonesController],
      providers: [
        {
          provide: ZonesService,
          useValue: mockZonesService,
        },
      ],
    }).compile();

    controller = module.get<ZonesController>(ZonesController);
    service = module.get<ZonesService>(ZonesService);
  });

  describe('getMyZoneMap', () => {
    it('should throw BadRequestException if user has no zoneId', () => {
      expect(() => controller.getMyZoneMap({ user: {} })).toThrow(
        BadRequestException,
      );
    });

    it('should return zone data for assigned zone', async () => {
      const result = await controller.getMyZoneMap({ user: { zoneId: 'zone-123' } });
      expect(result).toEqual({ _id: 'zone-123', name: 'Tunis' });
      expect(service.findById).toHaveBeenCalledWith('zone-123');
    });
  });

  describe('importMyZoneGeoJson', () => {
    it('should throw BadRequestException if user has no zoneId', () => {
      expect(() =>
        controller.importMyZoneGeoJson({ user: {} }, { type: 'FeatureCollection' }),
      ).toThrow(BadRequestException);
    });

    it('should call importZoneGeoJson with user.zoneId', async () => {
      const req = { user: { sub: 'u1', role: AppRole.RESPONSABLE_ZONE, zoneId: 'zone-123' } };
      const dto = { type: 'FeatureCollection' };

      const result = await controller.importMyZoneGeoJson(req, dto);
      expect(result.success).toBe(true);
      expect(service.importZoneGeoJson).toHaveBeenCalledWith('zone-123', dto, req.user);
    });
  });

  describe('importZoneGeoJson (by ID)', () => {
    it('should allow ADMIN to import any zone', async () => {
      const req = { user: { sub: 'admin-1', role: AppRole.ADMIN } };
      const dto = { type: 'FeatureCollection' };

      const result = await controller.importZoneGeoJson('zone-999', req, dto);
      expect(result.success).toBe(true);
      expect(service.importZoneGeoJson).toHaveBeenCalledWith('zone-999', dto, req.user);
    });

    it('should allow RESPONSABLE_ZONE to import their own zone', async () => {
      const req = { user: { sub: 'resp-1', role: AppRole.RESPONSABLE_ZONE, zoneId: 'zone-123' } };
      const dto = { type: 'FeatureCollection' };

      const result = await controller.importZoneGeoJson('zone-123', req, dto);
      expect(result.success).toBe(true);
      expect(service.importZoneGeoJson).toHaveBeenCalledWith('zone-123', dto, req.user);
    });

    it('should throw ForbiddenException if RESPONSABLE_ZONE imports another zone', () => {
      const req = { user: { sub: 'resp-1', role: AppRole.RESPONSABLE_ZONE, zoneId: 'zone-123' } };
      const dto = { type: 'FeatureCollection' };

      expect(() => controller.importZoneGeoJson('zone-456', req, dto)).toThrow(
        ForbiddenException,
      );
    });
  });
});
