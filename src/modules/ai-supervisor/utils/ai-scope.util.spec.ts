import { ForbiddenException } from '@nestjs/common';
import { AppRole } from '../../auth/roles.enum';
import { assertZoneAccess, resolveAiScope, scopeZoneId } from './ai-scope.util';

describe('resolveAiScope', () => {
  it('ADMIN resolves to GLOBAL scope regardless of zoneId', () => {
    expect(resolveAiScope({ role: AppRole.ADMIN })).toEqual({ scope: 'GLOBAL' });
    expect(resolveAiScope({ role: AppRole.ADMIN, zoneId: 'zone-A' })).toEqual({ scope: 'GLOBAL' });
  });

  it('RESPONSABLE_ZONE resolves to ZONE scope pinned to their own zoneId', () => {
    expect(resolveAiScope({ role: AppRole.RESPONSABLE_ZONE, zoneId: 'zone-A' })).toEqual({
      scope: 'ZONE',
      zoneId: 'zone-A',
    });
  });

  it('RESPONSABLE_ZONE with no zoneId assigned is refused, not silently treated as global', () => {
    expect(() => resolveAiScope({ role: AppRole.RESPONSABLE_ZONE })).toThrow(ForbiddenException);
  });
});

describe('scopeZoneId', () => {
  it('returns undefined for GLOBAL scope and the zoneId for ZONE scope', () => {
    expect(scopeZoneId({ scope: 'GLOBAL' })).toBeUndefined();
    expect(scopeZoneId({ scope: 'ZONE', zoneId: 'zone-A' })).toBe('zone-A');
  });
});

describe('assertZoneAccess', () => {
  it('ADMIN can access any zone, including undefined/global', () => {
    expect(() => assertZoneAccess({ role: AppRole.ADMIN }, 'zone-A')).not.toThrow();
    expect(() => assertZoneAccess({ role: AppRole.ADMIN }, undefined)).not.toThrow();
    expect(() => assertZoneAccess({ role: AppRole.ADMIN, zoneId: 'zone-B' }, 'zone-A')).not.toThrow();
  });

  it('RESPONSABLE_ZONE can access their own zone', () => {
    expect(() => assertZoneAccess({ role: AppRole.RESPONSABLE_ZONE, zoneId: 'zone-A' }, 'zone-A')).not.toThrow();
  });

  it('RESPONSABLE_ZONE is refused access to a different zone', () => {
    expect(() => assertZoneAccess({ role: AppRole.RESPONSABLE_ZONE, zoneId: 'zone-A' }, 'zone-B')).toThrow(
      ForbiddenException,
    );
  });

  it('RESPONSABLE_ZONE is refused access to the global (undefined) scope', () => {
    expect(() => assertZoneAccess({ role: AppRole.RESPONSABLE_ZONE, zoneId: 'zone-A' }, undefined)).toThrow(
      ForbiddenException,
    );
  });

  it('RESPONSABLE_ZONE with no zoneId assigned is always refused', () => {
    expect(() => assertZoneAccess({ role: AppRole.RESPONSABLE_ZONE }, 'zone-A')).toThrow(ForbiddenException);
  });
});
