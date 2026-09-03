import { Injectable, Logger } from '@nestjs/common';
import { NroDocument } from '../../nro/schemas/nro.schema';
import { Prediction } from '../interfaces/analysis.types';
import { buildRiskAssessmentPrompt } from '../prompts/risk-assessment.prompt';
import { ExplanationCacheService } from '../services/explanation-cache.service';
import { GroqService } from '../services/groq.service';
import { SnapshotService } from '../services/snapshot.service';
import { SATURATION_THRESHOLDS } from '../strategies/saturation-thresholds.constant';
import { linearTrendForecast } from '../strategies/trend.strategy';
import { SupportedLanguage, DEFAULT_LANGUAGE } from '../i18n/supervisor-i18n.util';

const SATURATION_METRIC = 'nroSaturationPct';

@Injectable()
export class SaturationPredictionAgent {
  private readonly logger = new Logger(SaturationPredictionAgent.name);

  constructor(
    private readonly groqService: GroqService,
    private readonly snapshotService: SnapshotService,
    private readonly explanationCache: ExplanationCacheService,
  ) {}

  async predictForNro(nro: NroDocument, lang: SupportedLanguage = DEFAULT_LANGUAGE): Promise<Prediction[] | null> {
    const currentValue = nro.maxCapacity > 0 ? (nro.currentLoad / nro.maxCapacity) * 100 : 0;

    // Only worth predicting for NROs under real load — an idle NRO has nothing to forecast.
    if (currentValue < SATURATION_THRESHOLDS.PREDICTION_MIN_LOAD_PCT) {
      return null;
    }

    const history = await this.snapshotService.history(SATURATION_METRIC, { nroExternalId: nro.externalId }, 90);
    const forecast = linearTrendForecast(history);

    if (!forecast) {
      let reasoning = `Historique insuffisant (${history.length} point(s)) pour une regression fiable.`;
      if (lang === 'en') {
        reasoning = `Insufficient history (${history.length} point(s)) for reliable regression.`;
      } else if (lang === 'ar') {
        reasoning = `سجل تاريخي غير كافٍ (${history.length} نقطة) لإجراء انحدار موثوق.`;
      }

      return [
        {
          target: `NRO ${nro.externalId}`,
          metric: 'saturationRate',
          horizonDays: 30,
          currentValue: Math.round(currentValue * 10) / 10,
          predictedValue: Math.round(currentValue * 10) / 10,
          confidence: 0.2,
          reasoning,
          possibleCauses: [],
        },
      ];
    }

    return forecast.forecasts.map((f) => {
      let reasoning = `Tendance lineaire: ${forecast.slopePerDay.toFixed(2)} pts/jour (R2=${forecast.r2.toFixed(2)}).`;
      if (lang === 'en') {
        reasoning = `Linear trend: ${forecast.slopePerDay.toFixed(2)} pts/day (R2=${forecast.r2.toFixed(2)}).`;
      } else if (lang === 'ar') {
        reasoning = `اتجاه خطي: ${forecast.slopePerDay.toFixed(2)} نقطة/يوم (R2=${forecast.r2.toFixed(2)}).`;
      }

      return {
        target: `NRO ${nro.externalId}`,
        metric: 'saturationRate',
        horizonDays: f.horizonDays,
        currentValue: Math.round(currentValue * 10) / 10,
        predictedValue: Math.round(f.predictedValue * 10) / 10,
        confidence: forecast.confidence,
        reasoning,
        possibleCauses: [],
      };
    });
  }

  async explainCriticalPredictions(
    predictions: Prediction[],
    lang: SupportedLanguage = DEFAULT_LANGUAGE,
  ): Promise<Prediction[]> {
    if (predictions.length === 0 || !this.groqService.isConfigured) {
      return predictions;
    }

    type LlmPredictionBatch = {
      explanations: Array<{ target: string; horizonDays: number; reasoning: string; possibleCauses: string[] }>;
    };

    const batchInput = predictions.map((p) => ({
      target: p.target,
      horizonDays: p.horizonDays,
      currentValue: p.currentValue,
      predictedValue: p.predictedValue,
      confidence: p.confidence,
    }));

    const cacheType = 'criticalPredictions';
    const cacheKey = { batch: batchInput, lang };
    let llmResult = await this.explanationCache.get<LlmPredictionBatch>('global', cacheType, cacheKey);

    if (llmResult) {
      this.logger.log(`[AI Supervisor] Prediction explanation reused from cache (${predictions.length} entry/entries, state unchanged)`);
    } else {
      this.logger.log('[Groq] Generating AI report');
      llmResult = await this.groqService.chatJSON<LlmPredictionBatch>(buildRiskAssessmentPrompt({ batch: batchInput }, lang));
      if (llmResult) {
        this.logger.log('[Groq] AI report generated successfully');
        await this.explanationCache.set('global', cacheType, cacheKey, llmResult);
      }
    }

    if (!llmResult?.explanations?.length) {
      this.logger.warn('[AI Supervisor] Switching to deterministic fallback');
      this.logger.warn(`[AI Supervisor] Fallback report generated for ${predictions.length} prediction(s) (regression values unaffected — only the narrative reasoning stays template-based)`);
      return predictions;
    }

    const explanationByKey = new Map(
      llmResult.explanations.map((e) => [`${e.target}::${e.horizonDays}`, e] as const),
    );

    return predictions.map((p) => {
      const explanation = explanationByKey.get(`${p.target}::${p.horizonDays}`);
      if (!explanation) return p;
      return { ...p, reasoning: explanation.reasoning || p.reasoning, possibleCauses: explanation.possibleCauses ?? p.possibleCauses };
    });
  }
}
