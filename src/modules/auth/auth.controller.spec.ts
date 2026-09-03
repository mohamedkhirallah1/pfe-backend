import { Test, TestingModule } from '@nestjs/testing';
import { AuthController } from './auth.controller';
import { AuthService } from './auth.service';
import { AppRole } from './roles.enum';

describe('AuthController', () => {
  let controller: AuthController;
  let mockAuthService: any;

  beforeEach(async () => {
    mockAuthService = {
      login: jest.fn().mockResolvedValue({
        accessToken: 'jwt-token',
        user: {
          id: 'user-1',
          username: 'admin',
          email: 'admin@smartfiber.tn',
          role: AppRole.ADMIN,
        },
      }),
    };

    const module: TestingModule = await Test.createTestingModule({
      controllers: [AuthController],
      providers: [{ provide: AuthService, useValue: mockAuthService }],
    }).compile();

    controller = module.get<AuthController>(AuthController);
  });

  it('should be defined', () => {
    expect(controller).toBeDefined();
  });

  it('should delegate login to AuthService with email, password, and zoneId', async () => {
    const loginDto = {
      email: 'admin@smartfiber.tn',
      password: 'password123',
      zoneId: 'zone-1',
    };

    const result = await controller.login(loginDto);

    expect(mockAuthService.login).toHaveBeenCalledWith(
      'admin@smartfiber.tn',
      'password123',
      'zone-1',
    );
    expect(result).toEqual({
      accessToken: 'jwt-token',
      user: {
        id: 'user-1',
        username: 'admin',
        email: 'admin@smartfiber.tn',
        role: AppRole.ADMIN,
      },
    });
  });
});
