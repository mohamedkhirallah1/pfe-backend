import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PassportStrategy } from '@nestjs/passport';
import { ExtractJwt, Strategy } from 'passport-jwt';
import { AppRole } from './roles.enum';
import { getRequiredJwtSecret } from '../../common/config/jwt-secret.util';

type JwtPayload = {
  sub: string;
  email?: string;
  role: AppRole;
  zoneId?: string;
};

@Injectable()
export class JwtStrategy extends PassportStrategy(Strategy) {
  constructor(configService: ConfigService) {
    super({
      jwtFromRequest: ExtractJwt.fromAuthHeaderAsBearerToken(),
      ignoreExpiration: false,
      secretOrKey: getRequiredJwtSecret(configService),
    });
  }

  validate(payload: JwtPayload): JwtPayload {
    return payload;
  }
}
