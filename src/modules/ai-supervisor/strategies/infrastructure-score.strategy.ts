/**
 * Deterministic scoring for a candidate new-NRO/new-FDT location — Groq never computes this
 * (see infrastructure-planner.agent.ts). Weights are the ones specified for this feature;
 * documented here so they're the single place to tune if the business wants different priorities.
 */
export const CANDIDATE_SCORE_WEIGHTS = {
  contractCoverage: 0.3,
  saturationReduction: 0.25,
  geographicDensity: 0.15,
  proximityToContracts: 0.1,
  distanceFromExistingInfrastructure: 0.1,
  topologyCompatibility: 0.1,
} as const;

export type CandidateScoreInputs = {
  /** Fraction (0-1) of the source's total contracts this candidate would absorb. */
  contractCoverage: number;
  /** Fraction (0-1) improvement in saturation this candidate's scenario achieves (from SimulationService). */
  saturationReduction: number;
  /** Fraction (0-1): this cluster's density relative to the densest candidate considered alongside it. */
  geographicDensity: number;
  /** Fraction (0-1): how tight the cluster is (inverse of average intra-cluster distance, normalized). */
  proximityToContracts: number;
  /** Fraction (0-1): distance from existing infrastructure, normalized against a reasonable max. */
  distanceFromExistingInfrastructure: number;
  /** Fraction (0-1): how well the candidate fits the existing Centrale/topology (distance-to-centrale based). */
  topologyCompatibility: number;
};

/** Every input must already be normalized to [0,1] — this function only applies the weights. */
export function computeCandidateScore(inputs: CandidateScoreInputs): number {
  const clamp01 = (v: number) => Math.max(0, Math.min(1, v));

  const weighted =
    clamp01(inputs.contractCoverage) * CANDIDATE_SCORE_WEIGHTS.contractCoverage +
    clamp01(inputs.saturationReduction) * CANDIDATE_SCORE_WEIGHTS.saturationReduction +
    clamp01(inputs.geographicDensity) * CANDIDATE_SCORE_WEIGHTS.geographicDensity +
    clamp01(inputs.proximityToContracts) * CANDIDATE_SCORE_WEIGHTS.proximityToContracts +
    clamp01(inputs.distanceFromExistingInfrastructure) * CANDIDATE_SCORE_WEIGHTS.distanceFromExistingInfrastructure +
    clamp01(inputs.topologyCompatibility) * CANDIDATE_SCORE_WEIGHTS.topologyCompatibility;

  return Math.round(weighted * 100);
}
