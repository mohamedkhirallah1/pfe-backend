import { Body, Controller, ForbiddenException, Get, Header, NotFoundException, Optional, Param, Patch, Post, Query, Req, Res, UseGuards } from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import { Response } from 'express';
import { AppRole } from '../../auth/roles.enum';
import { Roles } from '../../auth/roles.decorator';
import { RolesGuard } from '../../auth/roles.guard';
import { HealthMonitoringAgent } from '../agents/health-monitoring.agent';
import { AnomalyDetectionService } from '../services/anomaly-detection.service';
import { ListQueryDto } from '../dto/list-query.dto';
import { AnomalyListQueryDto } from '../dto/anomaly-list-query.dto';
import { ReviewAnomalyDto } from '../dto/review-anomaly.dto';
import { ReviewRecommendationDto } from '../dto/review-recommendation.dto';
import { SupervisorSchedulerService } from '../jobs/supervisor-scheduler.service';
import { RecommendationsService } from '../recommendations/recommendations.service';
import { RecommendationStatus } from '../recommendations/schemas/recommendation.schema';
import { ExecutiveReportPdfService } from '../reports/executive-report-pdf.service';
import { ExecutiveReportService } from '../reports/executive-report.service';
import { AiMetricsService } from '../services/ai-metrics.service';
import { AlertEngineService } from '../services/alert-engine.service';
import { AiRequestUser, assertZoneAccess, resolveAiScope, scopeZoneId } from '../utils/ai-scope.util';
import { UsersService } from '../../users/services/users.service';
import { SupportedLanguage, DEFAULT_LANGUAGE, normalizeLanguage } from '../i18n/supervisor-i18n.util';

@Controller('ai-supervisor')
@UseGuards(AuthGuard('jwt'), RolesGuard)
export class AiSupervisorController {
  constructor(
    private readonly schedulerService: SupervisorSchedulerService,
    private readonly recommendationsService: RecommendationsService,
    private readonly alertEngineService: AlertEngineService,
    private readonly executiveReportService: ExecutiveReportService,
    private readonly executiveReportPdfService: ExecutiveReportPdfService,
    private readonly healthMonitoringAgent: HealthMonitoringAgent,
    private readonly aiMetricsService: AiMetricsService,
    @Optional() private readonly anomalyDetectionService?: AnomalyDetectionService,
    @Optional() private readonly usersService?: UsersService,
  ) {}

  private async resolveUserLanguage(req: any): Promise<SupportedLanguage> {
    const userId = req.user?.sub;
    if (!userId || !this.usersService) return DEFAULT_LANGUAGE;
    try {
      const user = await this.usersService.findById(userId);
      return normalizeLanguage(user?.language);
    } catch {
      return DEFAULT_LANGUAGE;
    }
  }

  /** Diagnostic counters for Groq usage (requests, cache hits/misses, 429s, circuit breaker
   *  state). Process-local, resets on restart — not a billing/alerting source of truth. */
  @Get('metrics')
  @Roles(AppRole.ADMIN)
  async getMetrics() {
    return { message: 'AI supervisor metrics', data: this.aiMetricsService.snapshot() };
  }

  @Get('health')
  @Roles(AppRole.ADMIN)
  async getHealth() {
    return { message: 'Application health', data: await this.healthMonitoringAgent.checkAllWithNarrative() };
  }

  @Post('run/health-check')
  @Roles(AppRole.ADMIN)
  async runHealthCheck() {
    return { message: '5-minute tier executed (health + thresholds + snapshots)', data: await this.schedulerService.fiveMinuteTier() };
  }

  /**
   * ADMIN triggers the global analysis (all zones). RESPONSABLE_ZONE triggers an analysis scoped
   * to their own zone only — the scope comes exclusively from `user.zoneId` (the JWT), never from
   * the request body, so a crafted body cannot request another zone's analysis.
   */
  @Post('run/analysis')
  @Roles(AppRole.ADMIN, AppRole.RESPONSABLE_ZONE)
  async runAnalysis(@Req() req: any) {
    const scope = resolveAiScope(req.user as AiRequestUser);
    const zoneId = scopeZoneId(scope);
    const lang = await this.resolveUserLanguage(req);
    const [analysisResult, anomalySummary] = await Promise.all([
      this.schedulerService.computeFullAnalysis(zoneId, 'normal', lang),
      this.anomalyDetectionService ? this.anomalyDetectionService.run(zoneId, undefined, lang) : Promise.resolve(null),
    ]);
    return {
      message: zoneId ? `Zone analysis executed for zone ${zoneId}` : 'Global analysis executed (zone health, saturation, FDT capacity, topology, geospatial, anomalies)',
      data: {
        ...analysisResult,
        anomaliesDetected: anomalySummary?.anomalies?.length ?? 0,
      },
    };
  }

  @Post('run/anomalies')
  @Roles(AppRole.ADMIN, AppRole.RESPONSABLE_ZONE)
  async runAnomalies(@Req() req: any) {
    const scope = resolveAiScope(req.user as AiRequestUser);
    const zoneId = scopeZoneId(scope);
    const lang = await this.resolveUserLanguage(req);
    const summary = this.anomalyDetectionService
      ? await this.anomalyDetectionService.run(zoneId, undefined, lang)
      : { anomalies: [], recommendations: [], executionId: '' };
    return {
      message: zoneId ? `Anomaly detection executed for zone ${zoneId}` : 'Global anomaly detection executed',
      data: summary,
    };
  }

  /** Same scoping rule as run/analysis: ADMIN => global report, RESPONSABLE_ZONE => their own zone's report only.
   *  Explicitly requested by a user, so it's queued ahead of routine cron-triggered Groq calls. */
  @Post('run/report')
  @Roles(AppRole.ADMIN, AppRole.RESPONSABLE_ZONE)
  async runReport(@Req() req: any) {
    const scope = resolveAiScope(req.user as AiRequestUser);
    const zoneId = scopeZoneId(scope);
    const lang = await this.resolveUserLanguage(req);
    return {
      message: zoneId ? `Zone executive report generated for zone ${zoneId}` : 'Global executive report generated',
      data: await this.schedulerService.dailyTier(zoneId, 'critical', lang),
    };
  }

  @Get('recommendations')
  @Roles(AppRole.ADMIN, AppRole.RESPONSABLE_ZONE)
  async listRecommendations(@Req() req: any, @Query() query: ListQueryDto) {
    const zoneId = scopeZoneId(resolveAiScope(req.user as AiRequestUser));
    return {
      message: zoneId ? `Recommendations for zone ${zoneId}` : 'All recommendations',
      data: await this.recommendationsService.findAll(query.limit ?? 100, zoneId),
    };
  }

  /**
   * Closes the "wait for administrator validation" step of the supervisor loop. Only ADMIN can
   * decide — RESPONSABLE_ZONE can see recommendations for their zone but not action them, since
   * approving infrastructure changes is an operator-level decision.
   */
  @Patch('recommendations/:id/approve')
  @Roles(AppRole.ADMIN)
  async approveRecommendation(@Param('id') id: string, @Body() dto: ReviewRecommendationDto) {
    const updated = await this.recommendationsService.setStatus(id, RecommendationStatus.APPROVED, dto.note);
    if (!updated) {
      throw new NotFoundException('Recommendation not found');
    }
    return { message: 'Recommendation approved', data: updated };
  }

  @Patch('recommendations/:id/reject')
  @Roles(AppRole.ADMIN)
  async rejectRecommendation(@Param('id') id: string, @Body() dto: ReviewRecommendationDto) {
    const updated = await this.recommendationsService.setStatus(id, RecommendationStatus.DISMISSED, dto.note);
    if (!updated) {
      throw new NotFoundException('Recommendation not found');
    }
    return { message: 'Recommendation rejected', data: updated };
  }

  /** New-NRO/new-FDT proposals — a filtered view of /recommendations (Part 12: reuse, no parallel API). */
  @Get('infrastructure-proposals')
  @Roles(AppRole.ADMIN, AppRole.RESPONSABLE_ZONE)
  async listInfrastructureProposals(@Req() req: any, @Query() query: ListQueryDto) {
    const zoneId = scopeZoneId(resolveAiScope(req.user as AiRequestUser));
    return {
      message: zoneId ? `Infrastructure proposals for zone ${zoneId}` : 'All infrastructure proposals',
      data: await this.recommendationsService.findInfrastructureProposals(query.limit ?? 100, zoneId),
    };
  }

  @Get('alerts')
  @Roles(AppRole.ADMIN, AppRole.RESPONSABLE_ZONE)
  async listAlerts(@Req() req: any) {
    const zoneId = scopeZoneId(resolveAiScope(req.user as AiRequestUser));
    return {
      message: zoneId ? `Active alerts for zone ${zoneId}` : 'All active alerts',
      data: await this.alertEngineService.findActive(zoneId),
    };
  }

  @Get('anomalies')
  @Roles(AppRole.ADMIN, AppRole.RESPONSABLE_ZONE)
  async listAnomalies(@Req() req: any, @Query() query: AnomalyListQueryDto) {
    const scope = resolveAiScope(req.user as AiRequestUser);
    const zoneId = scope.scope === 'ZONE' ? scope.zoneId : query.zoneId;

    if (scope.scope === 'ZONE' && query.zoneId && query.zoneId !== scope.zoneId) {
      throw new ForbiddenException('You are not authorized to access this zone');
    }

    return {
      message: zoneId ? `Anomalies for zone ${zoneId}` : 'All anomalies',
      data: await this.anomalyDetectionService!.list(scope.scope === 'ZONE' ? scope.zoneId : undefined, {
        zoneId,
        entityType: query.entityType,
        severity: query.severity,
        anomalyType: query.anomalyType,
        status: query.status,
        date: query.date,
        limit: query.limit,
        page: query.page,
      }),
    };
  }

  @Get('anomalies/:id')
  @Roles(AppRole.ADMIN, AppRole.RESPONSABLE_ZONE)
  async getAnomalyById(@Req() req: any, @Param('id') id: string) {
    const anomaly = await this.anomalyDetectionService!.findById(id);
    if (!anomaly) {
      throw new NotFoundException('Anomaly not found');
    }
    this.assertAnomalyAccess(req.user as AiRequestUser, anomaly);
    return { message: 'Anomaly', data: anomaly };
  }

  @Post('anomalies/:id/acknowledge')
  @Roles(AppRole.ADMIN, AppRole.RESPONSABLE_ZONE)
  async acknowledgeAnomaly(@Req() req: any, @Param('id') id: string, @Body() dto: ReviewAnomalyDto) {
    const anomaly = await this.anomalyDetectionService!.findById(id);
    if (!anomaly) {
      throw new NotFoundException('Anomaly not found');
    }
    this.assertAnomalyAccess(req.user as AiRequestUser, anomaly);

    const updated = await this.anomalyDetectionService!.acknowledge(id, dto.note);
    return { message: 'Anomaly acknowledged', data: updated };
  }

  @Post('anomalies/:id/resolve')
  @Roles(AppRole.ADMIN, AppRole.RESPONSABLE_ZONE)
  async resolveAnomaly(@Req() req: any, @Param('id') id: string, @Body() dto: ReviewAnomalyDto) {
    const anomaly = await this.anomalyDetectionService!.findById(id);
    if (!anomaly) {
      throw new NotFoundException('Anomaly not found');
    }
    this.assertAnomalyAccess(req.user as AiRequestUser, anomaly);

    const updated = await this.anomalyDetectionService!.resolve(id, dto.note);
    return { message: 'Anomaly resolved', data: updated };
  }

  @Post('anomalies/:id/false-positive')
  @Roles(AppRole.ADMIN, AppRole.RESPONSABLE_ZONE)
  async markAnomalyFalsePositive(@Req() req: any, @Param('id') id: string, @Body() dto: ReviewAnomalyDto) {
    const anomaly = await this.anomalyDetectionService!.findById(id);
    if (!anomaly) {
      throw new NotFoundException('Anomaly not found');
    }
    this.assertAnomalyAccess(req.user as AiRequestUser, anomaly);

    const updated = await this.anomalyDetectionService!.markFalsePositive(id, dto.note);
    return { message: 'Anomaly marked as false positive', data: updated };
  }

  /** ADMIN => latest GLOBAL report. RESPONSABLE_ZONE => latest report of their own zone only, never the global one. */
  @Get('reports/latest')
  @Roles(AppRole.ADMIN, AppRole.RESPONSABLE_ZONE)
  async getLatestReport(@Req() req: any) {
    const zoneId = scopeZoneId(resolveAiScope(req.user as AiRequestUser));
    return {
      message: zoneId ? `Latest executive report for zone ${zoneId}` : 'Latest global executive report',
      data: await this.executiveReportService.findLatest(zoneId),
    };
  }

  /** ADMIN => all reports. RESPONSABLE_ZONE => only their own zone's reports, never bypassable via a zoneId query param. */
  @Get('reports')
  @Roles(AppRole.ADMIN, AppRole.RESPONSABLE_ZONE)
  async listReports(@Req() req: any, @Query() query: ListQueryDto) {
    const zoneId = scopeZoneId(resolveAiScope(req.user as AiRequestUser));
    return {
      message: zoneId ? `Executive reports for zone ${zoneId}` : 'All executive reports',
      data: await this.executiveReportService.findAll(query.limit ?? 30, zoneId),
    };
  }

  /** A specific report by id — 403 (not a silent empty result) if it exists but belongs to another zone/is global while the requester is a RESPONSABLE_ZONE. */
  @Get('reports/:id')
  @Roles(AppRole.ADMIN, AppRole.RESPONSABLE_ZONE)
  async getReportById(@Req() req: any, @Param('id') id: string) {
    const report = await this.executiveReportService.findById(id);
    if (!report) {
      throw new NotFoundException('Report not found');
    }
    this.assertReportAccess(req.user as AiRequestUser, report);
    return { message: 'Executive report', data: report };
  }

  @Get('reports/:id/pdf')
  @Roles(AppRole.ADMIN, AppRole.RESPONSABLE_ZONE)
  @Header('Content-Type', 'application/pdf')
  async getReportPdf(@Req() req: any, @Param('id') id: string, @Res() res: Response) {
    const report = await this.executiveReportService.findById(id);
    if (!report) {
      throw new NotFoundException('Report not found');
    }
    this.assertReportAccess(req.user as AiRequestUser, report);

    const pdf = await this.executiveReportPdfService.generate(report);
    res.setHeader('Content-Disposition', `attachment; filename="rapport-ia-${report.scope.toLowerCase()}-${id}.pdf"`);
    res.send(pdf);
  }

  /** A report is accessible to a RESPONSABLE_ZONE only if it's scoped to exactly their zone; a GLOBAL report or another zone's report is refused with 403. */
  private assertReportAccess(user: AiRequestUser, report: { scope: 'GLOBAL' | 'ZONE'; zoneId?: string }): void {
    if (user.role === AppRole.ADMIN) {
      return;
    }
    if (report.scope !== 'ZONE') {
      throw new ForbiddenException('You are not authorized to access the global report');
    }
    assertZoneAccess(user, report.zoneId);
  }

  private assertAnomalyAccess(user: AiRequestUser, anomaly: { zoneId?: string }): void {
    if (user.role === AppRole.ADMIN) {
      return;
    }
    assertZoneAccess(user, anomaly.zoneId);
  }
}
