import { Injectable } from '@nestjs/common';
import { ContractDocument } from '../../contracts/schemas/contract.schema';
import { FdtDocument } from '../../fdt/schemas/fdt.schema';
import { NroDocument } from '../../nro/schemas/nro.schema';
import { AgentResult, LlmRecommendationSuggestion, Priority, Recommendation, RecommendationAction } from '../interfaces/analysis.types';
import { buildRecommendationPrompt } from '../prompts/recommendation.prompt';
import { ExplanationCacheService } from '../services/explanation-cache.service';
import { GroqService } from '../services/groq.service';
import { GeoPoint, gridCluster, nearestDistanceKm } from '../utils/geo.util';
import { normalizeRecommendation } from '../utils/recommendation.util';
import { SupportedLanguage, DEFAULT_LANGUAGE } from '../i18n/supervisor-i18n.util';

const COVERAGE_HOLE_MIN_CONTRACTS = 5;
const COVERAGE_HOLE_DISTANCE_KM = 3;
const HIGH_DENSITY_MIN_CONTRACTS = 25;

@Injectable()
export class GeospatialAgent {
  constructor(
    private readonly groqService: GroqService,
    private readonly explanationCache: ExplanationCacheService,
  ) {}

  async analyze(
    contracts: ContractDocument[],
    fdts: FdtDocument[],
    nros: NroDocument[],
    lang: SupportedLanguage = DEFAULT_LANGUAGE,
  ): Promise<AgentResult<Recommendation[]>> {
    const contractPoints: GeoPoint[] = contracts.map((c) => ({ lat: c.latitude, lng: c.longitude }));
    const fdtPoints: GeoPoint[] = fdts.map((f) => ({ lat: f.location.coordinates[1], lng: f.location.coordinates[0] }));
    const nroPoints: GeoPoint[] = nros.map((n) => ({ lat: n.location.coordinates[1], lng: n.location.coordinates[0] }));

    const clusters = gridCluster(contractPoints, 5);

    const coverageHoles = clusters.filter((cluster) => {
      if (cluster.pointCount < COVERAGE_HOLE_MIN_CONTRACTS) return false;
      const distance = nearestDistanceKm(cluster.center, fdtPoints);
      return distance === null || distance > COVERAGE_HOLE_DISTANCE_KM;
    });

    const highDensityClusters = clusters.filter((cluster) => cluster.pointCount >= HIGH_DENSITY_MIN_CONTRACTS);

    if (coverageHoles.length === 0 && highDensityClusters.length === 0) {
      return { data: [], generatedByLlm: false, confidence: 1 };
    }

    const signals = {
      coverageHoles: coverageHoles.map((c) => ({
        center: c.center,
        contractCount: c.pointCount,
        nearestFdtKm: nearestDistanceKm(c.center, fdtPoints),
      })),
      highDensityClusters: highDensityClusters.map((c) => ({
        center: c.center,
        contractCount: c.pointCount,
        nearestNroKm: nearestDistanceKm(c.center, nroPoints),
      })),
    };

    const cacheType = 'geospatial';
    const cacheKey = { signals, lang };
    let llmResult = await this.explanationCache.get<{ recommendations: LlmRecommendationSuggestion[] }>('global', cacheType, cacheKey);
    if (!llmResult) {
      llmResult = await this.groqService.chatJSON<{ recommendations: LlmRecommendationSuggestion[] }>(
        buildRecommendationPrompt(
          {
            context: 'Analyse geospatiale: trous de couverture et zones a forte densite de contrats sans infrastructure proche.',
            signals,
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
          normalizeRecommendation(s, { affectedArea: s.affectedArea ?? 'Analyse geospatiale', sourceAgent: GeospatialAgent.name }),
        ),
        generatedByLlm: true,
        confidence: 0.6,
      };
    }

    const fallback: Recommendation[] = [
      ...coverageHoles.map((c) => {
        let title = `Nouveau FDT recommande pres de (${c.center.lat.toFixed(4)}, ${c.center.lng.toFixed(4)})`;
        let reason = `${c.pointCount} contrats regroupes sans FDT a proximite (< ${COVERAGE_HOLE_DISTANCE_KM}km).`;
        let expectedImpact = 'Ameliore la couverture et reduit la distance moyenne client-FDT.';
        let affectedArea = 'Trou de couverture';
        if (lang === 'en') {
          title = `New FDT recommended near (${c.center.lat.toFixed(4)}, ${c.center.lng.toFixed(4)})`;
          reason = `${c.pointCount} grouped contracts without nearby FDT (< ${COVERAGE_HOLE_DISTANCE_KM}km).`;
          expectedImpact = 'Improves coverage and reduces average client-FDT distance.';
          affectedArea = 'Coverage hole';
        } else if (lang === 'ar') {
          title = `يوصى بـ FDT جديد بالقرب من (${c.center.lat.toFixed(4)}, ${c.center.lng.toFixed(4)})`;
          reason = `${c.pointCount} عقداً مجمعة بدون FDT قريب (< ${COVERAGE_HOLE_DISTANCE_KM} كم).`;
          expectedImpact = 'تحسين التغطية وتقليل المسافة المتوسطة بين المشترك و FDT.';
          affectedArea = 'فجوة تغطية';
        }

        return {
          action: RecommendationAction.CREATE_FDT,
          title,
          reason,
          expectedImpact,
          priority: Priority.MEDIUM,
          confidence: 0.5,
          affectedArea,
          estimatedDifficulty: 'MEDIUM' as const,
        };
      }),
      ...highDensityClusters.map((c) => {
        let title = `Zone a forte densite pres de (${c.center.lat.toFixed(4)}, ${c.center.lng.toFixed(4)})`;
        let reason = `${c.pointCount} contrats concentres dans un rayon de 5km.`;
        let expectedImpact = 'Anticipe la saturation locale avant qu elle ne se produise.';
        let affectedArea = 'Cluster haute densite';
        if (lang === 'en') {
          title = `High density area near (${c.center.lat.toFixed(4)}, ${c.center.lng.toFixed(4)})`;
          reason = `${c.pointCount} contracts concentrated within a 5km radius.`;
          expectedImpact = 'Anticipates local saturation before it occurs.';
          affectedArea = 'High density cluster';
        } else if (lang === 'ar') {
          title = `منطقة ذات كثافة عالية بالقرب من (${c.center.lat.toFixed(4)}, ${c.center.lng.toFixed(4)})`;
          reason = `${c.pointCount} عقداً متمركزة في نطاق 5 كم.`;
          expectedImpact = 'استباق التشبع المحلي قبل حدوثه.';
          affectedArea = 'تجمع عالي الكثافة';
        }

        return {
          action: RecommendationAction.INCREASE_CAPACITY,
          title,
          reason,
          expectedImpact,
          priority: Priority.MEDIUM,
          confidence: 0.5,
          affectedArea,
          estimatedDifficulty: 'MEDIUM' as const,
        };
      }),
    ];

    return { data: fallback, generatedByLlm: false, confidence: 0.4 };
  }
}
