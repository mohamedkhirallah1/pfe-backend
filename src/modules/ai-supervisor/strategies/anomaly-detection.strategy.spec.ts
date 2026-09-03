import { computeAnomalyAssessment } from './anomaly-detection.strategy';
import { AnomalyEntityType, AnomalyEvaluationStatus, AnomalySeverity, AnomalyType } from '../types/anomaly.types';

function buildSeries(values: number[], startTime = Date.now() - values.length * 60 * 60 * 1000) {
  return values.map((value, index) => ({ timestampMs: startTime + index * 60 * 60 * 1000, value }));
}

describe('computeAnomalyAssessment', () => {
  it('keeps stable NRO saturation data normal', () => {
    const result = computeAnomalyAssessment({
      entityType: AnomalyEntityType.NRO,
      entityId: 'NRO-1',
      entityName: 'NRO-1',
      history: buildSeries([65, 66, 65.5, 66, 65.8, 66.2, 65.9, 66.1, 66, 65.8, 66.1, 66]),
      currentValue: 66,
      metricLabel: 'saturation',
      worseningDirection: 1,
      warningThreshold: 85,
      criticalThreshold: 90,
    });

    expect(result.status).toBe(AnomalyEvaluationStatus.NORMAL);
    expect(result.anomalyScore).toBeLessThan(20);
    expect(result.severity).toBe(AnomalySeverity.NORMAL);
    expect(result.anomalyTypes).toHaveLength(0);
  });

  it('detects a saturation spike with acceleration', () => {
    const result = computeAnomalyAssessment({
      entityType: AnomalyEntityType.NRO,
      entityId: 'NRO-2',
      entityName: 'NRO-2',
      history: buildSeries([68, 69, 71, 73, 75, 78, 80, 83, 86, 88, 90, 92]),
      currentValue: 92,
      metricLabel: 'saturation',
      worseningDirection: 1,
      complaintCurrentCount: 22,
      complaintPreviousCount: 12,
      contractCurrentCount: 140,
      contractPreviousCount: 120,
      warningThreshold: 85,
      criticalThreshold: 90,
    });

    expect(result.status).toBe(AnomalyEvaluationStatus.DETECTED);
    expect(result.anomalyScore).toBeGreaterThanOrEqual(40);
    expect(result.anomalyTypes).toEqual(expect.arrayContaining([AnomalyType.ABNORMAL_GROWTH, AnomalyType.COMPLAINT_SPIKE]));
    expect(result.confidenceScore).toBeGreaterThan(0.3);
  });

  it('returns insufficient data when the series is too short', () => {
    const result = computeAnomalyAssessment({
      entityType: AnomalyEntityType.FDT,
      entityId: 'FDT-1',
      entityName: 'FDT-1',
      history: buildSeries([48, 49, 50]),
      currentValue: 50,
      metricLabel: 'occupation',
      worseningDirection: 1,
      warningThreshold: 70,
      criticalThreshold: 90,
    });

    expect(result.status).toBe(AnomalyEvaluationStatus.INSUFFICIENT_DATA);
    expect(result.anomalyScore).toBe(0);
    expect(result.insufficientDataReason).toContain('Historique insuffisant');
  });

  it('detects a zone behavior change when health score drops rapidly', () => {
    const result = computeAnomalyAssessment({
      entityType: AnomalyEntityType.ZONE,
      entityId: 'zone-1',
      entityName: 'Zone 1',
      zoneId: 'zone-1',
      history: buildSeries([88, 87, 87, 86, 85, 84, 81, 78, 75, 70, 66, 61]),
      currentValue: 61,
      metricLabel: 'healthScore',
      worseningDirection: -1,
      complaintCurrentCount: 31,
      complaintPreviousCount: 18,
      contractCurrentCount: 220,
      contractPreviousCount: 210,
      warningThreshold: 70,
      criticalThreshold: 45,
    });

    expect(result.status).toBe(AnomalyEvaluationStatus.DETECTED);
    expect(result.anomalyScore).toBeGreaterThanOrEqual(20);
    expect(result.severity).not.toBe(AnomalySeverity.NORMAL);
  });
});
