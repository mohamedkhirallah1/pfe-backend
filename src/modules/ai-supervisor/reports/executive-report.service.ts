import { Injectable, Logger } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { NetworkAnalysisAgent } from '../agents/network-analysis.agent';
import { Prediction, RiskLevel, ZoneHealthResult } from '../interfaces/analysis.types';
import { GroqPriority } from '../services/groq.service';
import { computeNetworkScore, riskFromScore } from '../strategies/health-score.strategy';
import { ExecutiveReport, ExecutiveReportDocument } from './schemas/executive-report.schema';

import { SupportedLanguage } from '../i18n/supervisor-i18n.util';

export type ExecutiveReportInput = {
  zoneHealths: ZoneHealthResult[];
  predictions: Prediction[];
  topRecommendations: unknown[];
  complaintSummary: Record<string, unknown>;
  globalCounts: Record<string, unknown>;
  scope?: 'GLOBAL' | 'ZONE';
  zoneId?: string;
  zoneName?: string;
  priority?: GroqPriority;
  lang?: SupportedLanguage;
};

@Injectable()
export class ExecutiveReportService {
  private readonly logger = new Logger(ExecutiveReportService.name);

  constructor(
    @InjectModel(ExecutiveReport.name)
    private readonly reportModel: Model<ExecutiveReportDocument>,
    private readonly networkAnalysisAgent: NetworkAnalysisAgent,
  ) {}

  async build(input: ExecutiveReportInput): Promise<ExecutiveReportDocument> {
    // Everything up to and including buildNarrative() below is deterministic or already
    // Groq-failure-proof (NetworkAnalysisAgent.buildNarrative never throws — it falls back to a
    // template narrative internally). Nothing here is wrapped in try/catch because there is
    // nothing Groq-related left that CAN throw by this point; a real error past this line (e.g.
    // reportModel.create() failing because MongoDB is down) is a genuine failure and must
    // propagate, not be swallowed as if it were an AI issue.
    const networkScore = computeNetworkScore(input.zoneHealths.map((z) => z.healthScore));
    const risk = riskFromScore(networkScore);

    const zoneRanking = [...input.zoneHealths]
      .sort((a, b) => a.healthScore - b.healthScore)
      .map((z) => ({ zoneId: z.zoneId, zoneName: z.zoneName, healthScore: z.healthScore, risk: z.risk }));

    const criticalZones = input.zoneHealths.filter((z) => z.risk === RiskLevel.CRITICAL).map((z) => z.zoneName);

    this.logger.log('[Groq] Generating AI report');
    const { narrative, generatedByLlm } = await this.networkAnalysisAgent.buildNarrative(
      {
        networkScore,
        risk,
        zoneRanking,
        criticalZones,
        topRecommendations: input.topRecommendations,
        predictedSaturation: input.predictions,
        complaintSummary: input.complaintSummary,
        globalCounts: input.globalCounts,
      },
      { scope: input.zoneId ?? 'global', priority: input.priority, lang: input.lang },
    );

    const aiProvider: 'groq' | 'fallback' = generatedByLlm ? 'groq' : 'fallback';
    const confidence = generatedByLlm ? 0.75 : 0.4;

    if (generatedByLlm) {
      this.logger.log('[Groq] AI report generated successfully');
    } else {
      this.logger.warn('[AI Supervisor] Switching to deterministic fallback');
      this.logger.warn('[AI Supervisor] Fallback report generated');
    }

    const report = await this.reportModel.create({
      networkScore,
      risk,
      zoneRanking,
      criticalZones,
      topRecommendations: input.topRecommendations,
      predictedSaturation: input.predictions,
      complaintSummary: input.complaintSummary,
      infrastructureEvolution: input.globalCounts,
      narrative,
      confidence,
      aiProvider,
      scope: input.scope ?? 'GLOBAL',
      zoneId: input.zoneId,
      zoneName: input.zoneName,
    });

    this.logger.log(`[AI Supervisor] Report saved successfully (provider=${aiProvider}, scope=${report.scope}${report.zoneId ? `, zoneId=${report.zoneId}` : ''})`);
    return report;
  }

  /** `zoneId` omitted (ADMIN) = latest GLOBAL report; `zoneId` set (RESPONSABLE_ZONE) = latest report for that zone only, never the global one. */
  findLatest(zoneId?: string): Promise<ExecutiveReportDocument | null> {
    const filter = zoneId ? { scope: 'ZONE', zoneId } : { scope: 'GLOBAL' };
    return this.reportModel.findOne(filter).sort({ createdAt: -1 }).exec();
  }

  /** `zoneId` omitted (ADMIN) = all reports; `zoneId` set (RESPONSABLE_ZONE) = only that zone's reports. */
  findAll(limit = 30, zoneId?: string): Promise<ExecutiveReportDocument[]> {
    const filter = zoneId ? { scope: 'ZONE', zoneId } : {};
    return this.reportModel.find(filter).sort({ createdAt: -1 }).limit(limit).exec();
  }

  findById(id: string): Promise<ExecutiveReportDocument | null> {
    return this.reportModel.findById(id).exec();
  }
}
