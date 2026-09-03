import { RiskLevel } from '../interfaces/analysis.types';

export type ZoneHealthMetrics = {
  nroAvgSaturationPct: number;
  nroSaturatedCount: number;
  nroTotalCount: number;
  fdtAvgOccupationPct: number;
  fdtSaturatedCount: number;
  fdtTotalCount: number;
  complaintRatePer100Contracts: number;
  topologyIssueCount: number;
};

export type HealthScoreResult = {
  score: number;
  risk: RiskLevel;
  factors: Record<string, number>;
};

/**
 * Deterministic weighted scoring, independent of the LLM, so the number is stable/auditable.
 * The LLM's job is explaining *why* this score came out this way, not computing it.
 * Weights: NRO saturation 30%, FDT saturation 25%, complaint rate 25%, topology health 20%.
 */
export function computeZoneHealthScore(metrics: ZoneHealthMetrics): HealthScoreResult {
  const nroPenalty = Math.min(100, metrics.nroAvgSaturationPct) * 0.3;
  const fdtPenalty = Math.min(100, metrics.fdtAvgOccupationPct) * 0.25;

  // 10+ complaints per 100 active contracts is treated as maximally bad for this factor.
  const complaintPenalty = Math.min(100, (metrics.complaintRatePer100Contracts / 10) * 100) * 0.25;

  // Each topology inconsistency shaves points, capped at the factor's full weight.
  const topologyPenalty = Math.min(100, metrics.topologyIssueCount * 10) * 0.2;

  const totalPenalty = nroPenalty + fdtPenalty + complaintPenalty + topologyPenalty;
  const score = Math.max(0, Math.round(100 - totalPenalty));

  let risk: RiskLevel;
  if (score >= 80) risk = RiskLevel.LOW;
  else if (score >= 60) risk = RiskLevel.MEDIUM;
  else if (score >= 40) risk = RiskLevel.HIGH;
  else risk = RiskLevel.CRITICAL;

  return {
    score,
    risk,
    factors: {
      nroPenalty: Math.round(nroPenalty * 10) / 10,
      fdtPenalty: Math.round(fdtPenalty * 10) / 10,
      complaintPenalty: Math.round(complaintPenalty * 10) / 10,
      topologyPenalty: Math.round(topologyPenalty * 10) / 10,
    },
  };
}

export function computeNetworkScore(zoneScores: number[]): number {
  if (zoneScores.length === 0) {
    return 100;
  }
  return Math.round(zoneScores.reduce((sum, s) => sum + s, 0) / zoneScores.length);
}

export function riskFromScore(score: number): RiskLevel {
  if (score >= 80) return RiskLevel.LOW;
  if (score >= 60) return RiskLevel.MEDIUM;
  if (score >= 40) return RiskLevel.HIGH;
  return RiskLevel.CRITICAL;
}
