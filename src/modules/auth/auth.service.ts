import { Injectable, UnauthorizedException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import * as bcrypt from 'bcrypt';
import { AppRole } from './roles.enum';
import { User } from '../users/schemas/user.schema';

@Injectable()
export class AuthService {
  constructor(
    private readonly jwtService: JwtService,
    @InjectModel(User.name) private userModel: Model<User>,
  ) {}

  async login(
    username: string,
    password: string,
    _requestedZoneId?: string,
  ): Promise<{
    accessToken: string;
    user: { id: string; username: string; role: AppRole; zoneId?: string };
  }> {
    // Chercher l'utilisateur dans la base de données
    const user = await this.userModel.findOne({ username });

    if (!user) {
      throw new UnauthorizedException('Invalid credentials');
    }

    // Valider le mot de passe
    const isPasswordValid = await bcrypt.compare(password, user.password);

    if (!isPasswordValid) {
      throw new UnauthorizedException('Invalid credentials');
    }

    if (!user.isActive) {
      throw new UnauthorizedException('User account is inactive');
    }

    // Déterminer la zoneId effective (pour les responsables de zone)
    const effectiveZoneId =
      user.role === AppRole.RESPONSABLE_ZONE ? user.zoneId : undefined;

    const payload = {
      sub: user._id.toString(),
      role: user.role,
      zoneId: effectiveZoneId,
    };

    const accessToken = await this.jwtService.signAsync(payload);

    return {
      accessToken,
      user: {
        id: user._id.toString(),
        username: user.username,
        role: user.role,
        zoneId: effectiveZoneId,
      },
    };
  }
}
