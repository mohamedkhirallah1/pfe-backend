/**
 * Single source of truth for every saturation/prediction threshold used across ai-supervisor
 * (5-minute alerts, hourly FDT-capacity analysis, saturation prediction, infrastructure
 * planning). Previously these were declared independently as local consts in 4 different files
 * (supervisor-scheduler.service.ts, fdt-capacity.agent.ts, saturation-prediction.agent.ts,
 * infrastructure-planner.agent.ts) with the same numeric values — harmless by coincidence, but
 * nothing enforced they'd stay in sync if one were tuned without the others. Import from here
 * instead of re-declaring a local constant with the same number.
 */
export const SATURATION_THRESHOLDS = {
  /** NRO saturation %: at/above this, the 5-minute tier raises an alert. Below
   *  NRO_CRITICAL_PCT, it's alert-worthy but not yet infrastructure-proposal-worthy — a
   *  deliberate two-tier gap, not an inconsistency. */
  NRO_WARNING_PCT: 85,
  /** NRO saturation % (current OR 90-day predicted): triggers InfrastructurePlannerAgent. */
  NRO_CRITICAL_PCT: 90,
  /** FDT occupation %: at/above this, FdtCapacityAgent flags it (WARNING severity below FDT_CRITICAL_PCT). */
  FDT_WARNING_PCT: 70,
  /** FDT occupation %: triggers the 5-minute alert, CRITICAL severity, and InfrastructurePlannerAgent. */
  FDT_CRITICAL_PCT: 90,
  /** Below this current NRO load %, saturation prediction isn't attempted — nothing meaningful to forecast. */
  PREDICTION_MIN_LOAD_PCT: 40,
  /** Minimum regression confidence (0-1) for a critical 90-day prediction to raise an alert. */
  PREDICTION_ALERT_MIN_CONFIDENCE: 0.4,
} as const;

/** Env var names for the two thresholds that are runtime-configurable (InfrastructurePlannerAgent). */
export const SATURATION_THRESHOLD_ENV_KEYS = {
  NRO_CRITICAL_PCT: 'INFRA_PLANNER_NRO_CRITICAL_PCT',
  FDT_CRITICAL_PCT: 'INFRA_PLANNER_FDT_CRITICAL_PCT',
} as const;
