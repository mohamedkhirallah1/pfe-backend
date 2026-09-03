import { Injectable, Optional, UnauthorizedException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import * as bcrypt from 'bcrypt';
import { AppRole } from './roles.enum';
import { User } from '../users/schemas/user.schema';
import { MetricsService } from '../../common/metrics/metrics.service';
import { QlogService } from '../../common/qlog/qlog.service';

export interface LoginResponse {
  accessToken: string;
  user: {
    id: string;
    username: string;
    email?: string;
    role: AppRole;
    zoneId?: string;
    language: string;
  };
}

@Injectable()
export class AuthService {
  constructor(
    private readonly jwtService: JwtService,
    @InjectModel(User.name) private userModel: Model<User>,
    private readonly metricsService: MetricsService,
    @Optional() private readonly qlog?: QlogService,
  ) {}

  async login(
    email: string,
    password: string,
    _requestedZoneId?: string,
  ): Promise<LoginResponse> {
    const normalizedEmail = email?.trim().toLowerCase();

    if (!normalizedEmail) {
      this.metricsService.recordAuthAttempt('failure');
      throw new UnauthorizedException('Invalid credentials');
    }

    // Chercher l'utilisateur dans la base de données strictement par email
    const user = await this.userModel.findOne({ email: normalizedEmail });

    if (!user) {
      this.metricsService.recordAuthAttempt('failure');
      this.qlog?.warn(`Authentication failed: user "${normalizedEmail}" not found`, 'AuthService', {
        event: 'authentication_failure',
        reason: 'user_not_found',
        email: normalizedEmail,
      });
      throw new UnauthorizedException('Invalid credentials');
    }

    // Valider le mot de passe
    const isPasswordValid = await bcrypt.compare(password, user.password);

    if (!isPasswordValid) {
      this.metricsService.recordAuthAttempt('failure', user.role);
      this.qlog?.warn(`Authentication failed: invalid password for user "${normalizedEmail}"`, 'AuthService', {
        event: 'authentication_failure',
        reason: 'invalid_password',
        userId: user._id.toString(),
        role: user.role,
      });
      throw new UnauthorizedException('Invalid credentials');
    }

    if (!user.isActive) {
      this.metricsService.recordAuthAttempt('failure', user.role);
      this.qlog?.warn(`Authentication failed: user "${normalizedEmail}" is inactive`, 'AuthService', {
        event: 'authentication_failure',
        reason: 'account_inactive',
        userId: user._id.toString(),
        role: user.role,
      });
      throw new UnauthorizedException('User account is inactive');
    }

    this.metricsService.recordAuthAttempt('success', user.role);
    const effectiveZoneId =
      user.role === AppRole.RESPONSABLE_ZONE ? user.zoneId : undefined;

    this.qlog?.info(`User "${user.email ?? user.username}" authenticated successfully`, 'AuthService', {
      event: 'authentication_success',
      userId: user._id.toString(),
      role: user.role,
      zoneId: effectiveZoneId,
    });

    // JWT Payload contains: sub, email, role, zoneId
    const payload = {
      sub: user._id.toString(),
      email: user.email,
      role: user.role,
      zoneId: effectiveZoneId,
    };

    const accessToken = await this.jwtService.signAsync(payload);

    return {
      accessToken,
      user: {
        id: user._id.toString(),
        username: user.username,
        email: user.email,
        role: user.role,
        zoneId: effectiveZoneId,
        language: user.language ?? 'fr',
      },
    };
  }
}
