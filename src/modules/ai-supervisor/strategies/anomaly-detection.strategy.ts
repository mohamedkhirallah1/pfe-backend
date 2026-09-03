import { ANOMALY_MODEL_VERSION, AnomalyAssessment, AnomalyEvidenceInput, AnomalyFactor, AnomalySeverity, AnomalyEvaluationStatus, AnomalyType } from '../types/anomaly.types';
import { ANOMALY_THRESHOLDS } from './anomaly-thresholds.constant';

type SeriesStats = {
  mean: number;
  stdDev: number;
  count: number;
  spanHours: number;
  slope: number;
  acceleration: number;
  growthRate: number;
};

const HOURS = 60 * 60 * 1000;

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

function mean(values: number[]): number {
  if (values.length === 0) return 0;
  return values.reduce((sum, value) => sum + value, 0) / values.length;
}

function stdDev(values: number[]): number {
  if (values.length < 2) return 0;
  const avg = mean(values);
  const variance = mean(values.map((value) => (value - avg) ** 2));
  return Math.sqrt(variance);
}

function slope(points: Array<{ timestampMs: number; value: number }>): number {
  if (points.length < 2) return 0;
  const sorted = [...points].sort((a, b) => a.timestampMs - b.timestampMs);
  const t0 = sorted[0].timestampMs;
  const xs = sorted.map((point) => (point.timestampMs - t0) / HOURS);
  const ys = sorted.map((point) => point.value);
  const meanX = mean(xs);
  const meanY = mean(ys);
  let numerator = 0;
  let denominator = 0;
  for (let index = 0; index < xs.length; index++) {
    numerator += (xs[index] - meanX) * (ys[index] - meanY);
    denominator += (xs[index] - meanX) ** 2;
  }
  return denominator === 0 ? 0 : numerator / denominator;
}

function growthRate(previousMean: number, currentMean: number): number {
  if (previousMean === 0) {
    return currentMean > 0 ? 100 : 0;
  }
  return ((currentMean - previousMean) / Math.abs(previousMean)) * 100;
}

function severityFromScore(score: number): AnomalySeverity {
  if (score >= 80) return AnomalySeverity.CRITICAL;
  if (score >= 60) return AnomalySeverity.HIGH;
  if (score >= 40) return AnomalySeverity.MEDIUM;
  if (score >= 20) return AnomalySeverity.LOW;
  return AnomalySeverity.NORMAL;
}

function impactFromContribution(value: number, low: number, medium: number, high: number): AnomalyFactor['impact'] {
  if (Math.abs(value) >= high) return 'HIGH';
  if (Math.abs(value) >= medium) return 'MEDIUM';
  if (Math.abs(value) >= low) return 'LOW';
  return 'LOW';
}

function bucketType(types: AnomalyType[]): AnomalyType {
  if (types.length === 0) return AnomalyType.NETWORK_BEHAVIOR_CHANGE;
  if (types.includes(AnomalyType.MULTI_SIGNAL_ANOMALY)) return AnomalyType.MULTI_SIGNAL_ANOMALY;
  if (types.includes(AnomalyType.SATURATION_SPIKE)) return AnomalyType.SATURATION_SPIKE;
  if (types.includes(AnomalyType.SATURATION_ACCELERATION)) return AnomalyType.SATURATION_ACCELERATION;
  if (types.includes(AnomalyType.ABNORMAL_GROWTH)) return AnomalyType.ABNORMAL_GROWTH;
  if (types.includes(AnomalyType.UNUSUAL_OCCUPANCY)) return AnomalyType.UNUSUAL_OCCUPANCY;
  if (types.includes(AnomalyType.COMPLAINT_SPIKE)) return AnomalyType.COMPLAINT_SPIKE;
  return AnomalyType.NETWORK_BEHAVIOR_CHANGE;
}

export function computeAnomalyAssessment(input: AnomalyEvidenceInput): AnomalyAssessment {
  const history = [...input.history].sort((a, b) => a.timestampMs - b.timestampMs);
  const spanHours = history.length > 1 ? (history[history.length - 1].timestampMs - history[0].timestampMs) / HOURS : 0;
  const historyValues = history.map((point) => point.value);
  const baseStats = historyValues.slice(0, -1);
  const recentWindow = historyValues.slice(-ANOMALY_THRESHOLDS.RECENT_WINDOW_POINTS);
  const priorWindow = historyValues.slice(-ANOMALY_THRESHOLDS.RECENT_WINDOW_POINTS * 2, -ANOMALY_THRESHOLDS.RECENT_WINDOW_POINTS);

  if (history.length < ANOMALY_THRESHOLDS.MIN_SERIES_POINTS || spanHours < ANOMALY_THRESHOLDS.MIN_HOURS_SPAN) {
    return {
      status: AnomalyEvaluationStatus.INSUFFICIENT_DATA,
      severity: AnomalySeverity.NORMAL,
      anomalyScore: 0,
      confidenceScore: 0.1,
      anomalyType: AnomalyType.NETWORK_BEHAVIOR_CHANGE,
      anomalyTypes: [],
      currentValue: input.currentValue,
      historicalMean: mean(baseStats.length > 0 ? baseStats : historyValues),
      historicalStdDev: stdDev(baseStats.length > 0 ? baseStats : historyValues),
      deviation: 0,
      growthRate: 0,
      acceleration: 0,
      factors: [],
      insufficientDataReason: `Historique insuffisant (${history.length} point(s), ${spanHours.toFixed(1)}h couverte(s)).`,
      modelVersion: ANOMALY_MODEL_VERSION,
    };
  }

  const historicalMean = mean(baseStats.length > 0 ? baseStats : historyValues);
  const historicalStdDev = stdDev(baseStats.length > 0 ? baseStats : historyValues);
  const deviation = input.currentValue - historicalMean;
  const directionalDeviation = input.worseningDirection * deviation;
  const zScore = historicalStdDev > 0 ? directionalDeviation / historicalStdDev : directionalDeviation > 0 ? 4 : 0;

  const recentMean = mean(recentWindow.length > 0 ? recentWindow : historyValues);
  const priorMean = mean(priorWindow.length > 0 ? priorWindow : baseStats.length > 0 ? baseStats : historyValues);
  const growthPct = growthRate(priorMean, recentMean) * input.worseningDirection;

  const recentSlope = slope(history.slice(-ANOMALY_THRESHOLDS.RECENT_WINDOW_POINTS));
  const priorSlope = slope(history.slice(-ANOMALY_THRESHOLDS.RECENT_WINDOW_POINTS * 2, -ANOMALY_THRESHOLDS.RECENT_WINDOW_POINTS));
  const acceleration = (recentSlope - priorSlope) * input.worseningDirection;

  const complaintGrowth = typeof input.complaintCurrentCount === 'number' && typeof input.complaintPreviousCount === 'number'
    ? growthRate(input.complaintPreviousCount, input.complaintCurrentCount)
    : 0;

  const contractGrowth = typeof input.contractCurrentCount === 'number' && typeof input.contractPreviousCount === 'number'
    ? growthRate(input.contractPreviousCount, input.contractCurrentCount)
    : 0;

  const anomalyTypes: AnomalyType[] = [];
  const warningBreached = input.warningThreshold !== undefined
    ? input.worseningDirection === 1
      ? input.currentValue >= input.warningThreshold
      : input.currentValue <= input.warningThreshold
    : false;
  const criticalBreached = input.criticalThreshold !== undefined
    ? input.worseningDirection === 1
      ? input.currentValue >= input.criticalThreshold
      : input.currentValue <= input.criticalThreshold
    : false;

  if (zScore >= ANOMALY_THRESHOLDS.ZSCORE_HIGH && directionalDeviation > 0 && criticalBreached) {
    anomalyTypes.push(AnomalyType.SATURATION_SPIKE);
  }
  if (acceleration >= ANOMALY_THRESHOLDS.ACCELERATION_MEDIUM) {
    anomalyTypes.push(AnomalyType.SATURATION_ACCELERATION);
  }
  if (growthPct >= ANOMALY_THRESHOLDS.GROWTH_MEDIUM) {
    anomalyTypes.push(AnomalyType.ABNORMAL_GROWTH);
  }
  if (Math.abs(zScore) >= ANOMALY_THRESHOLDS.ZSCORE_MEDIUM && directionalDeviation > 0) {
    anomalyTypes.push(AnomalyType.UNUSUAL_OCCUPANCY);
  }
  if (complaintGrowth >= ANOMALY_THRESHOLDS.COMPLAINT_GROWTH_MEDIUM) {
    anomalyTypes.push(AnomalyType.COMPLAINT_SPIKE);
  }

  const signalCount = anomalyTypes.length;
  if (signalCount >= 2) {
    anomalyTypes.push(AnomalyType.MULTI_SIGNAL_ANOMALY);
  }

  const thresholdScore = criticalBreached
    ? 22
    : warningBreached
      ? 12
      : 0;
  const zScoreScore = clamp(Math.max(0, zScore) * 12, 0, 40);
  const growthScore = clamp(Math.max(0, growthPct) * 0.9, 0, 20);
  const accelerationScore = clamp(Math.max(0, acceleration) * 1.1, 0, 15);
  const complaintScore = clamp(Math.max(0, complaintGrowth) * 0.4, 0, 12);
  const contractScore = clamp(Math.max(0, contractGrowth) * 0.25, 0, 8);
  const multiSignalBonus = signalCount >= 2 ? 8 : 0;
  const anomalyScore = Math.round(clamp(zScoreScore + growthScore + accelerationScore + thresholdScore + complaintScore + contractScore + multiSignalBonus, 0, 100));

  const dataQuality = clamp(history.length / 18, 0, 1) * 0.6 + clamp(spanHours / 24, 0, 1) * 0.2 + clamp(historicalStdDev > 0 ? 1 / (1 + historicalStdDev / 20) : 1, 0, 1) * 0.2;
  const evidenceStrength = clamp(anomalyScore / 100, 0, 1);
  const confidenceScore = Math.round(clamp(dataQuality * 0.55 + evidenceStrength * 0.45, 0, 1) * 100) / 100;

  const factors: AnomalyFactor[] = [];
  if (zScore >= ANOMALY_THRESHOLDS.ZSCORE_LOW) {
    factors.push({ feature: 'deviationFromHistoricalMean', impact: impactFromContribution(zScore, 1.5, 2, 3), value: Number(zScore.toFixed(2)), note: 'Ecart statistique par rapport au comportement historique' });
  }
  if (growthPct >= ANOMALY_THRESHOLDS.GROWTH_LOW) {
    factors.push({ feature: 'growthRate', impact: impactFromContribution(growthPct, 6, 12, 20), value: Number(growthPct.toFixed(2)), note: 'Variation recente de la courbe' });
  }
  if (acceleration >= ANOMALY_THRESHOLDS.ACCELERATION_LOW) {
    factors.push({ feature: 'acceleration', impact: impactFromContribution(acceleration, 4, 8, 15), value: Number(acceleration.toFixed(2)), note: 'Changement de pente accelere' });
  }
  if (complaintGrowth >= ANOMALY_THRESHOLDS.COMPLAINT_GROWTH_LOW) {
    factors.push({ feature: 'complaintGrowth', impact: impactFromContribution(complaintGrowth, 10, 25, 50), value: Number(complaintGrowth.toFixed(2)), note: 'Evolution des reclamations associees' });
  }
  if (contractGrowth >= ANOMALY_THRESHOLDS.CONTRACT_GROWTH_LOW) {
    factors.push({ feature: 'contractGrowth', impact: impactFromContribution(contractGrowth, 5, 10, 20), value: Number(contractGrowth.toFixed(2)), note: 'Croissance des contrats observee' });
  }

  const severity = severityFromScore(anomalyScore);
  const anomalyType = bucketType(anomalyTypes);
  const status = anomalyScore >= 20 ? AnomalyEvaluationStatus.DETECTED : AnomalyEvaluationStatus.NORMAL;

  return {
    status,
    severity,
    anomalyScore,
    confidenceScore,
    anomalyType,
    anomalyTypes,
    currentValue: input.currentValue,
    historicalMean: Math.round(historicalMean * 100) / 100,
    historicalStdDev: Math.round(historicalStdDev * 100) / 100,
    deviation: Math.round(deviation * 100) / 100,
    growthRate: Math.round(growthPct * 100) / 100,
    acceleration: Math.round(acceleration * 100) / 100,
    factors,
    modelVersion: ANOMALY_MODEL_VERSION,
  };
}
