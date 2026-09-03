import { Test, TestingModule } from '@nestjs/testing';
import { getModelToken } from '@nestjs/mongoose';
import { ConfigService } from '@nestjs/config';
import { ConflictException, BadRequestException, NotFoundException } from '@nestjs/common';
import { UsersService } from './users.service';
import { User } from '../schemas/user.schema';
import { Zone } from '../../zones/schemas/zone.schema';
import { AppRole } from '../../auth/roles.enum';
import * as bcrypt from 'bcrypt';

describe('UsersService', () => {
  let service: UsersService;
  let mockUserModel: any;
  let mockZoneModel: any;
  let mockConfigService: any;

  const mockZoneDoc = {
    _id: '64b000000000000000000001',
    name: 'Tunis',
    isActive: true,
  };

  const mockUserDoc = {
    _id: '64b000000000000000000002',
    username: 'zone_tunis',
    email: 'zone_tunis@smartfiber.tn',
    password: 'hashed_password',
    role: AppRole.RESPONSABLE_ZONE,
    zoneId: '64b000000000000000000001',
    isActive: true,
    save: jest.fn(),
  };

  beforeEach(async () => {
    mockUserModel = jest.fn().mockImplementation((dto) => ({
      ...dto,
      _id: '64b000000000000000000002',
      save: jest.fn().mockResolvedValue({
        _id: '64b000000000000000000002',
        username: dto.username,
        email: dto.email,
        password: dto.password,
        role: dto.role,
        zoneId: dto.zoneId,
        isActive: dto.isActive,
      }),
    }));

    mockUserModel.findOne = jest.fn();
    mockUserModel.findById = jest.fn();
    mockUserModel.find = jest.fn();
    mockUserModel.create = jest.fn();

    mockZoneModel = {
      findOne: jest.fn().mockReturnValue({
        exec: jest.fn().mockResolvedValue(mockZoneDoc),
      }),
      findById: jest.fn().mockReturnValue({
        exec: jest.fn().mockResolvedValue(mockZoneDoc),
      }),
      find: jest.fn().mockReturnValue({
        exec: jest.fn().mockResolvedValue([mockZoneDoc]),
      }),
      findByIdAndUpdate: jest.fn().mockResolvedValue(mockZoneDoc),
    };

    mockConfigService = {
      get: jest.fn((key: string, defaultVal?: string) => defaultVal ?? null),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        UsersService,
        {
          provide: getModelToken(User.name),
          useValue: mockUserModel,
        },
        {
          provide: getModelToken(Zone.name),
          useValue: mockZoneModel,
        },
        {
          provide: ConfigService,
          useValue: mockConfigService,
        },
      ],
    }).compile();

    service = module.get<UsersService>(UsersService);
  });

  describe('createZoneManager', () => {
    it('should successfully create a zone manager with valid email and return public user with email', async () => {
      mockUserModel.findOne.mockResolvedValue(null); // No existing username, email, or zone manager

      const result = await service.createZoneManager({
        username: 'zone_tunis',
        email: 'Zone_Tunis@SmartFiber.TN ',
        password: 'Password123!',
        zoneId: 'Tunis',
      });

      expect(result).toBeDefined();
      expect(result.username).toBe('zone_tunis');
      expect(result.email).toBe('zone_tunis@smartfiber.tn');
      expect(result.role).toBe(AppRole.RESPONSABLE_ZONE);
      expect(result.zoneName).toBe('Tunis');
    });

    it('should throw ConflictException if username already exists', async () => {
      mockUserModel.findOne.mockResolvedValueOnce(mockUserDoc); // username exists

      await expect(
        service.createZoneManager({
          username: 'zone_tunis',
          email: 'zone_tunis@smartfiber.tn',
          password: 'Password123!',
          zoneId: 'Tunis',
        }),
      ).rejects.toThrow(ConflictException);
    });

    it('should throw ConflictException if email already exists', async () => {
      mockUserModel.findOne
        .mockResolvedValueOnce(null) // username not found
        .mockResolvedValueOnce(mockUserDoc); // email found!

      await expect(
        service.createZoneManager({
          username: 'zone_tunis_new',
          email: 'zone_tunis@smartfiber.tn',
          password: 'Password123!',
          zoneId: 'Tunis',
        }),
      ).rejects.toThrow(ConflictException);
    });

    it('should throw BadRequestException if zone map does not exist', async () => {
      mockUserModel.findOne.mockResolvedValue(null);
      mockZoneModel.findOne.mockReturnValueOnce({
        exec: jest.fn().mockResolvedValue(null),
      });

      await expect(
        service.createZoneManager({
          username: 'zone_tunis',
          email: 'zone_tunis@smartfiber.tn',
          password: 'Password123!',
          zoneId: 'Tunis',
        }),
      ).rejects.toThrow(BadRequestException);
    });
  });

  describe('updateZoneManager', () => {
    it('should update zone manager email successfully with normalization', async () => {
      const userToUpdate = {
        ...mockUserDoc,
        email: 'old_email@smartfiber.tn',
        save: jest.fn().mockImplementation(function (this: any) {
          return Promise.resolve(this);
        }),
      };

      mockUserModel.findById.mockResolvedValue(userToUpdate);
      mockUserModel.findOne.mockResolvedValue(null); // No collision

      const result = await service.updateZoneManager('64b000000000000000000002', {
        email: 'New_Email@SmartFiber.TN ',
      });

      expect(result.email).toBe('new_email@smartfiber.tn');
      expect(userToUpdate.email).toBe('new_email@smartfiber.tn');
    });

    it('should reject update if email is already taken by another user', async () => {
      const userToUpdate = {
        ...mockUserDoc,
        email: 'old_email@smartfiber.tn',
      };

      mockUserModel.findById.mockResolvedValue(userToUpdate);
      mockUserModel.findOne.mockResolvedValue({ _id: 'another_user_id', email: 'taken@smartfiber.tn' });

      await expect(
        service.updateZoneManager('64b000000000000000000002', {
          email: 'taken@smartfiber.tn',
        }),
      ).rejects.toThrow(ConflictException);
    });

    it('should throw NotFoundException if user does not exist', async () => {
      mockUserModel.findById.mockResolvedValue(null);

      await expect(
        service.updateZoneManager('non_existent_id', {
          email: 'test@smartfiber.tn',
        }),
      ).rejects.toThrow(NotFoundException);
    });
  });

  describe('findZoneManagers & findAll', () => {
    it('should return list of zone managers including email and resolve ObjectId zone', async () => {
      mockUserModel.find.mockReturnValue({
        select: jest.fn().mockResolvedValue([mockUserDoc]),
      });

      const managers = await service.findZoneManagers();
      expect(managers).toHaveLength(1);
      expect(managers[0].email).toBe('zone_tunis@smartfiber.tn');
      expect(managers[0].username).toBe('zone_tunis');
      expect(managers[0].zoneName).toBe('Tunis');
    });

    it('should resolve zoneName when zoneId is an ISO code like TN-41 (Kairouan)', async () => {
      const kairouanZone = {
        _id: '64b000000000000000000041',
        name: 'Kairouan',
        isActive: true,
      };
      mockZoneModel.find.mockReturnValue({
        exec: jest.fn().mockResolvedValue([mockZoneDoc, kairouanZone]),
      });
      const userWithIsoCode = {
        _id: '64b000000000000000000042',
        username: 'zone_kairouan',
        email: 'zone_kairouan@smartfiber.tn',
        password: 'hashed_password',
        role: AppRole.RESPONSABLE_ZONE,
        zoneId: 'TN-41',
        isActive: true,
      };
      mockUserModel.find.mockReturnValue({
        select: jest.fn().mockResolvedValue([userWithIsoCode]),
      });

      const managers = await service.findZoneManagers();
      expect(managers).toHaveLength(1);
      expect(managers[0].zoneId).toBe('TN-41');
      expect(managers[0].zoneName).toBe('Kairouan');
    });

    it('should return all users including email and language fallback', async () => {
      mockUserModel.find.mockReturnValue({
        select: jest.fn().mockResolvedValue([mockUserDoc]),
      });

      const users = await service.findAll();
      expect(users).toHaveLength(1);
      expect(users[0].email).toBe('zone_tunis@smartfiber.tn');
      expect(users[0].language).toBe('fr');
    });
  });

  describe('updateLanguage & getProfile', () => {
    it('should successfully update language to "en"', async () => {
      const user = {
        _id: '64b000000000000000000002',
        language: 'fr',
        role: AppRole.ADMIN,
        save: jest.fn().mockResolvedValue(true),
      };
      mockUserModel.findById.mockResolvedValue(user);

      const result = await service.updateLanguage('64b000000000000000000002', 'en');
      expect(user.language).toBe('en');
      expect(user.save).toHaveBeenCalled();
      expect(result).toEqual({ language: 'en' });
    });

    it('should successfully update language to "ar"', async () => {
      const user = {
        _id: '64b000000000000000000002',
        language: 'fr',
        role: AppRole.RESPONSABLE_ZONE,
        save: jest.fn().mockResolvedValue(true),
      };
      mockUserModel.findById.mockResolvedValue(user);

      const result = await service.updateLanguage('64b000000000000000000002', 'ar');
      expect(user.language).toBe('ar');
      expect(user.save).toHaveBeenCalled();
      expect(result).toEqual({ language: 'ar' });
    });

    it('should throw NotFoundException if user is not found during language update', async () => {
      mockUserModel.findById.mockResolvedValue(null);

      await expect(service.updateLanguage('unknown-id', 'en')).rejects.toThrow(NotFoundException);
    });

    it('should retrieve profile with fallback to "fr" when language is not set', async () => {
      const userWithoutLang = {
        _id: '64b000000000000000000002',
        username: 'admin',
        email: 'admin@smartfiber.tn',
        role: AppRole.ADMIN,
        isActive: true,
      };
      mockUserModel.findById.mockResolvedValue(userWithoutLang);

      const profile = await service.getProfile('64b000000000000000000002');
      expect(profile.username).toBe('admin');
      expect(profile.language).toBe('fr');
    });
  });

  describe('validatePassword', () => {
    it('should validate plain password against hashed password', async () => {
      const plain = 'password123';
      const hash = await bcrypt.hash(plain, 10);
      const isValid = await service.validatePassword(plain, hash);
      expect(isValid).toBe(true);

      const isInvalid = await service.validatePassword('wrong', hash);
      expect(isInvalid).toBe(false);
    });
  });
});
