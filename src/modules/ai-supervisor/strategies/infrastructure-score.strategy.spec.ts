import { CANDIDATE_SCORE_WEIGHTS, computeCandidateScore } from './infrastructure-score.strategy';

describe('computeCandidateScore', () => {
  it('weights sum to 1 (documented percentages actually add up)', () => {
    const total = Object.values(CANDIDATE_SCORE_WEIGHTS).reduce((sum, w) => sum + w, 0);
    expect(total).toBeCloseTo(1, 5);
  });

  it('scores a perfect candidate (all factors at 1) as 100', () => {
    const score = computeCandidateScore({
      contractCoverage: 1,
      saturationReduction: 1,
      geographicDensity: 1,
      proximityToContracts: 1,
      distanceFromExistingInfrastructure: 1,
      topologyCompatibility: 1,
    });
    expect(score).toBe(100);
  });

  it('scores a worthless candidate (all factors at 0) as 0', () => {
    const score = computeCandidateScore({
      contractCoverage: 0,
      saturationReduction: 0,
      geographicDensity: 0,
      proximityToContracts: 0,
      distanceFromExistingInfrastructure: 0,
      topologyCompatibility: 0,
    });
    expect(score).toBe(0);
  });

  it('weighs contractCoverage (30%) more than proximityToContracts (10%)', () => {
    const highCoverage = computeCandidateScore({
      contractCoverage: 1,
      saturationReduction: 0,
      geographicDensity: 0,
      proximityToContracts: 0,
      distanceFromExistingInfrastructure: 0,
      topologyCompatibility: 0,
    });
    const highProximity = computeCandidateScore({
      contractCoverage: 0,
      saturationReduction: 0,
      geographicDensity: 0,
      proximityToContracts: 1,
      distanceFromExistingInfrastructure: 0,
      topologyCompatibility: 0,
    });
    expect(highCoverage).toBeGreaterThan(highProximity);
  });

  it('clamps out-of-range inputs instead of producing an out-of-range score', () => {
    const score = computeCandidateScore({
      contractCoverage: 5, // way above 1
      saturationReduction: -3, // below 0
      geographicDensity: 0.5,
      proximityToContracts: 0.5,
      distanceFromExistingInfrastructure: 0.5,
      topologyCompatibility: 0.5,
    });
    expect(score).toBeGreaterThanOrEqual(0);
    expect(score).toBeLessThanOrEqual(100);
  });
});
