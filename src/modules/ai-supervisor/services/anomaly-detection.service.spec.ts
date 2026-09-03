import { AnomalyDetectionService } from './anomaly-detection.service';
import { AnomalyResult } from '../reports/schemas/anomaly-result.schema';
import { NetworkSnapshot } from '../reports/schemas/network-snapshot.schema';
import { Reclamation } from '../../reclamations/schemas/reclamation.schema';
import { Contract } from '../../contracts/schemas/contract.schema';
import { AiMetricsService } from './ai-metrics.service';

function createQueryResult<T>(value: T) {
  return {
    sort: jest.fn().mockReturnThis(),
    skip: jest.fn().mockReturnThis(),
    limit: jest.fn().mockReturnThis(),
    exec: jest.fn(async () => value),
  };
}

describe('AnomalyDetectionService', () => {
  it('supports acknowledge / resolve / false positive transitions', async () => {
    const anomalyModel = {
      findByIdAndUpdate: jest.fn((_id: string, update: Record<string, unknown>) => ({
        exec: jest.fn(async () => {
          const status = (update as { $set?: { status?: string }; status?: string }).$set?.status ?? (update as { status?: string }).status ?? 'ACKNOWLEDGED';
          return { _id: 'a1', status };
        }),
      })),
      findById: jest.fn(async () => ({ _id: 'a1', zoneId: 'zone-1' })),
      findOneAndUpdate: jest.fn(),
      find: jest.fn(),
      countDocuments: jest.fn(),
    } as any;

    const snapshotModel = { find: jest.fn(() => createQueryResult([])) } as any;
    const reclamationModel = { find: jest.fn(() => createQueryResult([])) } as any;
    const contractModel = { find: jest.fn(() => createQueryResult([])) } as any;
    const dataAggregator = {
      findAllZones: jest.fn(async () => []),
      findAllNros: jest.fn(async () => []),
      findAllFdts: jest.fn(async () => []),
      findAllContracts: jest.fn(async () => []),
      findAllReclamations: jest.fn(async () => []),
    } as any;
    const anomalyExplanationAgent = { explain: jest.fn(async () => null) } as any;
    const recommendationsService = { ingest: jest.fn(async () => []) } as any;
    const aiMetricsService = new AiMetricsService();
    const websocketBroadcastGateway = { broadcastToZone: jest.fn(), broadcastEvent: jest.fn() } as any;
    const alertEngineService = { findActive: jest.fn() } as any;

    const service = new AnomalyDetectionService(
      anomalyModel,
      snapshotModel,
      reclamationModel,
      contractModel,
      dataAggregator,
      anomalyExplanationAgent,
      recommendationsService,
      aiMetricsService,
      websocketBroadcastGateway,
      alertEngineService,
    );

    await expect(service.acknowledge('a1', 'ok')).resolves.toMatchObject({ status: 'ACKNOWLEDGED' });
    await expect(service.resolve('a1', 'fixed')).resolves.toMatchObject({ status: 'RESOLVED' });
    await expect(service.markFalsePositive('a1', 'noise')).resolves.toMatchObject({ status: 'FALSE_POSITIVE' });
  });

  it('reuses the same in-flight run for concurrent callers', async () => {
    let releaseSnapshots!: () => void;
    const snapshotGate = new Promise<void>((resolve) => {
      releaseSnapshots = resolve;
    });

    const anomalyModel = {
      findOneAndUpdate: jest.fn(),
      findByIdAndUpdate: jest.fn(),
      findById: jest.fn(),
      find: jest.fn(),
      countDocuments: jest.fn(),
    } as any;

    const snapshotModel = {
      find: jest.fn(() => ({
        sort: jest.fn().mockReturnThis(),
        exec: jest.fn(async () => {
          await snapshotGate;
          return [];
        }),
      })),
    } as any;
    const reclamationModel = { find: jest.fn(() => createQueryResult([])) } as any;
    const contractModel = { find: jest.fn(() => createQueryResult([])) } as any;
    const dataAggregator = {
      findAllZones: jest.fn(async () => [{ _id: 'zone-1', name: 'Zone 1' }]),
      findAllNros: jest.fn(async () => []),
      findAllFdts: jest.fn(async () => []),
      findAllContracts: jest.fn(async () => []),
      findAllReclamations: jest.fn(async () => []),
    } as any;
    const anomalyExplanationAgent = { explain: jest.fn(async () => null) } as any;
    const recommendationsService = { ingest: jest.fn(async () => []) } as any;
    const aiMetricsService = new AiMetricsService();
    const websocketBroadcastGateway = { broadcastToZone: jest.fn(), broadcastEvent: jest.fn() } as any;
    const alertEngineService = { findActive: jest.fn() } as any;

    const service = new AnomalyDetectionService(
      anomalyModel,
      snapshotModel,
      reclamationModel,
      contractModel,
      dataAggregator,
      anomalyExplanationAgent,
      recommendationsService,
      aiMetricsService,
      websocketBroadcastGateway,
      alertEngineService,
    );

    const first = service.run();
    const second = service.run();

    expect(first).toBe(second);

    await new Promise((resolve) => setTimeout(resolve, 10));
    expect(snapshotModel.find).toHaveBeenCalledTimes(3);

    releaseSnapshots();
    await Promise.all([first, second]);

    expect(snapshotModel.find).toHaveBeenCalledTimes(3);
  });
});
