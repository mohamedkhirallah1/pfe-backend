import { Test, TestingModule } from '@nestjs/testing';
import { UsersController } from './users.controller';
import { UsersService } from '../services/users.service';
import { AppRole } from '../../auth/roles.enum';

describe('UsersController', () => {
  let controller: UsersController;
  let mockUsersService: any;

  const mockZoneManagers = [
    {
      id: '64b000000000000000000002',
      username: 'zone_tunis',
      email: 'zone_tunis@smartfiber.tn',
      role: AppRole.RESPONSABLE_ZONE,
      zoneId: '64b000000000000000000001',
      zoneName: 'Tunis',
      isActive: true,
    },
  ];

  beforeEach(async () => {
    mockUsersService = {
      findZoneManagers: jest.fn().mockResolvedValue(mockZoneManagers),
      createZoneManager: jest.fn().mockResolvedValue(mockZoneManagers[0]),
      updateZoneManager: jest.fn().mockResolvedValue(mockZoneManagers[0]),
      deleteZoneManager: jest.fn().mockResolvedValue(undefined),
      getTunisiaRegions: jest.fn().mockReturnValue(['Tunis', 'Ariana', 'Sfax']),
      findAll: jest.fn().mockResolvedValue(mockZoneManagers),
    };

    const module: TestingModule = await Test.createTestingModule({
      controllers: [UsersController],
      providers: [{ provide: UsersService, useValue: mockUsersService }],
    }).compile();

    controller = module.get<UsersController>(UsersController);
  });

  it('should be defined', () => {
    expect(controller).toBeDefined();
  });

  it('should get all zone managers', async () => {
    const result = await controller.getZoneManagers();
    expect(mockUsersService.findZoneManagers).toHaveBeenCalled();
    expect(result).toEqual({
      message: 'Zone managers retrieved successfully',
      data: mockZoneManagers,
    });
  });

  it('should create a zone manager', async () => {
    const dto = {
      username: 'zone_tunis',
      email: 'zone_tunis@smartfiber.tn',
      password: 'password123',
      zoneId: 'Tunis',
    };
    const result = await controller.createZoneManager(dto as any);
    expect(mockUsersService.createZoneManager).toHaveBeenCalledWith(dto);
    expect(result).toEqual({
      message: 'Zone manager created successfully',
      data: mockZoneManagers[0],
    });
  });

  it('should update a zone manager', async () => {
    const dto = { email: 'new@smartfiber.tn' };
    const result = await controller.updateZoneManager('id-1', dto as any);
    expect(mockUsersService.updateZoneManager).toHaveBeenCalledWith('id-1', dto);
    expect(result).toEqual({
      message: 'Zone manager updated successfully',
      data: mockZoneManagers[0],
    });
  });

  it('should update current user language', async () => {
    mockUsersService.updateLanguage = jest.fn().mockResolvedValue({ language: 'en' });
    const req = { user: { sub: 'user-123' } };
    const dto = { language: 'en' as const };

    const result = await controller.updateMyLanguage(req, dto);

    expect(mockUsersService.updateLanguage).toHaveBeenCalledWith('user-123', 'en');
    expect(result).toEqual({ language: 'en' });
  });

  it('should get current user profile with language', async () => {
    const mockProfile = {
      id: 'user-123',
      username: 'admin',
      email: 'admin@smartfiber.tn',
      role: AppRole.ADMIN,
      isActive: true,
      language: 'fr',
    };
    mockUsersService.getProfile = jest.fn().mockResolvedValue(mockProfile);
    const req = { user: { sub: 'user-123' } };

    const result = await controller.getMyProfile(req);

    expect(mockUsersService.getProfile).toHaveBeenCalledWith('user-123');
    expect(result).toEqual(mockProfile);
  });
});
