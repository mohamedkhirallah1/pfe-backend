import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { AutoRepairAgent } from './agents/auto-repair.agent';
import { AnomalyExplanationAgent } from './agents/anomaly-explanation.agent';
import { ComplaintIntelligenceAgent } from './agents/complaint-intelligence.agent';
import { FdtCapacityAgent } from './agents/fdt-capacity.agent';
import { GeospatialAgent } from './agents/geospatial.agent';
import { HealthMonitoringAgent } from './agents/health-monitoring.agent';
import { InfrastructurePlannerAgent } from './agents/infrastructure-planner.agent';
import { NetworkAnalysisAgent } from './agents/network-analysis.agent';
import { SaturationPredictionAgent } from './agents/saturation-prediction.agent';
import { TopologyAgent } from './agents/topology.agent';
import { ZoneHealthAgent } from './agents/zone-health.agent';
import { AiSupervisorController } from './controllers/ai-supervisor.controller';
import { SupervisorSchedulerService } from './jobs/supervisor-scheduler.service';
import { AiRecommendation, AiRecommendationSchema } from './recommendations/schemas/recommendation.schema';
import { RecommendationsService } from './recommendations/recommendations.service';
import { AnomalyResult, AnomalyResultSchema } from './reports/schemas/anomaly-result.schema';
import { AiAlert, AiAlertSchema } from './reports/schemas/alert.schema';
import { ExecutiveReport, ExecutiveReportSchema } from './reports/schemas/executive-report.schema';
import { NetworkSnapshot, NetworkSnapshotSchema } from './reports/schemas/network-snapshot.schema';
import { ExecutiveReportService } from './reports/executive-report.service';
import { ExecutiveReportPdfService } from './reports/executive-report-pdf.service';
import { AiMetricsService } from './services/ai-metrics.service';
import { AlertEngineService } from './services/alert-engine.service';
import { AnomalyDetectionService } from './services/anomaly-detection.service';
import { AppHealthService } from './services/app-health.service';
import { AutoCorrectionService } from './services/auto-correction.service';
import { DataAggregatorService } from './services/data-aggregator.service';
import { ExplanationCacheService } from './services/explanation-cache.service';
import { GroqService } from './services/groq.service';
import { SimulationService } from './services/simulation.service';
import { SnapshotService } from './services/snapshot.service';
import { CentralFiber, CentralFiberSchema } from '../central-fiber/schemas/central-fiber.schema';
import { CentraleModule } from '../centrale/centrale.module';
import { ContractsModule } from '../contracts/contracts.module';
import { FdtModule } from '../fdt/fdt.module';
import { NotificationsModule } from '../notifications/notifications.module';
import { NroModule } from '../nro/nro.module';
import { ReclamationsModule } from '../reclamations/reclamations.module';
import { WebsocketServerModule } from '../websocket-server/websocket-server.module';
import { ZonesModule } from '../zones/zones.module';
import { UsersModule } from '../users/users.module';

/**
 * Dedicated, self-contained supervisor module. Only reads from business modules (Zones, FDT,
 * NRO, Contracts, Reclamations, Centrale, CentralFiber) through their existing services/models —
 * none of them are modified by this module. CentralFiberModule doesn't export MongooseModule
 * (unlike the others), so its schema is registered directly here for read access.
 */
@Module({
  imports: [
    MongooseModule.forFeature([
      { name: AiRecommendation.name, schema: AiRecommendationSchema },
      { name: AnomalyResult.name, schema: AnomalyResultSchema },
      { name: AiAlert.name, schema: AiAlertSchema },
      { name: ExecutiveReport.name, schema: ExecutiveReportSchema },
      { name: NetworkSnapshot.name, schema: NetworkSnapshotSchema },
      { name: CentralFiber.name, schema: CentralFiberSchema },
    ]),
    ZonesModule,
    FdtModule,
    NroModule,
    ContractsModule,
    ReclamationsModule,
    CentraleModule,
    NotificationsModule,
    WebsocketServerModule,
    UsersModule,
  ],
  controllers: [AiSupervisorController],
  providers: [
    AiMetricsService,
    GroqService,
    ExplanationCacheService,
    DataAggregatorService,
    AutoCorrectionService,
    AppHealthService,
    SnapshotService,
    SimulationService,
    AlertEngineService,
    AnomalyExplanationAgent,
    AnomalyDetectionService,
    AutoRepairAgent,
    HealthMonitoringAgent,
    ZoneHealthAgent,
    SaturationPredictionAgent,
    FdtCapacityAgent,
    ComplaintIntelligenceAgent,
    TopologyAgent,
    GeospatialAgent,
    NetworkAnalysisAgent,
    InfrastructurePlannerAgent,
    RecommendationsService,
    ExecutiveReportService,
    ExecutiveReportPdfService,
    SupervisorSchedulerService,
  ],
  exports: [SupervisorSchedulerService],
})
export class AiSupervisorModule {}
