export enum RiskLevel {
  LOW = 'LOW',
  MEDIUM = 'MEDIUM',
  HIGH = 'HIGH',
  CRITICAL = 'CRITICAL',
}

export enum Priority {
  LOW = 'LOW',
  MEDIUM = 'MEDIUM',
  HIGH = 'HIGH',
  URGENT = 'URGENT',
}

export enum RecommendationAction {
  CREATE_NRO = 'CREATE_NRO',
  CREATE_FDT = 'CREATE_FDT',
  SPLIT_ZONE = 'SPLIT_ZONE',
  MOVE_CONTRACTS = 'MOVE_CONTRACTS',
  INCREASE_CAPACITY = 'INCREASE_CAPACITY',
  DEPLOY_EQUIPMENT = 'DEPLOY_EQUIPMENT',
  INVESTIGATE = 'INVESTIGATE',
  ADMIN_REVIEW = 'ADMIN_REVIEW',
}

export enum AlertSource {
  NRO_SATURATION = 'NRO_SATURATION',
  FDT_SATURATION = 'FDT_SATURATION',
  COMPLAINT_SPIKE = 'COMPLAINT_SPIKE',
  TOPOLOGY = 'TOPOLOGY',
  APP_HEALTH = 'APP_HEALTH',
}

export type InfrastructureType = 'NRO' | 'FDT';

export type InfrastructureCandidate = {
  latitude: number;
  longitude: number;
  score: number; // 0-100, see strategies/infrastructure-score.strategy.ts
  affectedContracts: number;
  estimatedCoverage: number; // fraction 0-1 of the source's contracts this candidate would absorb
  /** Distance to the nearest EXISTING NRO — set for NRO candidates only (undefined for FDT candidates). */
  distanceToExistingNroKm?: number | null;
  /** Distance to the nearest EXISTING FDT (sibling under the same NRO) — set for FDT candidates only. */
  distanceToNearestFdtKm?: number | null;
  distanceToCentralKm: number | null;
  densityScore: number; // 0-1
  saturationReductionPct: number;
  reason: string;
};

export type InfrastructureProposalAnalysis = {
  currentSaturation: number;
  predicted30Days?: number;
  predicted60Days?: number;
  predicted90Days?: number;
};

export type InfrastructureProposalSimulation = {
  before: number;
  after: number;
  improvementPct: number;
  affectedContracts: number;
};

export type Recommendation = {
  action: RecommendationAction;
  title: string;
  reason: string;
  expectedImpact: string;
  priority: Priority;
  confidence: number; // 0-1
  affectedArea: string; // zone name / entity id
  zoneId?: string;
  estimatedDifficulty: 'LOW' | 'MEDIUM' | 'HIGH';
  businessImpact?: string;
  technicalImpact?: string;
  risk?: string;
  estimatedCost?: string;
  estimatedEffort?: string;
  alternatives?: string[];
  /** Quantified before/after from the Simulation Engine, e.g. "95% -> 78% occupation". Absent
   *  when no simulation applies to this recommendation's action. */
  expectedImprovement?: string;

  // ---- Infrastructure proposal fields (InfrastructurePlannerAgent) — all optional, additive:
  // a plain zone/topology/complaint recommendation never sets these. ----
  type?: 'INFRASTRUCTURE_PROPOSAL';
  infrastructureType?: InfrastructureType;
  centraleId?: string;
  sourceInfrastructureId?: string; // externalId of the saturated NRO/FDT this proposal addresses
  recommendedLocation?: { latitude: number; longitude: number };
  locationScore?: number;
  analysis?: InfrastructureProposalAnalysis;
  simulation?: InfrastructureProposalSimulation;
  candidates?: InfrastructureCandidate[];
  source?: 'groq' | 'deterministic';
};

export type Alert = {
  source: AlertSource;
  severity: RiskLevel;
  message: string;
  zoneId?: string;
  entityId?: string;
};

export type Prediction = {
  target: string; // e.g. "NRO NRO-001" or "Zone Tunis"
  metric: string; // e.g. "saturationRate"
  horizonDays: 30 | 60 | 90;
  currentValue: number;
  predictedValue: number;
  confidence: number; // 0-1
  reasoning: string;
  possibleCauses: string[];
};

export type HealthTrend = 'IMPROVING' | 'STABLE' | 'DECLINING' | 'UNKNOWN';

export type ZoneHealthResult = {
  zoneId: string;
  zoneName: string;
  healthScore: number; // 0-100
  risk: RiskLevel;
  explanation: string;
  factors: Record<string, number>;
  /** Memory: comparison against the previous hourly run's score for this zone. */
  trend: HealthTrend;
  previousHealthScore?: number;
};

/** Shape the LLM is instructed to return for a single recommendation suggestion (prompts/*).
 *  Agents fill in affectedArea/zoneId themselves before persisting, since the LLM doesn't
 *  reliably know internal zone IDs. */
export type LlmRecommendationSuggestion = {
  action: RecommendationAction | string;
  title: string;
  reason: string;
  expectedImpact: string;
  priority: Priority | string;
  confidence: number;
  estimatedDifficulty: 'LOW' | 'MEDIUM' | 'HIGH' | string;
  businessImpact?: string;
  technicalImpact?: string;
  risk?: string;
  estimatedCost?: string;
  estimatedEffort?: string;
  alternatives?: string[];
  affectedArea?: string;
  expectedImprovement?: string;
};

export type AgentResult<T> = {
  data: T;
  generatedByLlm: boolean;
  confidence: number;
};

export type StructuredAnalysisOutput = {
  networkScore: number;
  risk: RiskLevel;
  recommendations: Recommendation[];
  alerts: Alert[];
  predictions: Prediction[];
  confidence: number;
};
