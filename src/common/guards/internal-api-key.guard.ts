import { CanActivate, ExecutionContext, Injectable, Logger, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Request } from 'express';

import { timingSafeEqual } from 'crypto';

/**
 * Guards the external-system webhook endpoints (/api/events, /api/contract/*, /api/nro/*,
 * /api/reclamation/*). These are called by an upstream system-to-system integration, not by a
 * logged-in user, so a shared API key (not JWT) is the right trust boundary here.
 *
 * Fails closed: if EVENTS_API_KEY isn't configured, every request is rejected rather than
 * silently accepted (this endpoint used to have no protection at all).
 */
@Injectable()
export class InternalApiKeyGuard implements CanActivate {
  private readonly logger = new Logger(InternalApiKeyGuard.name);

  constructor(private readonly configService: ConfigService) {}

  canActivate(context: ExecutionContext): boolean {
    const expectedKey = this.configService.get<string>('EVENTS_API_KEY');

    if (!expectedKey) {
      this.logger.error(
        'EVENTS_API_KEY is not configured: rejecting inbound event requests until it is set',
      );
      throw new UnauthorizedException('Event ingestion is not configured');
    }

    const request = context.switchToHttp().getRequest<Request>();
    const providedKey = request.headers['x-api-key'];

    if (typeof providedKey !== 'string') {
      throw new UnauthorizedException('Invalid or missing API key');
    }

    const providedBuf = Buffer.from(providedKey);
    const expectedBuf = Buffer.from(expectedKey);

    if (
      providedBuf.length !== expectedBuf.length ||
      !timingSafeEqual(providedBuf, expectedBuf)
    ) {
      throw new UnauthorizedException('Invalid or missing API key');
    }

    return true;
  }
}
