import { Injectable } from '@nestjs/common';
import { FdtDocument } from '../../fdt/schemas/fdt.schema';
import { AgentResult, LlmRecommendationSuggestion, Priority, Recommendation, RecommendationAction } from '../interfaces/analysis.types';
import { buildRecommendationPrompt } from '../prompts/recommendation.prompt';
import { ExplanationCacheService } from '../services/explanation-cache.service';
import { GroqService } from '../services/groq.service';
import { SimulationService } from '../services/simulation.service';
import { SATURATION_THRESHOLDS } from '../strategies/saturation-thresholds.constant';
import { normalizeRecommendation } from '../utils/recommendation.util';
import { SupportedLanguage, DEFAULT_LANGUAGE, formatFdtRecommendationFallback } from '../i18n/supervisor-i18n.util';

const CRITICAL_THRESHOLD = SATURATION_THRESHOLDS.FDT_CRITICAL_PCT;
const WARNING_THRESHOLD = SATURATION_THRESHOLDS.FDT_WARNING_PCT;

@Injectable()
export class FdtCapacityAgent {
  constructor(
    private readonly groqService: GroqService,
    private readonly simulationService: SimulationService,
    private readonly explanationCache: ExplanationCacheService,
  ) {}

  async analyze(
    fdts: FdtDocument[],
    zoneNameByRegionId: Map<string, string>,
    lang: SupportedLanguage = DEFAULT_LANGUAGE,
  ): Promise<AgentResult<Recommendation[]>> {
    const overloaded = fdts
      .map((fdt) => ({
        fdt,
        occupationPct: fdt.nbPortsTotal > 0 ? (fdt.nbPortsUtilises / fdt.nbPortsTotal) * 100 : 0,
      }))
      .filter((entry) => entry.occupationPct >= WARNING_THRESHOLD);

    if (overloaded.length === 0) {
      return { data: [], generatedByLlm: false, confidence: 1 };
    }

    const signals = overloaded.map((entry) => {
      const scenario = this.simulationService.simulateAddFdtCapacity(entry.fdt.nbPortsUtilises, entry.fdt.nbPortsTotal);
      return {
        externalId: entry.fdt.externalId,
        zoneName: (entry.fdt.regionId && zoneNameByRegionId.get(entry.fdt.regionId)) ?? 'inconnue',
        occupationPct: Math.round(entry.occupationPct),
        severity: entry.occupationPct >= CRITICAL_THRESHOLD ? 'CRITICAL' : 'WARNING',
        simulation: this.simulationService.formatImprovement(entry.occupationPct, scenario),
      };
    });

    const cacheType = 'fdtCapacity';
    const cacheKey = { signals, lang };
    let llmResult = await this.explanationCache.get<{ recommendations: LlmRecommendationSuggestion[] }>('global', cacheType, cacheKey);
    if (!llmResult) {
      llmResult = await this.groqService.chatJSON<{ recommendations: LlmRecommendationSuggestion[] }>(
        buildRecommendationPrompt(
          {
            context: 'Analyse de capacite FDT: liste des FDT en charge ou satures, avec simulation d ajout de capacite.',
            signals: { overloadedFdts: signals },
          },
          lang,
        ),
      );
      if (llmResult) {
        await this.explanationCache.set('global', cacheType, cacheKey, llmResult);
      }
    }

    if (llmResult?.recommendations?.length) {
      return {
        data: llmResult.recommendations.map((s) =>
          normalizeRecommendation(s, { affectedArea: s.affectedArea ?? 'Multi-zones', sourceAgent: FdtCapacityAgent.name }),
        ),
        generatedByLlm: true,
        confidence: 0.7,
      };
    }

    return {
      data: overloaded.map(({ fdt, occupationPct }) => {
        const critical = occupationPct >= CRITICAL_THRESHOLD;
        const zoneName = (fdt.regionId && zoneNameByRegionId.get(fdt.regionId)) ?? 'zone inconnue';
        const scenario = this.simulationService.simulateAddFdtCapacity(fdt.nbPortsUtilises, fdt.nbPortsTotal);
        const fallbackTexts = formatFdtRecommendationFallback(fdt.externalId, zoneName, occupationPct, critical, lang);
        return {
          action: critical ? RecommendationAction.CREATE_FDT : RecommendationAction.DEPLOY_EQUIPMENT,
          title: fallbackTexts.title,
          reason: fallbackTexts.reason,
          expectedImpact: fallbackTexts.expectedImpact,
          expectedImprovement: this.simulationService.formatImprovement(occupationPct, scenario),
          priority: critical ? Priority.URGENT : Priority.MEDIUM,
          confidence: 0.55,
          affectedArea: zoneName,
          zoneId: fdt.regionId,
          estimatedDifficulty: critical ? 'HIGH' : 'MEDIUM',
        } satisfies Recommendation;
      }),
      generatedByLlm: false,
      confidence: 0.5,
    };
  }
}
