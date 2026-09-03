import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { CentraleService } from '../../centrale/services/centrale.service';
import { Contract, ContractDocument } from '../../contracts/schemas/contract.schema';
import { Fdt, FdtDocument } from '../../fdt/schemas/fdt.schema';
import { Nro, NroDocument } from '../../nro/schemas/nro.schema';
import { ZonesService } from '../../zones/zones.service';
import {
  InfrastructureCandidate,
  Priority,
  Recommendation,
  RecommendationAction,
} from '../interfaces/analysis.types';
import { buildInfrastructureProposalPrompt } from '../prompts/infrastructure-proposal.prompt';
import { ExplanationCacheService } from '../services/explanation-cache.service';
import { GroqService } from '../services/groq.service';
import { SimulationService, TYPICAL_NRO_CAPACITY_GB } from '../services/simulation.service';
import { computeCandidateScore } from '../strategies/infrastructure-score.strategy';
import { SATURATION_THRESHOLD_ENV_KEYS, SATURATION_THRESHOLDS } from '../strategies/saturation-thresholds.constant';
import { validateCandidate } from '../utils/candidate-validation.util';
import { GeoPoint, gridCluster, haversineDistanceKm, nearestDistanceKm } from '../utils/geo.util';
import { SupportedLanguage, DEFAULT_LANGUAGE } from '../i18n/supervisor-i18n.util';

export type PredictionInput = { predicted30?: number; predicted60?: number; predicted90?: number };

/**
 * Decides whether a saturated NRO/FDT actually needs a NEW piece of infrastructure, and if so,
 * where. Reuses GeospatialAgent's exact clustering utilities (utils/geo.util.ts) — no second
 * geospatial engine — and SimulationService's exact before/after math (no second simulation
 * engine). Groq is only ever asked for a final reasoning/priority narrative over already-computed
 * numbers (see explainProposalsBatch); it never sees raw lat/lng before the backend has already
 * decided the candidate, and it can never change a coordinate, score, or simulated number.
 *
 * This NEVER creates a NRO/FDT — every proposal comes back as a Recommendation with
 * status PENDING (via the existing RecommendationsService.ingest pipeline), same as any other
 * ai-supervisor recommendation. An administrator must act on it explicitly.
 */
@Injectable()
export class InfrastructurePlannerAgent {
  private readonly logger = new Logger(InfrastructurePlannerAgent.name);

  private readonly nroCriticalPct: number;
  private readonly fdtCriticalPct: number;
  private readonly minContractsForCandidate: number;
  private readonly minDistanceToExistingKm: number;

  constructor(
    @InjectModel(Contract.name) private readonly contractModel: Model<ContractDocument>,
    @InjectModel(Fdt.name) private readonly fdtModel: Model<FdtDocument>,
    @InjectModel(Nro.name) private readonly nroModel: Model<NroDocument>,
    private readonly zonesService: ZonesService,
    private readonly centraleService: CentraleService,
    private readonly simulationService: SimulationService,
    private readonly groqService: GroqService,
    private readonly explanationCache: ExplanationCacheService,
    private readonly configService: ConfigService,
  ) {
    // Defaults sourced from strategies/saturation-thresholds.constant.ts — the SAME numbers
    // FdtCapacityAgent and SupervisorSchedulerService use, so this can never silently drift from
    // "when do we alert" to a different "when do we propose new infrastructure" threshold. Still
    // env-configurable (the two concerns can be deliberately detuned independently if needed).
    this.nroCriticalPct = Number(
      this.configService.get<string>(SATURATION_THRESHOLD_ENV_KEYS.NRO_CRITICAL_PCT, String(SATURATION_THRESHOLDS.NRO_CRITICAL_PCT)),
    );
    this.fdtCriticalPct = Number(
      this.configService.get<string>(SATURATION_THRESHOLD_ENV_KEYS.FDT_CRITICAL_PCT, String(SATURATION_THRESHOLDS.FDT_CRITICAL_PCT)),
    );
    this.minContractsForCandidate = Number(this.configService.get<string>('INFRA_PLANNER_MIN_CONTRACTS', '5'));
    this.minDistanceToExistingKm = Number(this.configService.get<string>('INFRA_PLANNER_MIN_DISTANCE_KM', '0.5'));
  }

  // =========================================================================================
  // NRO
  // =========================================================================================

  async planForSaturatedNro(nro: NroDocument, prediction: PredictionInput = {}): Promise<Recommendation | null> {
    const currentSaturation = nro.maxCapacity > 0 ? (nro.currentLoad / nro.maxCapacity) * 100 : 0;
    const triggered = currentSaturation >= this.nroCriticalPct || (prediction.predicted90 ?? 0) >= this.nroCriticalPct;

    if (!triggered) {
      return null;
    }

    this.logger.log(`[Infrastructure Planner] NRO saturation detected: ${nro.externalId} ${Math.round(currentSaturation)}%`);

    const [contracts, zone, centrale, otherNros] = await Promise.all([
      this.contractModel.find({ nroId: nro.externalId }).exec(),
      this.zonesService.findByRegionIdentifier(nro.regionId ?? ''),
      nro.centraleId ? this.centraleService.findById(nro.centraleId.toString()).catch(() => null) : Promise.resolve(null),
      this.nroModel.find({ regionId: nro.regionId, externalId: { $ne: nro.externalId } }).exec(),
    ]);

    if (!zone || contracts.length === 0) {
      return this.noCandidateRecommendation('NRO', nro.externalId, nro.regionId, currentSaturation, 'Zone introuvable ou aucun contrat rattache — position non calculable.');
    }

    const referenceNroPoints: GeoPoint[] = otherNros.map((n) => ({ lat: n.location.coordinates[1], lng: n.location.coordinates[0] }));
    const centralePoint: GeoPoint | null = centrale ? { lat: centrale.position.coordinates[1], lng: centrale.position.coordinates[0] } : null;

    const candidates = await this.buildCandidates({
      contracts,
      totalContracts: contracts.length,
      cellSizeKm: 2,
      zoneId: zone._id.toString(),
      referencePoints: referenceNroPoints,
      infrastructureType: 'NRO',
      centralePoint,
    });

    // Compare "add a new NRO" against "increase this NRO's own capacity" (Part 4: never
    // auto-pick CREATE_NRO without comparing at least one alternative).
    const increaseCapacityScenario = this.simulationService.simulateAddNroCapacity(nro.currentLoad, nro.maxCapacity);

    if (candidates.length === 0) {
      // No safe geographic candidate — increasing capacity in place is the only real option.
      return this.buildIncreaseCapacityRecommendation('NRO', nro.externalId, nro.regionId, currentSaturation, increaseCapacityScenario, prediction, 'Aucun candidat geographique valide trouve.');
    }

    const best = candidates[0];
    const moveFraction = Math.min(1, best.affectedContracts / contracts.length);
    const addNroScenario = this.simulationService.simulateRedistribution(
      nro.currentLoad,
      nro.maxCapacity,
      0,
      TYPICAL_NRO_CAPACITY_GB,
      moveFraction,
    );

    const chosen = this.simulationService.chooseBestScenario([addNroScenario, increaseCapacityScenario]);

    if (chosen === increaseCapacityScenario) {
      return this.buildIncreaseCapacityRecommendation(
        'NRO',
        nro.externalId,
        nro.regionId,
        currentSaturation,
        increaseCapacityScenario,
        prediction,
        `Extension de capacite (+${increaseCapacityScenario.improvementPct}pts) plus efficace qu'un nouveau NRO (+${addNroScenario.improvementPct}pts) pour ce site.`,
        candidates,
      );
    }

    return {
      type: 'INFRASTRUCTURE_PROPOSAL',
      infrastructureType: 'NRO',
      action: RecommendationAction.CREATE_NRO,
      title: `Nouveau NRO recommande pour desaturer ${nro.externalId}`,
      reason: `NRO ${nro.externalId} a ${Math.round(currentSaturation)}% de saturation` +
        (prediction.predicted90 ? `, predit a ${Math.round(prediction.predicted90)}% sous 90 jours` : '') +
        `. ${best.affectedContracts} contrats regroupes pres de (${best.latitude.toFixed(4)}, ${best.longitude.toFixed(4)}).`,
      expectedImpact: 'Reduit la saturation du NRO existant en deportant une partie des contrats vers un nouveau site.',
      expectedImprovement: `NRO actuel: ${Math.round(currentSaturation)}% -> ${addNroScenario.sourceAfterPct}% | Nouveau NRO: -> ${addNroScenario.targetAfterPct}%`,
      priority: currentSaturation >= 100 ? Priority.URGENT : Priority.HIGH,
      confidence: Math.max(0.3, Math.min(0.95, best.score / 100)),
      affectedArea: zone.name,
      zoneId: zone._id.toString(),
      centraleId: centrale?._id?.toString(),
      sourceInfrastructureId: nro.externalId,
      estimatedDifficulty: 'HIGH',
      recommendedLocation: { latitude: best.latitude, longitude: best.longitude },
      locationScore: best.score,
      analysis: {
        currentSaturation: Math.round(currentSaturation * 10) / 10,
        predicted30Days: prediction.predicted30,
        predicted60Days: prediction.predicted60,
        predicted90Days: prediction.predicted90,
      },
      simulation: {
        before: Math.round(currentSaturation * 10) / 10,
        after: addNroScenario.sourceAfterPct ?? addNroScenario.projectedValuePct,
        improvementPct: addNroScenario.improvementPct,
        affectedContracts: best.affectedContracts,
      },
      candidates,
      alternatives: [`INCREASE_CAPACITY evalue: +${increaseCapacityScenario.improvementPct}pts (non retenu, moins efficace)`],
      source: 'deterministic',
    };
  }

  // =========================================================================================
  // FDT
  // =========================================================================================

  async planForSaturatedFdt(fdt: FdtDocument): Promise<Recommendation | null> {
    const occupationPct = fdt.nbPortsTotal > 0 ? (fdt.nbPortsUtilises / fdt.nbPortsTotal) * 100 : 0;
    if (occupationPct < this.fdtCriticalPct) {
      return null;
    }

    this.logger.log(`[Infrastructure Planner] FDT saturation detected: ${fdt.externalId} ${Math.round(occupationPct)}%`);

    const [contracts, zone, siblingFdts] = await Promise.all([
      this.contractModel.find({ fdtId: fdt.externalId }).exec(),
      this.zonesService.findByRegionIdentifier(fdt.regionId ?? ''),
      this.fdtModel.find({ nroId: fdt.nroId, externalId: { $ne: fdt.externalId } }).exec(),
    ]);

    if (!zone || contracts.length === 0) {
      return this.noCandidateRecommendation('FDT', fdt.externalId, fdt.regionId, occupationPct, 'Zone introuvable ou aucun contrat rattache — position non calculable.');
    }

    const siblingPoints: GeoPoint[] = siblingFdts.map((f) => ({ lat: f.location.coordinates[1], lng: f.location.coordinates[0] }));

    const candidates = await this.buildCandidates({
      contracts,
      totalContracts: contracts.length,
      cellSizeKm: 1,
      zoneId: zone._id.toString(),
      referencePoints: siblingPoints,
      infrastructureType: 'FDT',
      centralePoint: null,
    });

    const addFdtScenario = this.simulationService.simulateAddFdtCapacity(fdt.nbPortsUtilises, fdt.nbPortsTotal);

    // Alternative: move some contracts to the least-loaded sibling FDT under the same NRO, if any has spare room.
    const leastLoadedSibling = [...siblingFdts].sort(
      (a, b) => (a.nbPortsTotal > 0 ? a.nbPortsUtilises / a.nbPortsTotal : 1) - (b.nbPortsTotal > 0 ? b.nbPortsUtilises / b.nbPortsTotal : 1),
    )[0];

    const scenarios = [addFdtScenario];
    let redistributeScenario: ReturnType<SimulationService['simulateRedistribution']> | null = null;
    if (leastLoadedSibling && candidates.length > 0) {
      const moveFraction = Math.min(1, candidates[0].affectedContracts / contracts.length);
      const candidateScenario = this.simulationService.simulateRedistribution(
        fdt.nbPortsUtilises,
        fdt.nbPortsTotal,
        leastLoadedSibling.nbPortsUtilises,
        leastLoadedSibling.nbPortsTotal,
        moveFraction,
      );

      // Reject the redistribution if it would just move the saturation problem onto the sibling
      // FDT instead of solving it — a scenario isn't "better" if it creates a new critical site.
      if ((candidateScenario.targetAfterPct ?? 0) < SATURATION_THRESHOLDS.FDT_CRITICAL_PCT) {
        redistributeScenario = candidateScenario;
        scenarios.push(redistributeScenario);
      } else {
        this.logger.debug(
          `[Infrastructure Planner] Redistribution to ${leastLoadedSibling.externalId} rejected: would reach ${candidateScenario.targetAfterPct}% (>= ${SATURATION_THRESHOLDS.FDT_CRITICAL_PCT}%)`,
        );
      }
    }

    const chosen = this.simulationService.chooseBestScenario(scenarios);

    if (redistributeScenario && chosen === redistributeScenario) {
      return {
        type: 'INFRASTRUCTURE_PROPOSAL',
        infrastructureType: 'FDT',
        action: RecommendationAction.MOVE_CONTRACTS,
        title: `Redistribution de contrats depuis FDT ${fdt.externalId} vers ${leastLoadedSibling.externalId}`,
        reason: `FDT ${fdt.externalId} a ${Math.round(occupationPct)}% d'occupation ; ${leastLoadedSibling.externalId} a de la capacite disponible sous le meme NRO.`,
        expectedImpact: 'Reduit la saturation sans deployer de nouvel equipement.',
        expectedImprovement: `${fdt.externalId}: ${Math.round(occupationPct)}% -> ${redistributeScenario.sourceAfterPct}% | ${leastLoadedSibling.externalId}: -> ${redistributeScenario.targetAfterPct}%`,
        priority: occupationPct >= 100 ? Priority.URGENT : Priority.MEDIUM,
        confidence: 0.6,
        affectedArea: zone.name,
        zoneId: zone._id.toString(),
        centraleId: fdt.centraleId?.toString(),
        sourceInfrastructureId: fdt.externalId,
        estimatedDifficulty: 'LOW',
        analysis: { currentSaturation: Math.round(occupationPct * 10) / 10 },
        simulation: {
          before: Math.round(occupationPct * 10) / 10,
          after: redistributeScenario.sourceAfterPct ?? redistributeScenario.projectedValuePct,
          improvementPct: redistributeScenario.improvementPct,
          affectedContracts: candidates[0]?.affectedContracts ?? 0,
        },
        alternatives: [`CREATE_FDT evalue: +${addFdtScenario.improvementPct}pts (non retenu, moins efficace)`],
        source: 'deterministic',
      };
    }

    if (candidates.length === 0) {
      return this.buildIncreaseCapacityRecommendation('FDT', fdt.externalId, fdt.regionId, occupationPct, addFdtScenario, {}, 'Aucun candidat geographique valide trouve pour un nouveau FDT.');
    }

    const best = candidates[0];

    return {
      type: 'INFRASTRUCTURE_PROPOSAL',
      infrastructureType: 'FDT',
      action: RecommendationAction.CREATE_FDT,
      title: `Nouveau FDT recommande pour desaturer ${fdt.externalId}`,
      reason: `FDT ${fdt.externalId} a ${Math.round(occupationPct)}% d'occupation. ${best.affectedContracts} contrats regroupes pres de (${best.latitude.toFixed(4)}, ${best.longitude.toFixed(4)}).`,
      expectedImpact: 'Reduit la saturation du FDT existant et ameliore la couverture locale.',
      expectedImprovement: this.simulationService.formatImprovement(occupationPct, addFdtScenario),
      priority: occupationPct >= 100 ? Priority.URGENT : Priority.HIGH,
      confidence: Math.max(0.3, Math.min(0.95, best.score / 100)),
      affectedArea: zone.name,
      zoneId: zone._id.toString(),
      centraleId: fdt.centraleId?.toString(),
      sourceInfrastructureId: fdt.externalId,
      estimatedDifficulty: 'MEDIUM',
      recommendedLocation: { latitude: best.latitude, longitude: best.longitude },
      locationScore: best.score,
      analysis: { currentSaturation: Math.round(occupationPct * 10) / 10 },
      simulation: {
        before: Math.round(occupationPct * 10) / 10,
        after: addFdtScenario.projectedValuePct,
        improvementPct: addFdtScenario.improvementPct,
        affectedContracts: best.affectedContracts,
      },
      candidates,
      source: 'deterministic',
    };
  }

  // =========================================================================================
  // Shared candidate generation (reused by NRO and FDT planning)
  // =========================================================================================

  private async buildCandidates(params: {
    contracts: ContractDocument[];
    totalContracts: number;
    cellSizeKm: number;
    zoneId: string;
    /** Existing infrastructure of the SAME type being proposed — nearest-NRO for NRO candidates,
     *  nearest sibling FDT for FDT candidates. Only used for the dedup/distance check. */
    referencePoints: GeoPoint[];
    /** Which distance field on InfrastructureCandidate to populate (they're mutually exclusive —
     *  see the field comments on InfrastructureCandidate for why there are two). */
    infrastructureType: 'NRO' | 'FDT';
    centralePoint: GeoPoint | null;
  }): Promise<InfrastructureCandidate[]> {
    const { contracts, totalContracts, cellSizeKm, zoneId, referencePoints, infrastructureType, centralePoint } = params;

    const points: GeoPoint[] = contracts.map((c) => ({ lat: c.latitude, lng: c.longitude }));
    const clusters = gridCluster(points, cellSizeKm)
      .sort((a, b) => b.pointCount - a.pointCount)
      .slice(0, 3);

    if (clusters.length === 0) {
      return [];
    }

    const maxPointCount = clusters[0].pointCount;
    const results: InfrastructureCandidate[] = [];

    for (const cluster of clusters) {
      const distanceToExistingKm = nearestDistanceKm(cluster.center, referencePoints);

      // "Position dans la Zone" — reuse ZonesService's own geo lookup rather than re-implementing point-in-polygon.
      const zoneAtPoint = await this.zonesService.findZoneByCoordinates(cluster.center.lat, cluster.center.lng);
      const isInsideZone = zoneAtPoint?._id.toString() === zoneId;

      const validation = validateCandidate({
        isInsideZone,
        distanceToNearestSameTypeKm: distanceToExistingKm,
        minDistanceToExistingKm: this.minDistanceToExistingKm,
        affectedContracts: cluster.pointCount,
        minContracts: this.minContractsForCandidate,
      });

      if (validation.valid === false) {
        this.logger.debug(`[Infrastructure Planner] Candidate near (${cluster.center.lat.toFixed(4)}, ${cluster.center.lng.toFixed(4)}) rejected: ${validation.reason}`);
        continue;
      }

      const avgIntraClusterDistanceKm =
        cluster.points.reduce((sum, p) => sum + haversineDistanceKm(p, cluster.center), 0) / cluster.points.length;

      const distanceToCentralKm = centralePoint ? haversineDistanceKm(cluster.center, centralePoint) : null;

      const contractCoverage = cluster.pointCount / totalContracts;
      const geographicDensity = cluster.pointCount / maxPointCount;
      const proximityToContracts = Math.max(0, 1 - avgIntraClusterDistanceKm / (cellSizeKm * 1.25));
      const distanceFromExistingInfrastructure = distanceToExistingKm === null ? 1 : Math.min(1, distanceToExistingKm / 5);
      const topologyCompatibility = distanceToCentralKm === null ? 0.5 : Math.max(0, 1 - distanceToCentralKm / 30);

      // Saturation reduction used purely as a scoring input here: proportional to how much of
      // the source's contracts this candidate would take on.
      const saturationReductionFraction = Math.min(1, contractCoverage);

      const score = computeCandidateScore({
        contractCoverage,
        saturationReduction: saturationReductionFraction,
        geographicDensity,
        proximityToContracts,
        distanceFromExistingInfrastructure,
        topologyCompatibility,
      });

      results.push({
        latitude: Math.round(cluster.center.lat * 1e6) / 1e6,
        longitude: Math.round(cluster.center.lng * 1e6) / 1e6,
        score,
        affectedContracts: cluster.pointCount,
        estimatedCoverage: Math.round(contractCoverage * 100) / 100,
        ...(infrastructureType === 'NRO'
          ? { distanceToExistingNroKm: distanceToExistingKm }
          : { distanceToNearestFdtKm: distanceToExistingKm }),
        distanceToCentralKm,
        densityScore: Math.round(geographicDensity * 100) / 100,
        saturationReductionPct: Math.round(saturationReductionFraction * 100),
        reason: `${cluster.pointCount} contrats regroupes, a ${distanceToExistingKm?.toFixed(2) ?? '?'}km de l'infrastructure existante la plus proche.`,
      });

      this.logger.log(`[Infrastructure Planner] Candidate score=${score} contracts=${cluster.pointCount}`);
    }

    return results.sort((a, b) => b.score - a.score);
  }

  private noCandidateRecommendation(
    infrastructureType: 'NRO' | 'FDT',
    sourceId: string,
    zoneId: string | undefined,
    currentPct: number,
    reason: string,
  ): Recommendation {
    return {
      type: 'INFRASTRUCTURE_PROPOSAL',
      infrastructureType,
      action: RecommendationAction.ADMIN_REVIEW,
      title: `${infrastructureType} ${sourceId} sature — aucune position candidate calculable`,
      reason,
      expectedImpact: 'Necessite une revue manuelle pour determiner la meilleure action.',
      priority: Priority.HIGH,
      confidence: 0.3,
      affectedArea: zoneId ?? 'inconnue',
      zoneId,
      sourceInfrastructureId: sourceId,
      estimatedDifficulty: 'MEDIUM',
      analysis: { currentSaturation: Math.round(currentPct * 10) / 10 },
      source: 'deterministic',
    };
  }

  private buildIncreaseCapacityRecommendation(
    infrastructureType: 'NRO' | 'FDT',
    sourceId: string,
    zoneId: string | undefined,
    currentPct: number,
    scenario: ReturnType<SimulationService['simulateAddNroCapacity']>,
    prediction: PredictionInput,
    reason: string,
    candidates?: InfrastructureCandidate[],
  ): Recommendation {
    return {
      type: 'INFRASTRUCTURE_PROPOSAL',
      infrastructureType,
      action: RecommendationAction.INCREASE_CAPACITY,
      title: `Extension de capacite recommandee pour ${sourceId}`,
      reason,
      expectedImpact: 'Absorbe la croissance sans deployer de nouvel equipement geographiquement distinct.',
      expectedImprovement: this.simulationService.formatImprovement(currentPct, scenario),
      priority: currentPct >= 100 ? Priority.URGENT : Priority.HIGH,
      confidence: 0.55,
      affectedArea: zoneId ?? 'inconnue',
      zoneId,
      sourceInfrastructureId: sourceId,
      estimatedDifficulty: 'MEDIUM',
      analysis: {
        currentSaturation: Math.round(currentPct * 10) / 10,
        predicted30Days: prediction.predicted30,
        predicted60Days: prediction.predicted60,
        predicted90Days: prediction.predicted90,
      },
      simulation: {
        before: Math.round(currentPct * 10) / 10,
        after: scenario.projectedValuePct,
        improvementPct: scenario.improvementPct,
        affectedContracts: 0,
      },
      candidates,
      source: 'deterministic',
    };
  }

  // =========================================================================================
  // Groq — ONE call for every proposal in the batch (Part 5): reasoning/priority only, never
  // coordinates/scores/simulation numbers, which are copied through unchanged.
  // =========================================================================================

  async explainProposalsBatch(
    proposals: Recommendation[],
    lang: SupportedLanguage = DEFAULT_LANGUAGE,
  ): Promise<Recommendation[]> {
    if (proposals.length === 0) {
      return proposals;
    }
    if (!this.groqService.isConfigured) {
      this.logger.warn('[AI Supervisor] Groq not configured — using deterministic proposals as-is');
      return proposals;
    }

    const batchInput = proposals.map((p) => ({
      sourceInfrastructureId: p.sourceInfrastructureId,
      infrastructureType: p.infrastructureType,
      problem: { type: `${p.infrastructureType}_SATURATION`, ...p.analysis },
      chosenScenario: { action: p.action, ...p.simulation },
      recommendedLocation: p.recommendedLocation,
      locationScore: p.locationScore,
    }));

    type LlmProposalBatch = {
      proposals: Array<{ sourceInfrastructureId: string; reasoning: string; priority: string }>;
    };

    const cacheType = 'infrastructureProposals';
    const cacheKey = { batch: batchInput, lang };
    let llmResult = await this.explanationCache.get<LlmProposalBatch>('global', cacheType, cacheKey);

    if (llmResult) {
      this.logger.log(`[Groq] Reusing cached AI report for ${proposals.length} proposal(s) (network state unchanged)`);
    } else {
      this.logger.log('[Groq] Generating AI report');
      // groqService.chatJSON() can never throw here — it already retries on 429/5xx (honoring
      // Retry-After) up to GROQ_MAX_RETRIES, and returns null on any unrecoverable failure
      // (rate limit exhausted, timeout, network error, invalid JSON). No try/catch needed: the
      // null-check below IS the fallback branch.
      llmResult = await this.groqService.chatJSON<LlmProposalBatch>(
        buildInfrastructureProposalPrompt({ proposals: batchInput }, lang),
      );
      if (llmResult) {
        await this.explanationCache.set('global', cacheType, cacheKey, llmResult);
      }
    }

    if (!llmResult?.proposals?.length) {
      this.logger.warn('[AI Supervisor] Switching to deterministic fallback');
      this.logger.warn(`[AI Supervisor] Fallback report generated for ${proposals.length} proposal(s) (candidates/scores/simulation unaffected — only the narrative reasoning stays template-based)`);
      return proposals;
    }

    this.logger.log('[Groq] AI report generated successfully');
    const byId = new Map(llmResult.proposals.map((p) => [p.sourceInfrastructureId, p] as const));

    return proposals.map((p) => {
      const llmProposal = p.sourceInfrastructureId ? byId.get(p.sourceInfrastructureId) : undefined;
      if (!llmProposal) return p;
      return {
        ...p,
        reason: llmProposal.reasoning || p.reason,
        source: 'groq',
      };
    });
  }
}
