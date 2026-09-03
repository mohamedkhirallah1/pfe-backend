import { Test, TestingModule } from '@nestjs/testing';
import { getModelToken } from '@nestjs/mongoose';
import { JwtService } from '@nestjs/jwt';
import { UnauthorizedException } from '@nestjs/common';
import * as bcrypt from 'bcrypt';
import { AuthService } from './auth.service';
import { User } from '../users/schemas/user.schema';
import { AppRole } from './roles.enum';
import { MetricsService } from '../../common/metrics/metrics.service';
import { QlogService } from '../../common/qlog/qlog.service';

describe('AuthService', () => {
  let authService: AuthService;
  let mockUserModel: any;
  let mockJwtService: any;
  let mockMetricsService: any;
  let mockQlogService: any;

  const adminUser = {
    _id: { toString: () => '64b000000000000000000001' },
    username: 'admin',
    email: 'admin@smartfiber.tn',
    password: '$2b$10$hashedAdminPassword',
    role: AppRole.ADMIN,
    isActive: true,
  };

  const zoneManagerUser = {
    _id: { toString: () => '64b000000000000000000002' },
    username: 'zone_tunis',
    email: 'zone_tunis@smartfiber.tn',
    password: '$2b$10$hashedZonePassword',
    role: AppRole.RESPONSABLE_ZONE,
    zoneId: '64b000000000000000000099',
    isActive: true,
  };

  const inactiveUser = {
    _id: { toString: () => '64b000000000000000000003' },
    username: 'inactive_user',
    email: 'inactive@smartfiber.tn',
    password: '$2b$10$hashedInactivePassword',
    role: AppRole.ADMIN,
    isActive: false,
  };

  beforeEach(async () => {
    mockUserModel = {
      findOne: jest.fn(),
    };

    mockJwtService = {
      signAsync: jest.fn().mockResolvedValue('mocked.jwt.token'),
    };

    mockMetricsService = {
      recordAuthAttempt: jest.fn(),
    };

    mockQlogService = {
      info: jest.fn(),
      warn: jest.fn(),
      error: jest.fn(),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        AuthService,
        { provide: getModelToken(User.name), useValue: mockUserModel },
        { provide: JwtService, useValue: mockJwtService },
        { provide: MetricsService, useValue: mockMetricsService },
        { provide: QlogService, useValue: mockQlogService },
      ],
    }).compile();

    authService = module.get<AuthService>(AuthService);
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  describe('login with email + password', () => {
    it('should successfully log in an ADMIN with valid email and password', async () => {
      mockUserModel.findOne.mockResolvedValue(adminUser);
      jest.spyOn(bcrypt, 'compare').mockImplementation(async () => true);

      const result = await authService.login('admin@smartfiber.tn', 'admin1234');

      expect(mockUserModel.findOne).toHaveBeenCalledWith({ email: 'admin@smartfiber.tn' });
      expect(mockJwtService.signAsync).toHaveBeenCalledWith({
        sub: '64b000000000000000000001',
        email: 'admin@smartfiber.tn',
        role: AppRole.ADMIN,
        zoneId: undefined,
      });
      expect(result).toEqual({
        accessToken: 'mocked.jwt.token',
        user: {
          id: '64b000000000000000000001',
          username: 'admin',
          email: 'admin@smartfiber.tn',
          role: AppRole.ADMIN,
          zoneId: undefined,
          language: 'fr',
        },
      });
      expect(mockMetricsService.recordAuthAttempt).toHaveBeenCalledWith('success', AppRole.ADMIN);
    });

    it('should successfully log in a RESPONSABLE_ZONE with valid email, password, and preserve zoneId', async () => {
      mockUserModel.findOne.mockResolvedValue(zoneManagerUser);
      jest.spyOn(bcrypt, 'compare').mockImplementation(async () => true);

      const result = await authService.login('zone_tunis@smartfiber.tn', 'zone1234');

      expect(mockUserModel.findOne).toHaveBeenCalledWith({ email: 'zone_tunis@smartfiber.tn' });
      expect(mockJwtService.signAsync).toHaveBeenCalledWith({
        sub: '64b000000000000000000002',
        email: 'zone_tunis@smartfiber.tn',
        role: AppRole.RESPONSABLE_ZONE,
        zoneId: '64b000000000000000000099',
      });
      expect(result).toEqual({
        accessToken: 'mocked.jwt.token',
        user: {
          id: '64b000000000000000000002',
          username: 'zone_tunis',
          email: 'zone_tunis@smartfiber.tn',
          role: AppRole.RESPONSABLE_ZONE,
          zoneId: '64b000000000000000000099',
          language: 'fr',
        },
      });
      expect(mockMetricsService.recordAuthAttempt).toHaveBeenCalledWith('success', AppRole.RESPONSABLE_ZONE);
    });

    it('should successfully log in a SERVICE_CLIENT with valid email and password', async () => {
      const serviceClientUser = {
        _id: '64b000000000000000000003',
        username: 'service_client',
        email: 'serviceclient@smartfiber.tn',
        password: '$2b$10$hashedServicePassword',
        role: AppRole.SERVICE_CLIENT,
        isActive: true,
        language: 'fr',
      };
      mockUserModel.findOne.mockResolvedValue(serviceClientUser);
      jest.spyOn(bcrypt, 'compare').mockImplementation(async () => true);

      const result = await authService.login('serviceclient@smartfiber.tn', 'service1234');

      expect(mockUserModel.findOne).toHaveBeenCalledWith({ email: 'serviceclient@smartfiber.tn' });
      expect(mockJwtService.signAsync).toHaveBeenCalledWith({
        sub: '64b000000000000000000003',
        email: 'serviceclient@smartfiber.tn',
        role: AppRole.SERVICE_CLIENT,
        zoneId: undefined,
      });
      expect(result).toEqual({
        accessToken: 'mocked.jwt.token',
        user: {
          id: '64b000000000000000000003',
          username: 'service_client',
          email: 'serviceclient@smartfiber.tn',
          role: AppRole.SERVICE_CLIENT,
          zoneId: undefined,
          language: 'fr',
        },
      });
      expect(mockMetricsService.recordAuthAttempt).toHaveBeenCalledWith('success', AppRole.SERVICE_CLIENT);
    });

    it('should normalize email with uppercase letters and spaces', async () => {
      mockUserModel.findOne.mockResolvedValue(adminUser);
      jest.spyOn(bcrypt, 'compare').mockImplementation(async () => true);

      const result = await authService.login('   Admin@SmartFiber.TN   ', 'admin1234');

      expect(mockUserModel.findOne).toHaveBeenCalledWith({ email: 'admin@smartfiber.tn' });
      expect(result.accessToken).toBe('mocked.jwt.token');
    });

    it('should throw UnauthorizedException when email does not exist', async () => {
      mockUserModel.findOne.mockResolvedValue(null);

      await expect(authService.login('unknown@smartfiber.tn', 'anyPassword')).rejects.toThrow(
        UnauthorizedException,
      );
      expect(mockMetricsService.recordAuthAttempt).toHaveBeenCalledWith('failure');
      expect(mockQlogService.warn).toHaveBeenCalledWith(
        expect.stringContaining('not found'),
        'AuthService',
        expect.objectContaining({ event: 'authentication_failure', reason: 'user_not_found' }),
      );
    });

    it('should throw UnauthorizedException when password is wrong', async () => {
      mockUserModel.findOne.mockResolvedValue(adminUser);
      jest.spyOn(bcrypt, 'compare').mockImplementation(async () => false);

      await expect(authService.login('admin@smartfiber.tn', 'wrongPassword')).rejects.toThrow(
        UnauthorizedException,
      );
      expect(mockMetricsService.recordAuthAttempt).toHaveBeenCalledWith('failure', AppRole.ADMIN);
      expect(mockQlogService.warn).toHaveBeenCalledWith(
        expect.stringContaining('invalid password'),
        'AuthService',
        expect.objectContaining({ event: 'authentication_failure', reason: 'invalid_password' }),
      );
    });

    it('should throw UnauthorizedException when account is inactive', async () => {
      mockUserModel.findOne.mockResolvedValue(inactiveUser);
      jest.spyOn(bcrypt, 'compare').mockImplementation(async () => true);

      await expect(authService.login('inactive@smartfiber.tn', 'inactivePassword')).rejects.toThrow(
        UnauthorizedException,
      );
      expect(mockMetricsService.recordAuthAttempt).toHaveBeenCalledWith('failure', AppRole.ADMIN);
      expect(mockQlogService.warn).toHaveBeenCalledWith(
        expect.stringContaining('inactive'),
        'AuthService',
        expect.objectContaining({ event: 'authentication_failure', reason: 'account_inactive' }),
      );
    });
  });
});
