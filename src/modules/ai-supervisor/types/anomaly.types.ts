export enum AnomalyEntityType {
  NRO = 'NRO',
  FDT = 'FDT',
  ZONE = 'ZONE',
}

export enum AnomalyType {
  SATURATION_SPIKE = 'SATURATION_SPIKE',
  SATURATION_ACCELERATION = 'SATURATION_ACCELERATION',
  ABNORMAL_GROWTH = 'ABNORMAL_GROWTH',
  UNUSUAL_OCCUPANCY = 'UNUSUAL_OCCUPANCY',
  COMPLAINT_SPIKE = 'COMPLAINT_SPIKE',
  NETWORK_BEHAVIOR_CHANGE = 'NETWORK_BEHAVIOR_CHANGE',
  MULTI_SIGNAL_ANOMALY = 'MULTI_SIGNAL_ANOMALY',
}

export enum AnomalySeverity {
  NORMAL = 'NORMAL',
  LOW = 'LOW',
  MEDIUM = 'MEDIUM',
  HIGH = 'HIGH',
  CRITICAL = 'CRITICAL',
}

export enum AnomalyStatus {
  DETECTED = 'DETECTED',
  ACKNOWLEDGED = 'ACKNOWLEDGED',
  RESOLVED = 'RESOLVED',
  FALSE_POSITIVE = 'FALSE_POSITIVE',
}

export enum AnomalyEvaluationStatus {
  NORMAL = 'NORMAL',
  DETECTED = 'DETECTED',
  INSUFFICIENT_DATA = 'INSUFFICIENT_DATA',
}

export type AnomalyImpact = 'LOW' | 'MEDIUM' | 'HIGH';

export type AnomalyFactor = {
  feature: string;
  impact: AnomalyImpact;
  value: number;
  note?: string;
};

export type AnomalySeriesPoint = {
  timestampMs: number;
  value: number;
};

export type AnomalyEvidenceInput = {
  entityType: AnomalyEntityType;
  entityId: string;
  entityName?: string;
  zoneId?: string;
  history: AnomalySeriesPoint[];
  currentValue: number;
  metricLabel: string;
  worseningDirection: 1 | -1;
  complaintCurrentCount?: number;
  complaintPreviousCount?: number;
  contractCurrentCount?: number;
  contractPreviousCount?: number;
  warningThreshold?: number;
  criticalThreshold?: number;
};

export type AnomalyAssessment = {
  status: AnomalyEvaluationStatus;
  severity: AnomalySeverity;
  anomalyScore: number;
  confidenceScore: number;
  anomalyType: AnomalyType;
  anomalyTypes: AnomalyType[];
  currentValue: number;
  historicalMean: number;
  historicalStdDev: number;
  deviation: number;
  growthRate: number;
  acceleration: number;
  factors: AnomalyFactor[];
  insufficientDataReason?: string;
  modelVersion: string;
};

export type AnomalyExplanationInput = {
  entityType: AnomalyEntityType;
  entityId: string;
  entityName?: string;
  zoneId?: string;
  anomalyType: AnomalyType;
  severity: AnomalySeverity;
  anomalyScore: number;
  confidenceScore: number;
  currentValue: number;
  historicalMean: number;
  historicalStdDev: number;
  deviation: number;
  growthRate: number;
  acceleration: number;
  factors: AnomalyFactor[];
  status: AnomalyEvaluationStatus;
};

export const ANOMALY_MODEL_VERSION = 'stat-v1';
