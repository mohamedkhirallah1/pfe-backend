import { Injectable } from '@nestjs/common';
import { AgentResult, LlmRecommendationSuggestion, Recommendation } from '../interfaces/analysis.types';
import { buildTopologyAnalysisPrompt } from '../prompts/topology-analysis.prompt';
import { AutoCorrectionReport } from '../services/auto-correction.service';
import { ExplanationCacheService } from '../services/explanation-cache.service';
import { GroqService } from '../services/groq.service';
import { normalizeRecommendation } from '../utils/recommendation.util';
import { SupportedLanguage, DEFAULT_LANGUAGE } from '../i18n/supervisor-i18n.util';

export type TopologyAgentOutput = {
  summary: string;
  fixedCount: number;
  pendingCount: number;
  recommendations: Recommendation[];
};

@Injectable()
export class TopologyAgent {
  constructor(
    private readonly groqService: GroqService,
    private readonly explanationCache: ExplanationCacheService,
  ) {}

  async analyze(
    report: AutoCorrectionReport,
    lang: SupportedLanguage = DEFAULT_LANGUAGE,
  ): Promise<AgentResult<TopologyAgentOutput>> {
    if (report.fixed.length === 0 && report.pending.length === 0) {
      let summary = 'Aucune incoherence topologique detectee.';
      if (lang === 'en') summary = 'No topological inconsistencies detected.';
      else if (lang === 'ar') summary = 'لم يتم اكتشاف أي تعارضات طبولوجية.';

      return {
        data: { summary, fixedCount: 0, pendingCount: 0, recommendations: [] },
        generatedByLlm: false,
        confidence: 1,
      };
    }

    const cacheInput = {
      autoFixedIssues: report.fixed.map((i) => i.message),
      pendingIssues: report.pending.map((i) => i.message),
    };
    const cacheType = 'topology';
    const cacheKey = { ...cacheInput, lang };
    let llmResult = await this.explanationCache.get<{ summary: string; recommendations: LlmRecommendationSuggestion[] }>('global', cacheType, cacheKey);
    if (!llmResult) {
      llmResult = await this.groqService.chatJSON<{ summary: string; recommendations: LlmRecommendationSuggestion[] }>(
        buildTopologyAnalysisPrompt(cacheInput, lang),
      );
      if (llmResult) {
        await this.explanationCache.set('global', cacheType, cacheKey, llmResult);
      }
    }

    if (llmResult) {
      return {
        data: {
          summary: llmResult.summary,
          fixedCount: report.fixed.length,
          pendingCount: report.pending.length,
          recommendations: (llmResult.recommendations ?? []).map((s) =>
            normalizeRecommendation(s, { affectedArea: s.affectedArea ?? 'Topologie', sourceAgent: TopologyAgent.name }),
          ),
        },
        generatedByLlm: true,
        confidence: 0.65,
      };
    }

    let summary = `${report.fixed.length} correction(s) logique(s) appliquee(s), ${report.pending.length} incoherence(s) en attente de validation admin.`;
    if (lang === 'en') {
      summary = `${report.fixed.length} logical fix(es) applied, ${report.pending.length} issue(s) pending admin review.`;
    } else if (lang === 'ar') {
      summary = `تم تطبيق ${report.fixed.length} تصحيح(ات) منطقي(ة)، و${report.pending.length} تعارض(ات) في انتظار مراجعة المسؤول.`;
    }

    return {
      data: {
        summary,
        fixedCount: report.fixed.length,
        pendingCount: report.pending.length,
        recommendations: [],
      },
      generatedByLlm: false,
      confidence: 0.5,
    };
  }
}
