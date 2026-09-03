import {
  LlmRecommendationSuggestion,
  Priority,
  Recommendation,
  RecommendationAction,
} from '../interfaces/analysis.types';

const VALID_ACTIONS = new Set(Object.values(RecommendationAction));
const VALID_PRIORITIES = new Set(Object.values(Priority));
const VALID_DIFFICULTIES = new Set(['LOW', 'MEDIUM', 'HIGH']);

/**
 * The LLM is asked to return enum-shaped strings but isn't a type system: this normalizes a
 * raw suggestion into a safe Recommendation, substituting sane defaults for anything that
 * doesn't match a known enum value instead of letting bad data hit the database/API contract.
 */
export function normalizeRecommendation(
  suggestion: LlmRecommendationSuggestion,
  fallback: { affectedArea: string; zoneId?: string; sourceAgent: string; expectedImprovement?: string },
): Recommendation & { sourceAgent: string } {
  const action = VALID_ACTIONS.has(suggestion.action as RecommendationAction)
    ? (suggestion.action as RecommendationAction)
    : RecommendationAction.ADMIN_REVIEW;

  const priority = VALID_PRIORITIES.has(suggestion.priority as Priority)
    ? (suggestion.priority as Priority)
    : Priority.MEDIUM;

  const estimatedDifficulty = VALID_DIFFICULTIES.has(suggestion.estimatedDifficulty)
    ? (suggestion.estimatedDifficulty as 'LOW' | 'MEDIUM' | 'HIGH')
    : 'MEDIUM';

  const confidence = Number.isFinite(suggestion.confidence)
    ? Math.min(1, Math.max(0, suggestion.confidence))
    : 0.5;

  return {
    action,
    title: suggestion.title || 'Recommandation',
    reason: suggestion.reason || '',
    expectedImpact: suggestion.expectedImpact || '',
    priority,
    confidence,
    affectedArea: suggestion.affectedArea || fallback.affectedArea,
    zoneId: fallback.zoneId,
    estimatedDifficulty,
    businessImpact: suggestion.businessImpact,
    technicalImpact: suggestion.technicalImpact,
    risk: suggestion.risk,
    estimatedCost: suggestion.estimatedCost,
    estimatedEffort: suggestion.estimatedEffort,
    alternatives: suggestion.alternatives,
    // A simulated number (real, computed) always wins over the LLM's guessed prose.
    expectedImprovement: fallback.expectedImprovement ?? suggestion.expectedImprovement,
    sourceAgent: fallback.sourceAgent,
  };
}
