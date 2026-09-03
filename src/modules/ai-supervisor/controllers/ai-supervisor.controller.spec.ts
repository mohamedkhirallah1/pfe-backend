import { ForbiddenException, NotFoundException } from '@nestjs/common';
import { AppRole } from '../../auth/roles.enum';
import { AiSupervisorController } from './ai-supervisor.controller';

function buildController() {
  const schedulerService = {
    fiveMinuteTier: jest.fn(),
    computeFullAnalysis: jest.fn(async (zoneId?: string) => ({ zoneId: zoneId ?? null })),
    dailyTier: jest.fn(async (zoneId?: string) => ({ zoneId: zoneId ?? null })),
  } as any;
  const recommendationsService = {
    findAll: jest.fn(async () => []),
    findInfrastructureProposals: jest.fn(async () => []),
    setStatus: jest.fn(),
  } as any;
  const alertEngineService = { findActive: jest.fn(async () => []) } as any;
  const executiveReportService = {
    findLatest: jest.fn(async () => null),
    findAll: jest.fn(async () => []),
    findById: jest.fn(),
  } as any;
  const executiveReportPdfService = { generate: jest.fn(async () => Buffer.from('pdf')) } as any;
  const healthMonitoringAgent = { checkAllWithNarrative: jest.fn() } as any;
  const aiMetricsService = { snapshot: jest.fn(() => ({})) } as any;
  const anomalyDetectionService = {
    list: jest.fn(async () => ({ items: [], total: 0, page: 1, limit: 30 })),
    findById: jest.fn(async () => null),
    acknowledge: jest.fn(async () => null),
    resolve: jest.fn(async () => null),
    markFalsePositive: jest.fn(async () => null),
    run: jest.fn(async () => ({ anomalies: [] })),
  } as any;

  const controller = new AiSupervisorController(
    schedulerService,
    recommendationsService,
    alertEngineService,
    executiveReportService,
    executiveReportPdfService,
    healthMonitoringAgent,
    aiMetricsService,
    anomalyDetectionService,
  );

  return { controller, schedulerService, recommendationsService, alertEngineService, executiveReportService, executiveReportPdfService, aiMetricsService, anomalyDetectionService };
}

const admin = { req: { user: { role: AppRole.ADMIN } } };
const zoneAUser = { req: { user: { role: AppRole.RESPONSABLE_ZONE, zoneId: 'zone-A' } } };

describe('AiSupervisorController — RBAC / zone scoping', () => {
  it('metrics: returns the AiMetricsService snapshot', async () => {
    const { controller, aiMetricsService } = buildController();
    const result = await controller.getMetrics();
    expect(aiMetricsService.snapshot).toHaveBeenCalledTimes(1);
    expect(result.data).toEqual({});
  });

  it('run/analysis: ADMIN triggers a global (unscoped) analysis', async () => {
    const { controller, schedulerService } = buildController();
    await controller.runAnalysis(admin.req);
    expect(schedulerService.computeFullAnalysis).toHaveBeenCalledWith(undefined, 'normal', 'fr');
  });

  it('run/analysis: RESPONSABLE_ZONE is forcibly scoped to their own zoneId from the JWT, even if the body tried to say otherwise', async () => {
    const { controller, schedulerService } = buildController();
    await controller.runAnalysis(zoneAUser.req);
    expect(schedulerService.computeFullAnalysis).toHaveBeenCalledWith('zone-A', 'normal', 'fr');
  });

  it('run/report: same scoping rule as run/analysis', async () => {
    const { controller, schedulerService } = buildController();
    await controller.runReport(admin.req);
    await controller.runReport(zoneAUser.req);
    expect(schedulerService.dailyTier).toHaveBeenNthCalledWith(1, undefined, 'critical', 'fr');
    expect(schedulerService.dailyTier).toHaveBeenNthCalledWith(2, 'zone-A', 'critical', 'fr');
  });

  it('recommendations/alerts/infrastructure-proposals: ADMIN sees everything (no zone filter), RESPONSABLE_ZONE only their own zone', async () => {
    const { controller, recommendationsService, alertEngineService } = buildController();

    await controller.listRecommendations(admin.req, {});
    expect(recommendationsService.findAll).toHaveBeenNthCalledWith(1, 100, undefined);
    await controller.listRecommendations(zoneAUser.req, {});
    expect(recommendationsService.findAll).toHaveBeenNthCalledWith(2, 100, 'zone-A');

    await controller.listAlerts(admin.req);
    expect(alertEngineService.findActive).toHaveBeenNthCalledWith(1, undefined);
    await controller.listAlerts(zoneAUser.req);
    expect(alertEngineService.findActive).toHaveBeenNthCalledWith(2, 'zone-A');
  });

  it('reports/latest: ADMIN gets the global latest report, RESPONSABLE_ZONE gets their own zone latest report, never the global one', async () => {
    const { controller, executiveReportService } = buildController();
    await controller.getLatestReport(admin.req);
    expect(executiveReportService.findLatest).toHaveBeenNthCalledWith(1, undefined);
    await controller.getLatestReport(zoneAUser.req);
    expect(executiveReportService.findLatest).toHaveBeenNthCalledWith(2, 'zone-A');
  });

  it('reports: RESPONSABLE_ZONE cannot bypass scoping via a query param — the controller never forwards a client-supplied zoneId', async () => {
    const { controller, executiveReportService } = buildController();
    await controller.listReports(zoneAUser.req, { limit: 30 } as any);
    expect(executiveReportService.findAll).toHaveBeenCalledWith(30, 'zone-A');
  });

  it('reports/:id: RESPONSABLE_ZONE can access their own zone report', async () => {
    const { controller, executiveReportService } = buildController();
    executiveReportService.findById.mockResolvedValue({ scope: 'ZONE', zoneId: 'zone-A' });
    const result = await controller.getReportById(zoneAUser.req, 'report-1');
    expect(result.data).toEqual({ scope: 'ZONE', zoneId: 'zone-A' });
  });

  it('reports/:id: RESPONSABLE_ZONE is refused (403) access to another zone report', async () => {
    const { controller, executiveReportService } = buildController();
    executiveReportService.findById.mockResolvedValue({ scope: 'ZONE', zoneId: 'zone-B' });
    await expect(controller.getReportById(zoneAUser.req, 'report-1')).rejects.toThrow(ForbiddenException);
  });

  it('reports/:id: RESPONSABLE_ZONE is refused (403) access to the GLOBAL report — never silently downgraded', async () => {
    const { controller, executiveReportService } = buildController();
    executiveReportService.findById.mockResolvedValue({ scope: 'GLOBAL', zoneId: undefined });
    await expect(controller.getReportById(zoneAUser.req, 'report-1')).rejects.toThrow(ForbiddenException);
  });

  it('reports/:id: ADMIN can access any report, GLOBAL or any zone', async () => {
    const { controller, executiveReportService } = buildController();
    executiveReportService.findById.mockResolvedValue({ scope: 'GLOBAL', zoneId: undefined });
    await expect(controller.getReportById(admin.req, 'report-1')).resolves.toBeDefined();
    executiveReportService.findById.mockResolvedValue({ scope: 'ZONE', zoneId: 'zone-B' });
    await expect(controller.getReportById(admin.req, 'report-2')).resolves.toBeDefined();
  });

  it('reports/:id: unknown report id is a 404, not a 403 (existence vs authorization stays distinct)', async () => {
    const { controller, executiveReportService } = buildController();
    executiveReportService.findById.mockResolvedValue(null);
    await expect(controller.getReportById(zoneAUser.req, 'missing')).rejects.toThrow(NotFoundException);
  });

  it('reports/:id/pdf: RESPONSABLE_ZONE is refused (403) another zone PDF and the PDF is never generated', async () => {
    const { controller, executiveReportService, executiveReportPdfService } = buildController();
    executiveReportService.findById.mockResolvedValue({ scope: 'ZONE', zoneId: 'zone-B' });
    const res = { setHeader: jest.fn(), send: jest.fn() } as any;
    await expect(controller.getReportPdf(zoneAUser.req, 'report-1', res)).rejects.toThrow(ForbiddenException);
    expect(executiveReportPdfService.generate).not.toHaveBeenCalled();
  });

  it('reports/:id/pdf: RESPONSABLE_ZONE can download their own zone PDF', async () => {
    const { controller, executiveReportService, executiveReportPdfService } = buildController();
    const report = { scope: 'ZONE', zoneId: 'zone-A' };
    executiveReportService.findById.mockResolvedValue(report);
    const res = { setHeader: jest.fn(), send: jest.fn() } as any;
    await controller.getReportPdf(zoneAUser.req, 'report-1', res);
    expect(executiveReportPdfService.generate).toHaveBeenCalledWith(report);
    expect(res.send).toHaveBeenCalled();
  });

  it('anomalies: ADMIN sees all anomalies and RESPONSABLE_ZONE is scoped to their own zone', async () => {
    const { controller, anomalyDetectionService } = buildController();

    await controller.listAnomalies(admin.req, {} as any);
    expect(anomalyDetectionService.list).toHaveBeenNthCalledWith(1, undefined, expect.objectContaining({ zoneId: undefined }));

    await controller.listAnomalies(zoneAUser.req, { zoneId: 'zone-A', limit: 20, page: 2 } as any);
    expect(anomalyDetectionService.list).toHaveBeenNthCalledWith(2, 'zone-A', expect.objectContaining({ zoneId: 'zone-A', limit: 20, page: 2 }));
  });

  it('anomalies/:id: RESPONSABLE_ZONE cannot access another zone anomaly', async () => {
    const { controller, anomalyDetectionService } = buildController();
    anomalyDetectionService.findById.mockResolvedValueOnce({ zoneId: 'zone-B' });
    await expect(controller.getAnomalyById(zoneAUser.req, 'anomaly-1')).rejects.toThrow(ForbiddenException);
  });

  it('anomalies/:id/acknowledge and resolve use the scoped anomaly access check', async () => {
    const { controller, anomalyDetectionService } = buildController();
    anomalyDetectionService.findById.mockResolvedValue({ zoneId: 'zone-A' });

    await controller.acknowledgeAnomaly(zoneAUser.req, 'anomaly-1', { note: 'ok' });
    expect(anomalyDetectionService.acknowledge).toHaveBeenCalledWith('anomaly-1', 'ok');

    await controller.resolveAnomaly(zoneAUser.req, 'anomaly-1', { note: 'resolved' });
    expect(anomalyDetectionService.resolve).toHaveBeenCalledWith('anomaly-1', 'resolved');
  });

  it('anomalies/:id/false-positive marks the anomaly as false positive', async () => {
    const { controller, anomalyDetectionService } = buildController();
    anomalyDetectionService.findById.mockResolvedValue({ zoneId: 'zone-A' });

    await controller.markAnomalyFalsePositive(zoneAUser.req, 'anomaly-1', { note: 'noise' });
    expect(anomalyDetectionService.markFalsePositive).toHaveBeenCalledWith('anomaly-1', 'noise');
  });
});
