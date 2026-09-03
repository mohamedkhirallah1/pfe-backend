import { ConfigService } from '@nestjs/config';

/**
 * No fallback on purpose: a well-known default secret would let anyone forge
 * valid tokens (including ADMIN ones). Fail startup instead of running insecurely.
 */
export function getRequiredJwtSecret(configService: ConfigService): string {
  const secret = configService.get<string>('JWT_SECRET');

  if (!secret || secret.trim().length === 0) {
    throw new Error(
      'JWT_SECRET environment variable must be set (no insecure default is provided). ' +
        'Set a strong random value before starting the application.',
    );
  }

  return secret;
}
