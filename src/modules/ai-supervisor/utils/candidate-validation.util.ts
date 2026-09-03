export type CandidateValidationInput = {
  isInsideZone: boolean;
  /** Distance to the nearest existing infrastructure of the SAME type being proposed (NRO-to-NRO
   *  or FDT-to-FDT depending on caller) — this util is type-agnostic, it only cares about the number. */
  distanceToNearestSameTypeKm: number | null;
  minDistanceToExistingKm: number;
  affectedContracts: number;
  minContracts: number;
};

export type CandidateValidationResult = { valid: true } | { valid: false; reason: string };

/**
 * Pure rejection rules for a geographic candidate — no DB/geo library calls here, those already
 * happened to produce `isInsideZone`/`distanceToNearestSameTypeKm`. Kept separate from
 * InfrastructurePlannerAgent so it's trivially unit-testable without mocking Mongoose models.
 */
export function validateCandidate(input: CandidateValidationInput): CandidateValidationResult {
  if (!input.isInsideZone) {
    return { valid: false, reason: 'Position hors de la zone concernee' };
  }

  if (input.distanceToNearestSameTypeKm !== null && input.distanceToNearestSameTypeKm < input.minDistanceToExistingKm) {
    return {
      valid: false,
      reason: `Trop proche d'une infrastructure existante (${input.distanceToNearestSameTypeKm.toFixed(2)}km < ${input.minDistanceToExistingKm}km)`,
    };
  }

  if (input.affectedContracts < input.minContracts) {
    return { valid: false, reason: `Couverture insuffisante (${input.affectedContracts} contrat(s) < ${input.minContracts})` };
  }

  return { valid: true };
}
