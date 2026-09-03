import { ForbiddenException } from '@nestjs/common';
import { AppRole } from '../../auth/roles.enum';

export type AiScope = { scope: 'GLOBAL' } | { scope: 'ZONE'; zoneId: string };

export type AiRequestUser = { role: AppRole; zoneId?: string };

/**
 * Single source of truth for "what part of the AI Supervisor's data can this user see".
 * ADMIN gets GLOBAL (no zoneId filter); RESPONSABLE_ZONE is pinned to their own zoneId,
 * always taken from the JWT (`user.zoneId`), never from anything client-supplied. Every
 * AI endpoint/service must derive its filtering from this instead of re-implementing the
 * `role === RESPONSABLE_ZONE` check inline.
 */
export function resolveAiScope(user: AiRequestUser): AiScope {
  if (user.role === AppRole.ADMIN) {
    return { scope: 'GLOBAL' };
  }
  if (!user.zoneId) {
    throw new ForbiddenException('No zone assigned to this account');
  }
  return { scope: 'ZONE', zoneId: user.zoneId };
}

/**
 * For endpoints/logic parameterized by a target zone id (e.g. "give me zone X's report"):
 * ADMIN may request any zone (or none, for global); RESPONSABLE_ZONE may only ever request
 * their own zoneId — any other value, or attempting a global (undefined) request, is refused
 * with a 403, never silently narrowed or emptied.
 */
export function assertZoneAccess(user: AiRequestUser, requestedZoneId: string | null | undefined): void {
  if (user.role === AppRole.ADMIN) {
    return;
  }
  if (!user.zoneId || requestedZoneId !== user.zoneId) {
    throw new ForbiddenException('You are not authorized to access this zone');
  }
}

/** Convenience: the zoneId to actually filter data by, or undefined for an unfiltered/global read. */
export function scopeZoneId(scope: AiScope): string | undefined {
  return scope.scope === 'ZONE' ? scope.zoneId : undefined;
}
