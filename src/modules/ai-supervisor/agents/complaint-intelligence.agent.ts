import { Injectable } from '@nestjs/common';
import { ReclamationDocument } from '../../reclamations/schemas/reclamation.schema';
import { Alert, AgentResult, AlertSource, LlmRecommendationSuggestion, Recommendation, RiskLevel } from '../interfaces/analysis.types';
import { buildComplaintAnalysisPrompt } from '../prompts/complaint-analysis.prompt';
import { ExplanationCacheService } from '../services/explanation-cache.service';
import { GroqService } from '../services/groq.service';
import { normalizeRecommendation } from '../utils/recommendation.util';
import { SupportedLanguage, DEFAULT_LANGUAGE } from '../i18n/supervisor-i18n.util';

export type ComplaintIntelligenceOutput = {
  summary: string;
  trend: 'INCREASING' | 'STABLE' | 'DECREASING';
  recommendations: Recommendation[];
  alerts: Alert[];
};

const SPIKE_RATIO = 1.5; // 50% increase vs previous period triggers an alert

@Injectable()
export class ComplaintIntelligenceAgent {
  constructor(
    private readonly groqService: GroqService,
    private readonly explanationCache: ExplanationCacheService,
  ) {}

  async analyze(
    reclamationsLast30d: ReclamationDocument[],
    reclamationsPrev30d: ReclamationDocument[],
    zoneNameById: Map<string, string>,
    lang: SupportedLanguage = DEFAULT_LANGUAGE,
  ): Promise<AgentResult<ComplaintIntelligenceOutput>> {
    const byTypeZone = new Map<string, number>();
    for (const rec of reclamationsLast30d) {
      const zoneName = (rec.zoneId && zoneNameById.get(rec.zoneId)) ?? 'inconnue';
      const key = `${rec.typeReclamation}::${zoneName}`;
      byTypeZone.set(key, (byTypeZone.get(key) ?? 0) + 1);
    }

    const grouped = Array.from(byTypeZone.entries()).map(([key, count]) => {
      const [type, zoneName] = key.split('::');
      return { type, zoneName, count };
    });

    const alerts: Alert[] = [];
    const ratio = reclamationsPrev30d.length > 0 ? reclamationsLast30d.length / reclamationsPrev30d.length : reclamationsLast30d.length > 0 ? 2 : 1;
    if (ratio >= SPIKE_RATIO && reclamationsLast30d.length >= 5) {
      let message = `Pic de reclamations: ${reclamationsLast30d.length} sur 30j vs ${reclamationsPrev30d.length} sur la periode precedente (x${ratio.toFixed(1)}).`;
      if (lang === 'en') {
        message = `Complaint spike: ${reclamationsLast30d.length} in 30d vs ${reclamationsPrev30d.length} in previous period (x${ratio.toFixed(1)}).`;
      } else if (lang === 'ar') {
        message = `ذروة شكاوى: ${reclamationsLast30d.length} خلال 30 يوماً مقابل ${reclamationsPrev30d.length} في الفترة السابقة (x${ratio.toFixed(1)}).`;
      }

      alerts.push({
        source: AlertSource.COMPLAINT_SPIKE,
        severity: ratio >= 2 ? RiskLevel.CRITICAL : RiskLevel.HIGH,
        message,
      });
    }

    type ComplaintLlmResult = {
      summary: string;
      recurringIssues: Array<{ pattern: string; zoneName: string; count: number; likelyCause: string }>;
      prediction: { trend: 'INCREASING' | 'STABLE' | 'DECREASING'; reasoning: string; confidence: number };
      recommendations: LlmRecommendationSuggestion[];
    };

    const cacheInput = {
      totalLast30d: reclamationsLast30d.length,
      totalPrev30d: reclamationsPrev30d.length,
      byTypeZone: grouped,
    };
    const cacheType = 'complaintIntelligence';
    const cacheKey = { ...cacheInput, lang };
    let llmResult = await this.explanationCache.get<ComplaintLlmResult>('global', cacheType, cacheKey);
    if (!llmResult) {
      llmResult = await this.groqService.chatJSON<ComplaintLlmResult>(buildComplaintAnalysisPrompt(cacheInput, lang));
      if (llmResult) {
        await this.explanationCache.set('global', cacheType, cacheKey, llmResult);
      }
    }

    if (llmResult) {
      return {
        data: {
          summary: llmResult.summary,
          trend: llmResult.prediction?.trend ?? 'STABLE',
          recommendations: (llmResult.recommendations ?? []).map((s) =>
            normalizeRecommendation(s, { affectedArea: s.affectedArea ?? 'Multi-zones', sourceAgent: ComplaintIntelligenceAgent.name }),
          ),
          alerts,
        },
        generatedByLlm: true,
        confidence: llmResult.prediction?.confidence ?? 0.6,
      };
    }

    let summary = `${reclamationsLast30d.length} reclamations sur les 30 derniers jours (${reclamationsPrev30d.length} la periode precedente).`;
    if (lang === 'en') {
      summary = `${reclamationsLast30d.length} complaints over the last 30 days (${reclamationsPrev30d.length} in the previous period).`;
    } else if (lang === 'ar') {
      summary = `${reclamationsLast30d.length} شكوى خلال آخر 30 يوماً (${reclamationsPrev30d.length} في الفترة السابقة).`;
    }

    return {
      data: {
        summary,
        trend: ratio > 1.1 ? 'INCREASING' : ratio < 0.9 ? 'DECREASING' : 'STABLE',
        recommendations: [],
        alerts,
      },
      generatedByLlm: false,
      confidence: 0.4,
    };
  }
}
