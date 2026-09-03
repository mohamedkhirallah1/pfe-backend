import { validateCandidate } from './candidate-validation.util';

describe('validateCandidate', () => {
  const baseInput = {
    isInsideZone: true,
    distanceToNearestSameTypeKm: 2,
    minDistanceToExistingKm: 0.5,
    affectedContracts: 10,
    minContracts: 5,
  };

  it('accepts a candidate that satisfies every rule', () => {
    expect(validateCandidate(baseInput)).toEqual({ valid: true });
  });

  // Test 10: candidat hors zone -> rejet.
  it('rejects a candidate outside the target zone', () => {
    const result = validateCandidate({ ...baseInput, isInsideZone: false });
    expect(result.valid).toBe(false);
    if (result.valid === false) {
      expect(result.reason).toMatch(/hors de la zone/i);
    }
  });

  // Test 11: candidat trop proche d'une infrastructure existante -> rejet.
  it('rejects a candidate too close to existing infrastructure', () => {
    const result = validateCandidate({ ...baseInput, distanceToNearestSameTypeKm: 0.1 });
    expect(result.valid).toBe(false);
    if (result.valid === false) {
      expect(result.reason).toMatch(/trop proche/i);
    }
  });

  it('accepts a candidate with no existing infrastructure nearby (null distance)', () => {
    expect(validateCandidate({ ...baseInput, distanceToNearestSameTypeKm: null })).toEqual({ valid: true });
  });

  it('rejects a candidate covering too few contracts', () => {
    const result = validateCandidate({ ...baseInput, affectedContracts: 2 });
    expect(result.valid).toBe(false);
    if (result.valid === false) {
      expect(result.reason).toMatch(/couverture insuffisante/i);
    }
  });
});
