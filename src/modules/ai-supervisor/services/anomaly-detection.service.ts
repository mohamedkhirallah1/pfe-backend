import { Injectable, Logger, Optional } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { createHash, randomUUID } from 'crypto';
import { DataAggregatorService } from './data-aggregator.service';
import { NetworkSnapshot, NetworkSnapshotDocument } from '../reports/schemas/network-snapshot.schema';
import { AnomalyExplanationAgent } from '../agents/anomaly-explanation.agent';
import { AiMetricsService } from './ai-metrics.service';
import { RecommendationsService } from '../recommendations/recommendations.service';
import { QlogService } from '../../../common/qlog/qlog.service';
import { RecommendationAction, Recommendation, Priority } from '../interfaces/analysis.types';
import { AnomalyResult, AnomalyResultDocument } from '../reports/schemas/anomaly-result.schema';
import { AnomalyAssessment, AnomalyEntityType, AnomalyEvidenceInput, AnomalySeverity, AnomalyStatus, AnomalyType, AnomalyEvaluationStatus, ANOMALY_MODEL_VERSION } from '../types/anomaly.types';
import { ANOMALY_THRESHOLDS } from '../strategies/anomaly-thresholds.constant';
import { computeAnomalyAssessment } from '../strategies/anomaly-detection.strategy';
import { computeZoneHealthScore } from '../strategies/health-score.strategy';
import { AlertEngineService } from './alert-engine.service';
import { WebsocketBroadcastGateway } from '../../websocket-server/websocket-broadcast.gateway';
import { FdtStatut } from '../../fdt/schemas/fdt.schema';
import { NroStatus, SaturationStatus } from '../../nro/schemas/nro.schema';
import { Reclamation, ReclamationDocument } from '../../reclamations/schemas/reclamation.schema';
import { Contract, ContractDocument, ContractStatus } from '../../contracts/schemas/contract.schema';
import { ZoneDocument } from '../../zones/schemas/zone.schema';
import { SATURATION_THRESHOLDS } from '../strategies/saturation-thresholds.constant';
import { AnomalyExplanationResult } from '../agents/anomaly-explanation.agent';
import { AnomalyEntityType as EntityType } from '../types/anomaly.types';
import { SupportedLanguage, DEFAULT_LANGUAGE, formatAnomalyExplanationFallback } from '../i18n/supervisor-i18n.util';

type PersistedAnomaly = AnomalyResultDocument;

type DetectionSummary = {
  anomalies: PersistedAnomaly[];
  recommendations: Recommendation[];
  executionId: string;
};

const HOUR_MS = 60 * 60 * 1000;

function startOfDay(date: Date): Date {
  const copy = new Date(date);
  copy.setHours(0, 0, 0, 0);
  return copy;
}

function endOfDay(date: Date): Date {
  const copy = startOfDay(date);
  copy.setDate(copy.getDate() + 1);
  return copy;
}

function bucketHourly(series: Array<{ timestampMs: number; value: number }>): Array<{ timestampMs: number; value: number }> {
  const buckets = new Map<number, number[]>();
  for (const point of series) {
    const key = Math.floor(point.timestampMs / HOUR_MS) * HOUR_MS;
    const bucket = buckets.get(key) ?? [];
    bucket.push(point.value);
    buckets.set(key, bucket);
  }

  return [...buckets.entries()]
    .sort((a, b) => a[0] - b[0])
    .map(([timestampMs, values]) => ({ timestampMs, value: values.reduce((sum, value) => sum + value, 0) / values.length }));
}

function fingerprintFor(entityType: EntityType, entityId: string, anomalyType: AnomalyType, zoneId?: string): string {
  return createHash('sha1').update([entityType, entityId, anomalyType, zoneId ?? 'global'].join('|')).digest('hex');
}

function recommendationPriority(severity: AnomalySeverity): Priority {
  if (severity === AnomalySeverity.CRITICAL) return Priority.URGENT;
  if (severity === AnomalySeverity.HIGH) return Priority.HIGH;
  if (severity === AnomalySeverity.MEDIUM) return Priority.MEDIUM;
  return Priority.LOW;
}

function mean(values: number[]): number {
  if (values.length === 0) return 0;
  return values.reduce((sum, value) => sum + value, 0) / values.length;
}

@Injectable()
export class AnomalyDetectionService {
  private readonly logger = new Logger(AnomalyDetectionService.name);
  private readonly inFlight = new Map<string, Promise<DetectionSummary>>();

  constructor(
    @InjectModel(AnomalyResult.name)
    private readonly anomalyModel: Model<AnomalyResultDocument>,
    @InjectModel(NetworkSnapshot.name)
    private readonly snapshotModel: Model<NetworkSnapshotDocument>,
    @InjectModel(Reclamation.name)
    private readonly reclamationModel: Model<ReclamationDocument>,
    @InjectModel(Contract.name)
    private readonly contractModel: Model<ContractDocument>,
    private readonly dataAggregator: DataAggregatorService,
    private readonly anomalyExplanationAgent: AnomalyExplanationAgent,
    private readonly recommendationsService: RecommendationsService,
    private readonly aiMetricsService: AiMetricsService,
    private readonly websocketBroadcastGateway: WebsocketBroadcastGateway,
    private readonly alertEngineService: AlertEngineService,
    @Optional() private readonly qlog?: QlogService,
  ) {}

  run(
    scopeZoneId?: string,
    correlationId?: string,
    lang: SupportedLanguage = DEFAULT_LANGUAGE,
  ): Promise<DetectionSummary> {
    const key = scopeZoneId ? `${scopeZoneId}:${lang}` : `global:${lang}`;
    const existing = this.inFlight.get(key);
    if (existing) {
      this.qlog?.logAi({
        analysisType: 'anomaly_detection',
        scope: key,
        zoneId: scopeZoneId,
        status: 'skipped',
        metadata: { reason: 'already_in_progress' },
      });
      return existing;
    }

    const executionId = correlationId ?? randomUUID();
    this.aiMetricsService.incrAnomalyDetectionRun();
    this.qlog?.logAi({
      analysisType: 'anomaly_detection',
      scope: key,
      zoneId: scopeZoneId,
      status: 'started',
      metadata: { executionId },
    });
    const startedAt = Date.now();

    const promise = this.execute(scopeZoneId, executionId, lang)
      .then((result) => {
        const durationMs = Date.now() - startedAt;
        this.aiMetricsService.recordAnomalyDetectionLatency(durationMs);
        this.qlog?.logAi({
          analysisType: 'anomaly_detection',
          scope: key,
          zoneId: scopeZoneId,
          status: 'completed',
          durationMs,
          metadata: {
            executionId,
            anomaliesDetected: result.anomalies.length,
            highSeverityCount: result.anomalies.filter(
              (a) => a.severity === AnomalySeverity.HIGH || a.severity === AnomalySeverity.CRITICAL,
            ).length,
          },
        });
        return result;
      })
      .catch((error) => {
        const durationMs = Date.now() - startedAt;
        this.aiMetricsService.incrDetectionErrors();
        this.qlog?.logAi({
          analysisType: 'anomaly_detection',
          scope: key,
          zoneId: scopeZoneId,
          status: 'failed',
          durationMs,
          error: (error as Error).message,
          metadata: { executionId },
        });
        throw error;
      })
      .finally(() => {
        this.inFlight.delete(key);
      });

    this.inFlight.set(key, promise);
    return promise;
  }

  async list(scopeZoneId?: string, filters: {
    zoneId?: string;
    entityType?: AnomalyEntityType;
    severity?: AnomalySeverity;
    anomalyType?: AnomalyType;
    status?: AnomalyStatus;
    date?: string;
    limit?: number;
    page?: number;
  } = {}): Promise<{ items: PersistedAnomaly[]; total: number; page: number; limit: number }> {
    const page = filters.page ?? 1;
    const limit = filters.limit ?? 30;
    const filter: Record<string, unknown> = {};
    const zoneId = scopeZoneId ?? filters.zoneId;
    if (zoneId) filter.zoneId = zoneId;
    if (filters.entityType) filter.entityType = filters.entityType;
    if (filters.severity) filter.severity = filters.severity;
    if (filters.anomalyType) filter.anomalyType = filters.anomalyType;
    if (filters.status) filter.status = filters.status;
    if (filters.date) {
      const date = new Date(filters.date);
      filter.detectedAt = { $gte: startOfDay(date), $lt: endOfDay(date) };
    }

    const [items, total] = await Promise.all([
      this.anomalyModel.find(filter).sort({ detectedAt: -1 }).skip((page - 1) * limit).limit(limit).exec(),
      this.anomalyModel.countDocuments(filter).exec(),
    ]);

    return { items, total, page, limit };
  }

  async findById(id: string): Promise<PersistedAnomaly | null> {
    return this.anomalyModel.findById(id).exec();
  }

  async acknowledge(id: string, note?: string): Promise<PersistedAnomaly | null> {
    const anomaly = await this.anomalyModel.findByIdAndUpdate(id, { status: AnomalyStatus.ACKNOWLEDGED, reviewedAt: new Date(), reviewNote: note }, { returnDocument: 'after' }).exec();
    if (anomaly) this.aiMetricsService.incrAnomaliesAcknowledged();
    return anomaly;
  }

  async resolve(id: string, note?: string): Promise<PersistedAnomaly | null> {
    const anomaly = await this.anomalyModel.findByIdAndUpdate(id, { status: AnomalyStatus.RESOLVED, reviewedAt: new Date(), reviewNote: note }, { returnDocument: 'after' }).exec();
    if (anomaly) this.aiMetricsService.incrAnomaliesResolved();
    return anomaly;
  }

  async markFalsePositive(id: string, note?: string): Promise<PersistedAnomaly | null> {
    const anomaly = await this.anomalyModel.findByIdAndUpdate(id, { status: AnomalyStatus.FALSE_POSITIVE, reviewedAt: new Date(), reviewNote: note }, { returnDocument: 'after' }).exec();
    if (anomaly) this.aiMetricsService.incrFalsePositives();
    return anomaly;
  }

  private async execute(
    scopeZoneId: string | undefined,
    executionId: string,
    lang: SupportedLanguage = DEFAULT_LANGUAGE,
  ): Promise<DetectionSummary> {
    const zones = await this.dataAggregator.findAllZones(scopeZoneId);
    const nros = await this.dataAggregator.findAllNros(scopeZoneId);
    const fdts = await this.dataAggregator.findAllFdts(scopeZoneId);
    const contracts = await this.dataAggregator.findAllContracts(scopeZoneId);
    const reclamations = await this.dataAggregator.findAllReclamations(scopeZoneId);
    const now = Date.now();
    const since = new Date(now - ANOMALY_THRESHOLDS.LOOKBACK_DAYS * 24 * 60 * 60 * 1000);

    const [nroSnapshots, fdtSnapshots, zoneSnapshots] = await Promise.all([
      this.snapshotModel.find({ metric: 'nroSaturationPct', createdAt: { $gte: since }, ...(scopeZoneId ? { zoneId: scopeZoneId } : {}) }).sort({ createdAt: 1 }).exec(),
      this.snapshotModel.find({ metric: 'fdtOccupationPct', createdAt: { $gte: since }, ...(scopeZoneId ? { zoneId: scopeZoneId } : {}) }).sort({ createdAt: 1 }).exec(),
      this.snapshotModel.find({ metric: 'zoneHealthScore', createdAt: { $gte: since }, ...(scopeZoneId ? { zoneId: scopeZoneId } : {}) }).sort({ createdAt: 1 }).exec(),
    ]);

    const complaintsLast7d = reclamations.filter((item) => item.createdAt >= since);
    const complaintsPrev7d = reclamations.filter((item) => item.createdAt < since && item.createdAt >= new Date(since.getTime() - ANOMALY_THRESHOLDS.LOOKBACK_DAYS * 24 * 60 * 60 * 1000));
    const contractsLast7d = contracts.filter((item) => item.createdAt >= since);
    const contractsPrev7d = contracts.filter((item) => item.createdAt < since && item.createdAt >= new Date(since.getTime() - ANOMALY_THRESHOLDS.LOOKBACK_DAYS * 24 * 60 * 60 * 1000));

    const groupSnapshots = (docs: Array<{ zoneId?: string; nroExternalId?: string; fdtExternalId?: string; value: number; createdAt: Date }>) => {
      const grouped = new Map<string, Array<{ timestampMs: number; value: number }>>();
      for (const doc of docs) {
        const key = doc.nroExternalId ?? doc.fdtExternalId ?? doc.zoneId ?? 'global';
        const series = grouped.get(key) ?? [];
        series.push({ timestampMs: doc.createdAt.getTime(), value: doc.value });
        grouped.set(key, series);
      }
      for (const [key, series] of grouped.entries()) {
        grouped.set(key, bucketHourly(series));
      }
      return grouped;
    };

    const nroSeries = groupSnapshots(nroSnapshots as unknown as Array<{ zoneId?: string; nroExternalId?: string; value: number; createdAt: Date }>);
    const fdtSeries = groupSnapshots(fdtSnapshots as unknown as Array<{ zoneId?: string; fdtExternalId?: string; value: number; createdAt: Date }>);
    const zoneSeries = groupSnapshots(zoneSnapshots as unknown as Array<{ zoneId?: string; value: number; createdAt: Date }>);

    const anomalies: PersistedAnomaly[] = [];
    const recommendations: Recommendation[] = [];

    const complaintCountByZone = new Map<string, number>();
    const complaintPrevCountByZone = new Map<string, number>();
    const contractCountByZone = new Map<string, number>();
    const contractPrevCountByZone = new Map<string, number>();
    const complaintCountByNro = new Map<string, number>();
    const complaintPrevCountByNro = new Map<string, number>();
    const complaintCountByFdt = new Map<string, number>();
    const complaintPrevCountByFdt = new Map<string, number>();
    const contractCountByNro = new Map<string, number>();
    const contractPrevCountByNro = new Map<string, number>();
    const contractCountByFdt = new Map<string, number>();
    const contractPrevCountByFdt = new Map<string, number>();

    for (const complaint of complaintsLast7d) {
      if (complaint.zoneId) complaintCountByZone.set(complaint.zoneId, (complaintCountByZone.get(complaint.zoneId) ?? 0) + 1);
      if (complaint.nroId) complaintCountByNro.set(complaint.nroId, (complaintCountByNro.get(complaint.nroId) ?? 0) + 1);
      if (complaint.fdtId) complaintCountByFdt.set(complaint.fdtId, (complaintCountByFdt.get(complaint.fdtId) ?? 0) + 1);
    }
    for (const complaint of complaintsPrev7d) {
      if (complaint.zoneId) complaintPrevCountByZone.set(complaint.zoneId, (complaintPrevCountByZone.get(complaint.zoneId) ?? 0) + 1);
      if (complaint.nroId) complaintPrevCountByNro.set(complaint.nroId, (complaintPrevCountByNro.get(complaint.nroId) ?? 0) + 1);
      if (complaint.fdtId) complaintPrevCountByFdt.set(complaint.fdtId, (complaintPrevCountByFdt.get(complaint.fdtId) ?? 0) + 1);
    }
    for (const contract of contractsLast7d) {
      if (contract.zoneId) contractCountByZone.set(contract.zoneId, (contractCountByZone.get(contract.zoneId) ?? 0) + 1);
      if (contract.nroId) contractCountByNro.set(contract.nroId, (contractCountByNro.get(contract.nroId) ?? 0) + 1);
      if (contract.fdtId) contractCountByFdt.set(contract.fdtId, (contractCountByFdt.get(contract.fdtId) ?? 0) + 1);
    }
    for (const contract of contractsPrev7d) {
      if (contract.zoneId) contractPrevCountByZone.set(contract.zoneId, (contractPrevCountByZone.get(contract.zoneId) ?? 0) + 1);
      if (contract.nroId) contractPrevCountByNro.set(contract.nroId, (contractPrevCountByNro.get(contract.nroId) ?? 0) + 1);
      if (contract.fdtId) contractPrevCountByFdt.set(contract.fdtId, (contractPrevCountByFdt.get(contract.fdtId) ?? 0) + 1);
    }

    const detectOne = async (input: AnomalyEvidenceInput, entityType: EntityType, fingerprintZoneId?: string) => {
      const assessment = computeAnomalyAssessment(input);
      if (assessment.status === AnomalyEvaluationStatus.INSUFFICIENT_DATA) {
        this.aiMetricsService.incrInsufficientData();
        return null;
      }

      if (assessment.status !== AnomalyEvaluationStatus.DETECTED) {
        return null;
      }

      const fallback = formatAnomalyExplanationFallback(
        input.entityName ?? input.entityId,
        assessment.anomalyType,
        assessment.currentValue,
        assessment.historicalMean,
        assessment.severity,
        lang,
      );

      const explanationText = fallback.explanation;
      const recommendationText = fallback.recommendation;
      const riskPotential = fallback.riskPotential;
      const fingerprint = fingerprintFor(entityType, input.entityId, assessment.anomalyType, fingerprintZoneId ?? input.zoneId);
      const persisted = await this.anomalyModel.findOneAndUpdate(
        { fingerprint, status: AnomalyStatus.DETECTED },
        {
          $set: {
          entityType,
          entityId: input.entityId,
          entityName: input.entityName,
          zoneId: input.zoneId,
          anomalyType: assessment.anomalyType,
          anomalyTypes: assessment.anomalyTypes,
          severity: assessment.severity,
          anomalyScore: assessment.anomalyScore,
          confidenceScore: assessment.confidenceScore,
          currentValue: assessment.currentValue,
          historicalMean: assessment.historicalMean,
          historicalStdDev: assessment.historicalStdDev,
          deviation: assessment.deviation,
          growthRate: assessment.growthRate,
          acceleration: assessment.acceleration,
          factors: assessment.factors,
          status: assessment.status,
          detectedAt: new Date(),
          explanation: `${explanationText} ${riskPotential}`.trim(),
          recommendation: recommendationText,
          modelVersion: assessment.modelVersion,
          executionId,
          correlationId: executionId,
          insufficientDataReason: assessment.insufficientDataReason,
          fingerprint,
          },
        },
        { upsert: true, returnDocument: 'after', setDefaultsOnInsert: true },
      ).exec();

      if (persisted) {
        anomalies.push(persisted);
        this.aiMetricsService.incrAnomalyDetected();
        if (persisted.severity === AnomalySeverity.CRITICAL) this.aiMetricsService.incrAnomalyCritical();
        if (persisted.severity === AnomalySeverity.HIGH) this.aiMetricsService.incrAnomalyHigh();

        const payload = {
          id: persisted._id.toString(),
          entityType: persisted.entityType,
          entityId: persisted.entityId,
          entityName: persisted.entityName,
          zoneId: persisted.zoneId,
          anomalyType: persisted.anomalyType,
          anomalyTypes: persisted.anomalyTypes,
          severity: persisted.severity,
          anomalyScore: persisted.anomalyScore,
          confidenceScore: persisted.confidenceScore,
          currentValue: persisted.currentValue,
          historicalMean: persisted.historicalMean,
          deviation: persisted.deviation,
          growthRate: persisted.growthRate,
          acceleration: persisted.acceleration,
          detectedAt: persisted.detectedAt,
          explanation: persisted.explanation,
          recommendation: persisted.recommendation,
          status: persisted.status,
        };

        if (persisted.zoneId) {
          this.websocketBroadcastGateway.broadcastToZone('ai.anomaly', persisted.zoneId, payload);
        } else {
          this.websocketBroadcastGateway.broadcastEvent('ai.anomaly', payload);
        }

        recommendations.push({
          action: RecommendationAction.INVESTIGATE,
          title: `Anomalie ${persisted.entityType} detectee sur ${persisted.entityName ?? persisted.entityId}`,
          reason: persisted.explanation,
          expectedImpact: recommendationText,
          priority: recommendationPriority(persisted.severity),
          confidence: persisted.confidenceScore,
          affectedArea: persisted.entityName ?? persisted.entityId,
          zoneId: persisted.zoneId,
          estimatedDifficulty: 'MEDIUM',
          source: 'deterministic',
        });
      }

      return persisted;
    };

    for (const nro of nros) {
      const key = nro.externalId;
      const complaintCurrent = complaintCountByNro.get(key) ?? 0;
      const complaintPrevious = complaintPrevCountByNro.get(key) ?? 0;
      const currentValue = nro.maxCapacity > 0 ? (nro.currentLoad / nro.maxCapacity) * 100 : 0;
      const history = nroSeries.get(key) ?? [];

      this.logger.debug(`[AI Anomaly Detection] Entity=NRO ${key}`);
      const detected = await detectOne({
        entityType: EntityType.NRO,
        entityId: key,
        entityName: nro.name,
        zoneId: nro.regionId,
        history,
        currentValue,
        metricLabel: 'saturation',
        worseningDirection: 1,
        complaintCurrentCount: complaintCurrent,
        complaintPreviousCount: complaintPrevious,
        contractCurrentCount: contractCountByNro.get(key) ?? 0,
        contractPreviousCount: contractPrevCountByNro.get(key) ?? 0,
        warningThreshold: SATURATION_THRESHOLDS.NRO_WARNING_PCT,
        criticalThreshold: SATURATION_THRESHOLDS.NRO_CRITICAL_PCT,
      }, EntityType.NRO, nro.regionId);

      if (detected) {
        this.logger.debug(`[AI Anomaly Detection] Score=${detected.anomalyScore}, Severity=${detected.severity}, Factors=${detected.factors.map((factor) => factor.feature).join(',')}`);
      }
    }

    for (const fdt of fdts) {
      const key = fdt.externalId;
      const complaintCurrent = complaintCountByFdt.get(key) ?? 0;
      const complaintPrevious = complaintPrevCountByFdt.get(key) ?? 0;
      const currentValue = fdt.nbPortsTotal > 0 ? (fdt.nbPortsUtilises / fdt.nbPortsTotal) * 100 : 0;
      const history = fdtSeries.get(key) ?? [];

      this.logger.debug(`[AI Anomaly Detection] Entity=FDT ${key}`);
      await detectOne({
        entityType: EntityType.FDT,
        entityId: key,
        entityName: key,
        zoneId: fdt.regionId,
        history,
        currentValue,
        metricLabel: 'occupation',
        worseningDirection: 1,
        complaintCurrentCount: complaintCurrent,
        complaintPreviousCount: complaintPrevious,
        contractCurrentCount: contractCountByFdt.get(key) ?? 0,
        contractPreviousCount: contractPrevCountByFdt.get(key) ?? 0,
        warningThreshold: SATURATION_THRESHOLDS.FDT_WARNING_PCT,
        criticalThreshold: SATURATION_THRESHOLDS.FDT_CRITICAL_PCT,
      }, EntityType.FDT, fdt.regionId);
    }

    const anomaliesByZone = new Map<string, AnomalyResultDocument[]>();
    for (const anomaly of anomalies) {
      if (!anomaly.zoneId) continue;
      const bucket = anomaliesByZone.get(anomaly.zoneId) ?? [];
      bucket.push(anomaly);
      anomaliesByZone.set(anomaly.zoneId, bucket);
    }

    for (const zone of zones) {
      const zoneId = zone._id.toString();
      const relevant = anomaliesByZone.get(zoneId) ?? [];
      const currentZoneHealth = computeZoneHealthScore({
        nroAvgSaturationPct: mean(nros.filter((nro) => nro.regionId === zoneId).map((nro) => (nro.maxCapacity > 0 ? (nro.currentLoad / nro.maxCapacity) * 100 : 0))),
        nroSaturatedCount: nros.filter((nro) => nro.regionId === zoneId && (nro.status === NroStatus.SATURATED || nro.statutSaturation === SaturationStatus.SATURE)).length,
        nroTotalCount: nros.filter((nro) => nro.regionId === zoneId).length,
        fdtAvgOccupationPct: mean(fdts.filter((fdt) => fdt.regionId === zoneId).map((fdt) => (fdt.nbPortsTotal > 0 ? (fdt.nbPortsUtilises / fdt.nbPortsTotal) * 100 : 0))),
        fdtSaturatedCount: fdts.filter((fdt) => fdt.regionId === zoneId && fdt.statutFdt === FdtStatut.PLEIN).length,
        fdtTotalCount: fdts.filter((fdt) => fdt.regionId === zoneId).length,
        complaintRatePer100Contracts: (complaintCountByZone.get(zoneId) ?? 0) / Math.max(1, contractCountByZone.get(zoneId) ?? 1) * 100,
        topologyIssueCount: relevant.length,
      });
      const history = zoneSeries.get(zoneId) ?? [];
      const zoneAssessment = computeAnomalyAssessment({
        entityType: EntityType.ZONE,
        entityId: zoneId,
        entityName: zone.name,
        zoneId,
        history,
        currentValue: currentZoneHealth.score,
        metricLabel: 'healthScore',
        worseningDirection: -1,
        complaintCurrentCount: complaintCountByZone.get(zoneId) ?? 0,
        complaintPreviousCount: complaintPrevCountByZone.get(zoneId) ?? 0,
        contractCurrentCount: contractCountByZone.get(zoneId) ?? 0,
        contractPreviousCount: contractPrevCountByZone.get(zoneId) ?? 0,
        warningThreshold: 70,
        criticalThreshold: 45,
      });

      if (zoneAssessment.status === AnomalyEvaluationStatus.INSUFFICIENT_DATA) {
        this.aiMetricsService.incrInsufficientData();
        continue;
      }

      if (relevant.length >= 2 || zoneAssessment.anomalyScore >= 40) {
        const explanationText = `Comportement inhabituel détecté dans la zone ${zone.name} (score d'anomalie : ${zoneAssessment.anomalyScore}/100, facteurs : ${zoneAssessment.factors.map(f => f.feature).join(', ')}).`;
        const recommendationText = 'Vérifier les tendances de charge et renforcer la supervision des sous-répartiteurs de la zone.';

        const fingerprint = fingerprintFor(EntityType.ZONE, zoneId, zoneAssessment.anomalyType, zoneId);
        const persisted = await this.anomalyModel.findOneAndUpdate(
          { fingerprint, status: AnomalyStatus.DETECTED },
          {
            $set: {
            entityType: EntityType.ZONE,
            entityId: zoneId,
            entityName: zone.name,
            zoneId,
            anomalyType: zoneAssessment.anomalyType,
            anomalyTypes: zoneAssessment.anomalyTypes,
            severity: zoneAssessment.severity,
            anomalyScore: zoneAssessment.anomalyScore,
            confidenceScore: zoneAssessment.confidenceScore,
            currentValue: zoneAssessment.currentValue,
            historicalMean: zoneAssessment.historicalMean,
            historicalStdDev: zoneAssessment.historicalStdDev,
            deviation: zoneAssessment.deviation,
            growthRate: zoneAssessment.growthRate,
            acceleration: zoneAssessment.acceleration,
            factors: zoneAssessment.factors,
            status: zoneAssessment.status,
            detectedAt: new Date(),
            explanation: explanationText,
            recommendation: recommendationText,
            modelVersion: zoneAssessment.modelVersion,
            executionId,
            correlationId: executionId,
            fingerprint,
            },
          },
          { upsert: true, returnDocument: 'after', setDefaultsOnInsert: true },
        ).exec();

        if (persisted) {
          anomalies.push(persisted);
          this.aiMetricsService.incrAnomalyDetected();
          if (persisted.severity === AnomalySeverity.CRITICAL) this.aiMetricsService.incrAnomalyCritical();
          if (persisted.severity === AnomalySeverity.HIGH) this.aiMetricsService.incrAnomalyHigh();
          recommendations.push({
            action: RecommendationAction.ADMIN_REVIEW,
            title: `Anomalie de comportement detectee dans la zone ${zone.name}`,
            reason: persisted.explanation,
            expectedImpact: persisted.recommendation,
            priority: recommendationPriority(persisted.severity),
            confidence: persisted.confidenceScore,
            affectedArea: zone.name,
            zoneId,
            estimatedDifficulty: 'MEDIUM',
            source: 'deterministic',
          });
        }
      }
    }

    if (recommendations.length > 0) {
      await this.recommendationsService.ingest(recommendations);
    }

    return { anomalies, recommendations, executionId };
  }
}
