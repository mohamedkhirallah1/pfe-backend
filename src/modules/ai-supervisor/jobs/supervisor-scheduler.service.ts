import { Injectable, Logger, Optional } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { AutoRepairAgent } from '../agents/auto-repair.agent';
import { ComplaintIntelligenceAgent } from '../agents/complaint-intelligence.agent';
import { FdtCapacityAgent } from '../agents/fdt-capacity.agent';
import { GeospatialAgent } from '../agents/geospatial.agent';
import { HealthMonitoringAgent } from '../agents/health-monitoring.agent';
import { InfrastructurePlannerAgent } from '../agents/infrastructure-planner.agent';
import { SaturationPredictionAgent } from '../agents/saturation-prediction.agent';
import { TopologyAgent, TopologyAgentOutput } from '../agents/topology.agent';
import { ZoneHealthAgent, ZoneHealthAgentOutput } from '../agents/zone-health.agent';
import { Alert, AlertSource, Prediction, Recommendation, RiskLevel, ZoneHealthResult } from '../interfaces/analysis.types';
import { RecommendationDocument } from '../recommendations/schemas/recommendation.schema';
import { RecommendationsService } from '../recommendations/recommendations.service';
import { ExecutiveReportDocument } from '../reports/schemas/executive-report.schema';
import { ExecutiveReportService } from '../reports/executive-report.service';
import { AlertEngineService } from '../services/alert-engine.service';
import { AnomalyDetectionService } from '../services/anomaly-detection.service';
import { DataAggregatorService, ZoneSnapshotData } from '../services/data-aggregator.service';
import { GroqPriority } from '../services/groq.service';
import { SnapshotService } from '../services/snapshot.service';
import { SATURATION_THRESHOLDS } from '../strategies/saturation-thresholds.constant';
import { QlogService } from '../../../common/qlog/qlog.service';
import {
  SupportedLanguage,
  DEFAULT_LANGUAGE,
  formatNroSaturationAlert,
  formatFdtOccupationAlert,
  formatAppHealthAlert,
  formatPredictionAlert,
} from '../i18n/supervisor-i18n.util';

const NRO_ALERT_THRESHOLD = SATURATION_THRESHOLDS.NRO_WARNING_PCT;
const FDT_ALERT_THRESHOLD = SATURATION_THRESHOLDS.FDT_CRITICAL_PCT;
const PREDICTED_SATURATION_ALERT_THRESHOLD = SATURATION_THRESHOLDS.NRO_CRITICAL_PCT;

export type FullAnalysisResult = {
  zoneHealths: ZoneHealthResult[];
  predictions: Prediction[];
  topology: TopologyAgentOutput;
  persistedRecommendations: RecommendationDocument[];
};

/**
 * Top-level orchestrator: wires the read-only DataAggregatorService, the deterministic
 * strategies, and the LLM agents together, at three cadences. Also the single entry point the
 * controller calls for on-demand runs, so "cron fired" and "admin clicked run" hit identical code.
 */
@Injectable()
export class SupervisorSchedulerService {
  private readonly logger = new Logger(SupervisorSchedulerService.name);

  // Concurrency guard: holds the in-flight Promise of the currently-running analysis/report, or
  // null when idle. This is deliberately a stored Promise, not a boolean flag — a second caller
  // that arrives while one is already running gets handed the SAME Promise instead of starting a
  // redundant second run, so it still gets a real result (just a bit later) without doubling the
  // Groq calls. The check-then-assign in computeFullAnalysis()/dailyTier() is synchronous (no
  // `await` in between), so two calls arriving "at the same time" can't both slip past the check
  // — Node's single-threaded event loop guarantees the first one to run claims the lock before
  // the second one's synchronous code can execute.
  //
  // Keyed by scope ('global' or a zoneId) so a RESPONSABLE_ZONE's own-zone run never blocks on,
  // or gets merged with, the global cron run (or another zone's run) — each scope has its own
  // independent lock, exactly like before but split per key instead of a single flat field.
  private readonly analysisInFlight = new Map<string, Promise<FullAnalysisResult>>();
  private readonly dailyReportInFlight = new Map<string, Promise<ExecutiveReportDocument>>();

  constructor(
    private readonly dataAggregator: DataAggregatorService,
    private readonly autoRepairAgent: AutoRepairAgent,
    private readonly healthMonitoringAgent: HealthMonitoringAgent,
    private readonly snapshotService: SnapshotService,
    private readonly zoneHealthAgent: ZoneHealthAgent,
    private readonly saturationPredictionAgent: SaturationPredictionAgent,
    private readonly fdtCapacityAgent: FdtCapacityAgent,
    private readonly infrastructurePlannerAgent: InfrastructurePlannerAgent,
    private readonly complaintIntelligenceAgent: ComplaintIntelligenceAgent,
    private readonly topologyAgent: TopologyAgent,
    private readonly geospatialAgent: GeospatialAgent,
    private readonly recommendationsService: RecommendationsService,
    private readonly alertEngineService: AlertEngineService,
    private readonly executiveReportService: ExecutiveReportService,
    private readonly anomalyDetectionService?: AnomalyDetectionService,
    @Optional() private readonly qlog?: QlogService,
  ) {}

  // ---- Tier 1: every 5 minutes — cheap, no LLM calls ----
  @Cron(CronExpression.EVERY_5_MINUTES)
  async runFiveMinuteTier(): Promise<void> {
    this.logger.debug('Running 5-minute tier: app health + threshold alerts + snapshots');
    await this.fiveMinuteTier();
  }

  async fiveMinuteTier(): Promise<{ alertsRaised: number }> {
    const alerts: Alert[] = [];

    const health = await this.healthMonitoringAgent.checkAll();
    for (const service of health.services) {
      if (!service.healthy) {
        alerts.push({
          source: AlertSource.APP_HEALTH,
          severity: health.overallRisk,
          message: formatAppHealthAlert(service.name, service.detail),
          entityId: service.name,
        });
      } else {
        await this.alertEngineService.resolve(AlertSource.APP_HEALTH, service.name);
      }
    }

    const [globalCounts, nros, fdts] = await Promise.all([
      this.dataAggregator.getGlobalCounts(),
      this.dataAggregator.findAllNros(),
      this.dataAggregator.findAllFdts(),
    ]);

    for (const nro of nros) {
      const saturationPct = nro.maxCapacity > 0 ? (nro.currentLoad / nro.maxCapacity) * 100 : 0;
      await this.snapshotService.record('nroSaturationPct', saturationPct, { nroExternalId: nro.externalId, zoneId: nro.regionId });

      if (saturationPct >= NRO_ALERT_THRESHOLD) {
        alerts.push({
          source: AlertSource.NRO_SATURATION,
          severity: saturationPct >= 100 ? RiskLevel.CRITICAL : RiskLevel.HIGH,
          message: formatNroSaturationAlert(nro.externalId, saturationPct),
          zoneId: nro.regionId,
          entityId: nro.externalId,
        });
      } else {
        await this.alertEngineService.resolve(AlertSource.NRO_SATURATION, nro.externalId);
      }
    }

    for (const fdt of fdts) {
      const occupationPct = fdt.nbPortsTotal > 0 ? (fdt.nbPortsUtilises / fdt.nbPortsTotal) * 100 : 0;
      await this.snapshotService.record('fdtOccupationPct', occupationPct, { fdtExternalId: fdt.externalId, zoneId: fdt.regionId });
      if (occupationPct >= FDT_ALERT_THRESHOLD) {
        alerts.push({
          source: AlertSource.FDT_SATURATION,
          severity: occupationPct >= 100 ? RiskLevel.CRITICAL : RiskLevel.HIGH,
          message: formatFdtOccupationAlert(fdt.externalId, occupationPct),
          zoneId: fdt.regionId,
          entityId: fdt.externalId,
        });
      } else {
        await this.alertEngineService.resolve(AlertSource.FDT_SATURATION, fdt.externalId);
      }
    }

    await this.snapshotService.record('complaintCount24h', globalCounts.reclamationsLast24h);

    const raised = await this.alertEngineService.raise(alerts);
    this.qlog?.logAi({
      analysisType: 'five_minute_tier',
      status: 'completed',
      metadata: { alertsRaised: raised.length },
    });
    return { alertsRaised: raised.length };
  }

  // ---- Tier 2: hourly — deterministic metrics + LLM narrative/recommendations per domain ----
  @Cron(CronExpression.EVERY_HOUR)
  async runHourlyTier(): Promise<void> {
    this.logger.debug('Running hourly tier: anomaly detection + zone health, saturation prediction, FDT capacity, topology, geospatial');
    if (this.anomalyDetectionService) {
      try {
        await this.anomalyDetectionService.run();
      } catch (error) {
        this.qlog?.logAi({
          analysisType: 'anomaly_detection',
          status: 'failed',
          error: (error as Error).message,
        });
      }
    }
    await this.computeFullAnalysis();
  }

  computeFullAnalysis(
    scopeZoneId?: string,
    priority?: GroqPriority,
    lang: SupportedLanguage = DEFAULT_LANGUAGE,
  ): Promise<FullAnalysisResult> {
    const key = scopeZoneId ? `${scopeZoneId}:${lang}` : `global:${lang}`;
    const existing = this.analysisInFlight.get(key);
    if (existing) {
      this.qlog?.logAi({
        analysisType: 'full_network_analysis',
        scope: key,
        zoneId: scopeZoneId,
        status: 'skipped',
        metadata: { reason: 'already_in_progress' },
      });
      return existing;
    }

    this.qlog?.logAi({
      analysisType: 'full_network_analysis',
      scope: key,
      zoneId: scopeZoneId,
      status: 'started',
    });
    const run = this.runFullAnalysis(scopeZoneId, lang).finally(() => {
      this.analysisInFlight.delete(key);
    });
    this.analysisInFlight.set(key, run);
    return run;
  }

  private async runFullAnalysis(
    scopeZoneId?: string,
    lang: SupportedLanguage = DEFAULT_LANGUAGE,
  ): Promise<FullAnalysisResult> {
    const startedAt = Date.now();
    let stepStartedAt = startedAt;
    const stepDurationsMs: Record<string, number> = {};
    const markStep = (name: string) => {
      const now = Date.now();
      stepDurationsMs[name] = now - stepStartedAt;
      stepStartedAt = now;
    };

    try {
      const zones = await this.dataAggregator.findAllZones(scopeZoneId);
      const zoneNameByRegionId = new Map(zones.map((z) => [z._id.toString(), z.name]));
      markStep('loadZones');

      const correctionReport = await this.autoRepairAgent.runAudit();
      markStep('autoRepairAudit');
      const topologyResult = await this.topologyAgent.analyze(correctionReport, lang);
      markStep('topology');

      const allRecommendations: Array<Recommendation & { sourceAgent?: string }> = [
        ...topologyResult.data.recommendations,
      ];

      const zoneComputations: Array<{
        output: ZoneHealthAgentOutput;
        snapshot: ZoneSnapshotData;
        metrics: Record<string, unknown>;
      }> = [];

      for (const zone of zones) {
        const snapshot = await this.dataAggregator.getZoneSnapshot(zone);
        const zoneId = zone._id.toString();
        const topologyIssueCount = correctionReport.pending.filter((issue) => issue.zoneId === zoneId).length;

        const scoreHistory = await this.snapshotService.history('zoneHealthScore', { zoneId }, 7);
        const previousHealthScore = scoreHistory.length > 0 ? scoreHistory[scoreHistory.length - 1].value : undefined;

        const output = this.zoneHealthAgent.computeScore(snapshot, topologyIssueCount, previousHealthScore, lang);
        await this.snapshotService.record('zoneHealthScore', output.health.healthScore, { zoneId });
        zoneComputations.push({ output, snapshot, metrics: output.health.factors });
      }

      markStep('zoneHealthComputation');
      const explainedZones = await this.zoneHealthAgent.explainBatch(zoneComputations, lang);
      markStep('zoneHealthExplanation');
      const zoneHealths: ZoneHealthResult[] = explainedZones.map((z) => z.health);
      for (const z of explainedZones) {
        allRecommendations.push(...z.recommendations);
      }

      const [fdts, nros, contracts] = await Promise.all([
        this.dataAggregator.findAllFdts(scopeZoneId),
        this.dataAggregator.findAllNros(scopeZoneId),
        this.dataAggregator.findAllContracts(scopeZoneId),
      ]);

      const fdtCapacityResult = await this.fdtCapacityAgent.analyze(fdts, zoneNameByRegionId, lang);
      markStep('fdtCapacity');
      allRecommendations.push(...fdtCapacityResult.data);

      const geoResult = await this.geospatialAgent.analyze(contracts, fdts, nros, lang);
      markStep('geospatial');
      allRecommendations.push(...geoResult.data);

      const predictionAlerts: Alert[] = [];
      const criticalPredictions: Prediction[] = [];
      const predictions: Prediction[] = [];
      const predictionByNroExternalId = new Map<
        string,
        { predicted30?: number; predicted60?: number; predicted90?: number }
      >();

      for (const nro of nros) {
        const nroPredictions = await this.saturationPredictionAgent.predictForNro(nro, lang);
        if (!nroPredictions) continue;

        predictionByNroExternalId.set(nro.externalId, {
          predicted30: nroPredictions.find((p) => p.horizonDays === 30)?.predictedValue,
          predicted60: nroPredictions.find((p) => p.horizonDays === 60)?.predictedValue,
          predicted90: nroPredictions.find((p) => p.horizonDays === 90)?.predictedValue,
        });

        const horizon90 = nroPredictions.find((p) => p.horizonDays === 90);
        const isCritical =
          horizon90 &&
          horizon90.predictedValue >= PREDICTED_SATURATION_ALERT_THRESHOLD &&
          horizon90.confidence >= SATURATION_THRESHOLDS.PREDICTION_ALERT_MIN_CONFIDENCE;

        if (isCritical) {
          criticalPredictions.push(...nroPredictions);
          predictionAlerts.push({
            source: AlertSource.NRO_SATURATION,
            severity: RiskLevel.MEDIUM,
            message: formatPredictionAlert(nro.externalId, 90, horizon90!.predictedValue, lang),
            zoneId: nro.regionId,
            entityId: `${nro.externalId}-predicted`,
          });
        }

        predictions.push(...nroPredictions);
      }

      if (criticalPredictions.length > 0) {
        const explained = await this.saturationPredictionAgent.explainCriticalPredictions(criticalPredictions, lang);
        const explainedByKey = new Map(explained.map((p) => [`${p.target}::${p.horizonDays}`, p] as const));
        for (let i = 0; i < predictions.length; i++) {
          const enriched = explainedByKey.get(`${predictions[i].target}::${predictions[i].horizonDays}`);
          if (enriched) predictions[i] = enriched;
        }
      }
      markStep('saturationPrediction');

      if (predictionAlerts.length > 0) {
        await this.alertEngineService.raise(predictionAlerts);
      }

      const infrastructureProposals: Recommendation[] = [];
      for (const nro of nros) {
        const proposal = await this.infrastructurePlannerAgent.planForSaturatedNro(nro, predictionByNroExternalId.get(nro.externalId) ?? {});
        if (proposal) infrastructureProposals.push(proposal);
      }
      for (const fdt of fdts) {
        const proposal = await this.infrastructurePlannerAgent.planForSaturatedFdt(fdt);
        if (proposal) infrastructureProposals.push(proposal);
      }

      if (infrastructureProposals.length > 0) {
        const explainedProposals = await this.infrastructurePlannerAgent.explainProposalsBatch(infrastructureProposals, lang);
        allRecommendations.push(...explainedProposals);
      }
      markStep('infrastructurePlanning');

      const persistedRecommendations = await this.recommendationsService.ingest(allRecommendations);
      const durationMs = Date.now() - startedAt;

      this.qlog?.logAi({
        analysisType: 'full_network_analysis',
        scope: scopeZoneId ?? 'global',
        zoneId: scopeZoneId,
        status: 'completed',
        durationMs,
        metadata: {
          zonesCount: zones.length,
          nrosCount: nros.length,
          fdtsCount: fdts.length,
          contractsCount: contracts.length,
          newRecommendations: persistedRecommendations.length,
          stepDurationsMs,
        },
      });

      return { zoneHealths, predictions, topology: topologyResult.data, persistedRecommendations };
    } catch (error) {
      const durationMs = Date.now() - startedAt;
      this.qlog?.logAi({
        analysisType: 'full_network_analysis',
        scope: scopeZoneId ?? 'global',
        zoneId: scopeZoneId,
        status: 'failed',
        durationMs,
        error: (error as Error).message,
        metadata: { stepDurationsMs },
      });
      throw error;
    }
  }

  // ---- Tier 3: daily — complaints trend + executive report ----
  @Cron(CronExpression.EVERY_DAY_AT_MIDNIGHT)
  async runDailyTier(): Promise<void> {
    this.logger.debug('Running daily tier: complaint intelligence + executive report');
    await this.dailyTier();
  }

  dailyTier(
    scopeZoneId?: string,
    priority?: GroqPriority,
    lang: SupportedLanguage = DEFAULT_LANGUAGE,
  ): Promise<ExecutiveReportDocument> {
    const key = scopeZoneId ? `${scopeZoneId}:${lang}` : `global:${lang}`;
    const existing = this.dailyReportInFlight.get(key);
    if (existing) {
      this.qlog?.logAi({
        analysisType: 'daily_executive_report',
        scope: key,
        zoneId: scopeZoneId,
        status: 'skipped',
        metadata: { reason: 'already_in_progress' },
      });
      return existing;
    }

    this.qlog?.logAi({
      analysisType: 'daily_executive_report',
      scope: key,
      zoneId: scopeZoneId,
      status: 'started',
    });
    const run = this.buildDailyReport(scopeZoneId, priority, lang).finally(() => {
      this.dailyReportInFlight.delete(key);
    });
    this.dailyReportInFlight.set(key, run);
    return run;
  }

  private async buildDailyReport(
    scopeZoneId?: string,
    priority?: GroqPriority,
    lang: SupportedLanguage = DEFAULT_LANGUAGE,
  ): Promise<ExecutiveReportDocument> {
    const startedAt = Date.now();
    const full = await this.computeFullAnalysis(scopeZoneId, priority, lang);

    const zones = await this.dataAggregator.findAllZones(scopeZoneId);
    const zoneNameById = new Map(zones.map((z) => [z._id.toString(), z.name]));
    const reclamations = await this.dataAggregator.findAllReclamations(scopeZoneId);

    const now = Date.now();
    const day = 24 * 60 * 60 * 1000;
    const since30d = new Date(now - 30 * day);
    const since60d = new Date(now - 60 * day);
    const last30d = reclamations.filter((r) => (r as any).createdAt >= since30d);
    const prev30d = reclamations.filter((r) => (r as any).createdAt >= since60d && (r as any).createdAt < since30d);

    const complaintResult = await this.complaintIntelligenceAgent.analyze(last30d, prev30d, zoneNameById, lang);
    await this.recommendationsService.ingest(complaintResult.data.recommendations);
    if (complaintResult.data.alerts.length > 0) {
      await this.alertEngineService.raise(complaintResult.data.alerts);
    }

    const topRecommendations = await this.recommendationsService.topRanked(10, scopeZoneId);
    const globalCounts = await this.dataAggregator.getGlobalCounts(scopeZoneId);

    const report = await this.executiveReportService.build({
      zoneHealths: full.zoneHealths,
      predictions: full.predictions,
      topRecommendations: topRecommendations.map((r) => ({
        title: r.title,
        action: r.action,
        priority: r.priority,
        affectedArea: r.affectedArea,
        confidence: r.confidence,
      })),
      complaintSummary: { summary: complaintResult.data.summary, trend: complaintResult.data.trend, last30dCount: last30d.length, prev30dCount: prev30d.length },
      globalCounts,
      scope: scopeZoneId ? 'ZONE' : 'GLOBAL',
      zoneId: scopeZoneId,
      zoneName: scopeZoneId ? zoneNameById.get(scopeZoneId) : undefined,
      priority,
      lang,
    });

    const durationMs = Date.now() - startedAt;
    this.qlog?.logAi({
      analysisType: 'daily_executive_report',
      scope: scopeZoneId ?? 'global',
      zoneId: scopeZoneId,
      status: 'completed',
      durationMs,
      metadata: { risk: report.risk },
    });

    return report;
  }
}
