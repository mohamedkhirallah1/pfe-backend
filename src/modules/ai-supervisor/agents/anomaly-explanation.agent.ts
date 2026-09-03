import { Injectable } from '@nestjs/common';
import { ExplanationCacheService } from '../services/explanation-cache.service';
import { GroqService, GroqPriority } from '../services/groq.service';
import { AnomalyExplanationInput } from '../types/anomaly.types';
import { buildAnomalyExplanationPrompt } from '../prompts/anomaly-explanation.prompt';
import { SupportedLanguage, DEFAULT_LANGUAGE } from '../i18n/supervisor-i18n.util';

export type AnomalyExplanationResult = {
  explanation: string;
  riskPotential: string;
  recommendation: string;
  signalSummary: string[];
};

function isNonEmptyString(value: unknown): value is string {
  return typeof value === 'string' && value.trim().length > 0;
}

function isValidExplanation(result: unknown): result is AnomalyExplanationResult {
  if (!result || typeof result !== 'object') return false;
  const record = result as Record<string, unknown>;
  return (
    isNonEmptyString(record.explanation) &&
    isNonEmptyString(record.riskPotential) &&
    isNonEmptyString(record.recommendation) &&
    Array.isArray(record.signalSummary) &&
    record.signalSummary.every((item) => typeof item === 'string')
  );
}

@Injectable()
export class AnomalyExplanationAgent {
  constructor(
    private readonly groqService: GroqService,
    private readonly explanationCache: ExplanationCacheService,
  ) {}

  async explain(
    input: AnomalyExplanationInput,
    priority: GroqPriority = 'normal',
    lang: SupportedLanguage = DEFAULT_LANGUAGE,
  ): Promise<AnomalyExplanationResult | null> {
    if (!this.groqService.isConfigured) {
      return null;
    }

    const cacheType = 'anomalyExplanation';
    const cacheKeyInput = { ...input, lang };
    const cached = await this.explanationCache.get<AnomalyExplanationResult>(input.zoneId ?? 'global', cacheType, cacheKeyInput);
    if (cached && isValidExplanation(cached)) {
      return cached;
    }

    const result = await this.groqService.chatJSON<AnomalyExplanationResult>(
      buildAnomalyExplanationPrompt(input, lang),
      { priority, maxTokens: 420 },
    );
    if (!isValidExplanation(result)) {
      return null;
    }

    await this.explanationCache.set(input.zoneId ?? 'global', cacheType, cacheKeyInput, result);
    return result;
  }
}
