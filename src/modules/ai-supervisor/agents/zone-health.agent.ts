import { Injectable, Logger } from '@nestjs/common';
import { FdtStatut } from '../../fdt/schemas/fdt.schema';
import { NroStatus, SaturationStatus } from '../../nro/schemas/nro.schema';
import { HealthTrend, LlmRecommendationSuggestion, Priority, Recommendation, RecommendationAction, ZoneHealthResult } from '../interfaces/analysis.types';
import { buildZoneAnalysisPrompt } from '../prompts/zone-analysis.prompt';
import { ExplanationCacheService } from '../services/explanation-cache.service';
import { GroqService } from '../services/groq.service';
import { ZoneSnapshotData } from '../services/data-aggregator.service';
import { SimulationService } from '../services/simulation.service';
import { computeZoneHealthScore } from '../strategies/health-score.strategy';
import { normalizeRecommendation } from '../utils/recommendation.util';
import { SupportedLanguage, DEFAULT_LANGUAGE } from '../i18n/supervisor-i18n.util';

export type ZoneHealthAgentOutput = {
  health: ZoneHealthResult;
  recommendations: Recommendation[];
};

const TREND_STABLE_TOLERANCE = 2; // points; smaller deltas than this count as STABLE, not noise

function computeTrend(currentScore: number, previousScore?: number): HealthTrend {
  if (previousScore === undefined) return 'UNKNOWN';
  const delta = currentScore - previousScore;
  if (Math.abs(delta) <= TREND_STABLE_TOLERANCE) return 'STABLE';
  return delta > 0 ? 'IMPROVING' : 'DECLINING';
}

@Injectable()
export class ZoneHealthAgent {
  private readonly logger = new Logger(ZoneHealthAgent.name);

  constructor(
    private readonly groqService: GroqService,
    private readonly simulationService: SimulationService,
    private readonly explanationCache: ExplanationCacheService,
  ) {}

  computeScore(
    snapshot: ZoneSnapshotData,
    topologyIssueCount = 0,
    previousHealthScore?: number,
    lang: SupportedLanguage = DEFAULT_LANGUAGE,
  ): ZoneHealthAgentOutput {
    const zoneId = snapshot.zone._id.toString();
    const zoneName = snapshot.zone.name;

    const fdtAvgOccupationPct = snapshot.fdts.length
      ? snapshot.fdts.reduce((sum, f) => sum + (f.nbPortsTotal > 0 ? (f.nbPortsUtilises / f.nbPortsTotal) * 100 : 0), 0) /
        snapshot.fdts.length
      : 0;
    const fdtSaturatedCount = snapshot.fdts.filter((f) => f.statutFdt === FdtStatut.PLEIN).length;

    const nroAvgSaturationPct = snapshot.nros.length
      ? snapshot.nros.reduce((sum, n) => sum + (n.maxCapacity > 0 ? (n.currentLoad / n.maxCapacity) * 100 : 0), 0) /
        snapshot.nros.length
      : 0;
    const nroSaturatedCount = snapshot.nros.filter(
      (n) => n.status === NroStatus.SATURATED || n.statutSaturation === SaturationStatus.SATURE,
    ).length;

    const complaintRatePer100Contracts = snapshot.activeContractsCount > 0
      ? (snapshot.reclamationsLast30d.length / snapshot.activeContractsCount) * 100
      : snapshot.reclamationsLast30d.length > 0
        ? 100
        : 0;

    const { score, risk, factors } = computeZoneHealthScore({
      nroAvgSaturationPct,
      nroSaturatedCount,
      nroTotalCount: snapshot.nros.length,
      fdtAvgOccupationPct,
      fdtSaturatedCount,
      fdtTotalCount: snapshot.fdts.length,
      complaintRatePer100Contracts,
      topologyIssueCount,
    });

    const metrics = {
      fdtCount: snapshot.fdts.length,
      fdtSaturatedCount,
      fdtAvgOccupationPct: Math.round(fdtAvgOccupationPct * 10) / 10,
      nroCount: snapshot.nros.length,
      nroSaturatedCount,
      nroAvgSaturationPct: Math.round(nroAvgSaturationPct * 10) / 10,
      activeContracts: snapshot.activeContractsCount,
      complaintsLast30d: snapshot.reclamationsLast30d.length,
      complaintsPrev30d: snapshot.reclamationsPrev30d.length,
      topologyIssueCount,
    };

    const trend = computeTrend(score, previousHealthScore);

    return {
      health: {
        zoneId,
        zoneName,
        healthScore: score,
        risk,
        explanation: this.fallbackExplanation(zoneName, score, metrics, trend, lang),
        factors,
        trend,
        previousHealthScore,
      },
      recommendations: this.fallbackRecommendations(zoneName, zoneId, snapshot, metrics, lang),
    };
  }

  async explainBatch(
    outputs: Array<{ output: ZoneHealthAgentOutput; snapshot: ZoneSnapshotData; metrics: Record<string, unknown> }>,
    lang: SupportedLanguage = DEFAULT_LANGUAGE,
  ): Promise<ZoneHealthAgentOutput[]> {
    if (outputs.length === 0 || !this.groqService.isConfigured) {
      return outputs.map((o) => o.output);
    }

    const batchInput = outputs.map(({ output, metrics }) => ({
      zoneName: output.health.zoneName,
      healthScore: output.health.healthScore,
      risk: output.health.risk,
      factors: output.health.factors,
      trend: output.health.trend,
      metrics,
    }));

    type LlmZoneBatch = {
      zones: Array<{
        zoneName: string;
        explanation: string;
        topFactors: string[];
        recommendations: LlmRecommendationSuggestion[];
      }>;
    };

    const cacheType = 'zoneHealthBatch';
    const cacheKey = { batch: batchInput, lang };
    let llmResult = await this.explanationCache.get<LlmZoneBatch>('global', cacheType, cacheKey);

    if (llmResult) {
      this.logger.log(`[AI Supervisor] Zone health explanation reused from cache (${outputs.length} zone(s), state unchanged)`);
    } else {
      this.logger.log('[Groq] Generating AI report');
      llmResult = await this.groqService.chatJSON<LlmZoneBatch>(buildZoneAnalysisPrompt({ batch: batchInput }, lang));
      if (llmResult) {
        this.logger.log('[Groq] AI report generated successfully');
        await this.explanationCache.set('global', cacheType, cacheKey, llmResult);
      }
    }

    if (!llmResult?.zones?.length) {
      this.logger.warn('[AI Supervisor] Switching to deterministic fallback');
      this.logger.warn(`[AI Supervisor] Fallback report generated for ${outputs.length} zone(s) (health scores unaffected — only the narrative explanation stays template-based)`);
      return outputs.map((o) => o.output);
    }

    const byZoneName = new Map(llmResult.zones.map((z) => [z.zoneName, z] as const));

    return outputs.map(({ output }) => {
      const llmZone = byZoneName.get(output.health.zoneName);
      if (!llmZone) {
        return output;
      }

      return {
        health: { ...output.health, explanation: llmZone.explanation || output.health.explanation },
        recommendations: llmZone.recommendations?.length
          ? llmZone.recommendations.map((s) =>
              normalizeRecommendation(s, {
                affectedArea: output.health.zoneName,
                zoneId: output.health.zoneId,
                sourceAgent: ZoneHealthAgent.name,
              }),
            )
          : output.recommendations,
      };
    });
  }

  private fallbackExplanation(
    zoneName: string,
    score: number,
    metrics: Record<string, any>,
    trend: HealthTrend,
    lang: SupportedLanguage = DEFAULT_LANGUAGE,
  ): string {
    switch (lang) {
      case 'en':
        return (
          `Zone ${zoneName}: health score ${score}/100 (trend: ${trend}). Saturated FDTs: ${metrics.fdtSaturatedCount}/${metrics.fdtCount}, ` +
          `Saturated NROs: ${metrics.nroSaturatedCount}/${metrics.nroCount}, 30d complaints: ${metrics.complaintsLast30d}, ` +
          `topology issues: ${metrics.topologyIssueCount}.`
        );
      case 'ar':
        return (
          `منطقة ${zoneName}: تقييم الصحة ${score}/100 (الاتجاه: ${trend}). FDT المشبعة: ${metrics.fdtSaturatedCount}/${metrics.fdtCount}، ` +
          `NRO المشبعة: ${metrics.nroSaturatedCount}/${metrics.nroCount}، شكاوى 30 يوماً: ${metrics.complaintsLast30d}، ` +
          `مشاكل طبولوجية: ${metrics.topologyIssueCount}.`
        );
      case 'fr':
      default:
        return (
          `Zone ${zoneName}: score de sante ${score}/100 (tendance: ${trend}). FDT satures: ${metrics.fdtSaturatedCount}/${metrics.fdtCount}, ` +
          `NRO satures: ${metrics.nroSaturatedCount}/${metrics.nroCount}, reclamations 30j: ${metrics.complaintsLast30d}, ` +
          `incoherences topologiques: ${metrics.topologyIssueCount}.`
        );
    }
  }

  private fallbackRecommendations(
    zoneName: string,
    zoneId: string,
    snapshot: ZoneSnapshotData,
    metrics: Record<string, any>,
    lang: SupportedLanguage = DEFAULT_LANGUAGE,
  ): Recommendation[] {
    const recommendations: Recommendation[] = [];

    if (metrics.fdtSaturatedCount > 0) {
      const totalPorts = snapshot.fdts.reduce((sum, f) => sum + f.nbPortsTotal, 0);
      const usedPorts = snapshot.fdts.reduce((sum, f) => sum + f.nbPortsUtilises, 0);
      const scenario = this.simulationService.simulateAddFdtCapacity(usedPorts, totalPorts);

      let title = `Ajouter de la capacite FDT en zone ${zoneName}`;
      let reason = `${metrics.fdtSaturatedCount} FDT sur ${metrics.fdtCount} sont satures.`;
      let expectedImpact = 'Reduction du taux de saturation FDT et des futures reclamations debit.';
      if (lang === 'en') {
        title = `Add FDT capacity in zone ${zoneName}`;
        reason = `${metrics.fdtSaturatedCount} of ${metrics.fdtCount} FDTs are saturated.`;
        expectedImpact = 'Reduces FDT saturation rate and future throughput complaints.';
      } else if (lang === 'ar') {
        title = `إضافة سعة FDT في منطقة ${zoneName}`;
        reason = `${metrics.fdtSaturatedCount} من أصل ${metrics.fdtCount} FDT مشبعة.`;
        expectedImpact = 'تقليل نسبة تشبع FDT والشكاوى المستقبلية المتعلقة بالتدفق.';
      }

      recommendations.push({
        action: RecommendationAction.CREATE_FDT,
        title,
        reason,
        expectedImpact,
        expectedImprovement: this.simulationService.formatImprovement(metrics.fdtAvgOccupationPct, scenario),
        priority: Priority.HIGH,
        confidence: 0.6,
        affectedArea: zoneName,
        zoneId,
        estimatedDifficulty: 'MEDIUM',
      });
    }

    if (metrics.nroSaturatedCount > 0) {
      const totalCapacity = snapshot.nros.reduce((sum, n) => sum + n.maxCapacity, 0);
      const totalLoad = snapshot.nros.reduce((sum, n) => sum + n.currentLoad, 0);
      const scenario = this.simulationService.simulateAddNroCapacity(totalLoad, totalCapacity);

      let title = `Augmenter la capacite NRO en zone ${zoneName}`;
      let reason = `${metrics.nroSaturatedCount} NRO sur ${metrics.nroCount} sont satures.`;
      let expectedImpact = 'Absorption de la croissance des contrats sans coupure de service.';
      if (lang === 'en') {
        title = `Increase NRO capacity in zone ${zoneName}`;
        reason = `${metrics.nroSaturatedCount} of ${metrics.nroCount} NROs are saturated.`;
        expectedImpact = 'Absorbs customer contract growth without service disruptions.';
      } else if (lang === 'ar') {
        title = `زيادة سعة NRO في منطقة ${zoneName}`;
        reason = `${metrics.nroSaturatedCount} من أصل ${metrics.nroCount} NRO مشبعة.`;
        expectedImpact = 'استيعاب نمو العقود دون انقطاع في الخدمة.';
      }

      recommendations.push({
        action: RecommendationAction.INCREASE_CAPACITY,
        title,
        reason,
        expectedImpact,
        expectedImprovement: this.simulationService.formatImprovement(metrics.nroAvgSaturationPct, scenario),
        priority: Priority.HIGH,
        confidence: 0.6,
        affectedArea: zoneName,
        zoneId,
        estimatedDifficulty: 'HIGH',
      });
    }

    return recommendations;
  }
}
