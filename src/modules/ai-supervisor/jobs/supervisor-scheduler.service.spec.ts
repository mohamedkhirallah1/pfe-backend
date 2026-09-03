import { SupervisorSchedulerService } from './supervisor-scheduler.service';

/**
 * Minimal hand-built mocks (no Nest TestingModule needed — every dependency is plain
 * constructor injection) returning empty-but-valid results for a zero-data run, so the
 * analysis/report pipelines complete without hitting real Mongo/Groq. `topologyAgent.analyze`
 * is the one call artificially delayed and spied on: it's called exactly once per REAL run of
 * runFullAnalysis(), so counting its invocations is what proves whether N concurrent callers
 * triggered N runs or just 1.
 */
function buildScheduler(options: { topologyDelayMs?: number; failTopology?: boolean } = {}) {
  let releaseTopology!: () => void;
  const topologyGate = new Promise<void>((resolve) => {
    releaseTopology = resolve;
  });

  const topologyAnalyze = jest.fn(async (_report: unknown) => {
    if (options.topologyDelayMs) {
      await new Promise((r) => setTimeout(r, options.topologyDelayMs));
    } else {
      await topologyGate; // held open until the test explicitly releases it
    }
    if (options.failTopology) {
      throw new Error('simulated topology failure');
    }
    return { data: { recommendations: [], fixedCount: 0, pendingCount: 0, summary: '' } };
  });

  const dataAggregator = {
    findAllZones: jest.fn(async () => []),
    findAllFdts: jest.fn(async () => []),
    findAllNros: jest.fn(async () => []),
    findAllContracts: jest.fn(async () => []),
    findAllReclamations: jest.fn(async () => []),
    getGlobalCounts: jest.fn(async () => ({})),
    getZoneSnapshot: jest.fn(),
  } as any;

  const autoRepairAgent = { runAudit: jest.fn(async () => ({ fixed: [], pending: [] })) } as any;
  const healthMonitoringAgent = {} as any;
  const snapshotService = { record: jest.fn(async () => undefined), history: jest.fn(async () => []) } as any;
  const zoneHealthAgent = { computeScore: jest.fn(), explainBatch: jest.fn(async () => []) } as any;
  const saturationPredictionAgent = {
    predictForNro: jest.fn(async () => null),
    explainCriticalPredictions: jest.fn(async (p: unknown[]) => p),
  } as any;
  const fdtCapacityAgent = { analyze: jest.fn(async () => ({ data: [] })) } as any;
  const infrastructurePlannerAgent = {
    planForSaturatedNro: jest.fn(async () => null),
    planForSaturatedFdt: jest.fn(async () => null),
    explainProposalsBatch: jest.fn(async (p: unknown[]) => p),
  } as any;
  const complaintIntelligenceAgent = {
    analyze: jest.fn(async () => ({ data: { recommendations: [], alerts: [], summary: '', trend: 'STABLE' } })),
  } as any;
  const topologyAgent = { analyze: topologyAnalyze } as any;
  const geospatialAgent = { analyze: jest.fn(async () => ({ data: [] })) } as any;
  const recommendationsService = {
    ingest: jest.fn(async (recs: unknown[]) => recs),
    topRanked: jest.fn(async () => []),
  } as any;
  const alertEngineService = { raise: jest.fn(async () => []), resolve: jest.fn(async () => undefined) } as any;
  const executiveReportService = { build: jest.fn(async () => ({ _id: 'report-1' })) } as any;

  const scheduler = new SupervisorSchedulerService(
    dataAggregator,
    autoRepairAgent,
    healthMonitoringAgent,
    snapshotService,
    zoneHealthAgent,
    saturationPredictionAgent,
    fdtCapacityAgent,
    infrastructurePlannerAgent,
    complaintIntelligenceAgent,
    topologyAgent,
    geospatialAgent,
    recommendationsService,
    alertEngineService,
    executiveReportService,
  );

  return { scheduler, topologyAnalyze, recommendationsService, executiveReportService, releaseTopology };
}

describe('SupervisorSchedulerService concurrency lock', () => {
  it('a second computeFullAnalysis() call while one is in-flight reuses the same run instead of starting a new one', async () => {
    const { scheduler, topologyAnalyze, releaseTopology } = buildScheduler();

    const first = scheduler.computeFullAnalysis();
    const second = scheduler.computeFullAnalysis(); // fired immediately, before `first` resolves

    // Let the pending microtasks (findAllZones, runAudit, ...) leading up to the gated
    // topologyAgent.analyze() call actually run before asserting — the lock check itself is
    // synchronous, but the call site it's guarding is several `await`s deep.
    await new Promise((r) => setTimeout(r, 10));
    expect(topologyAnalyze).toHaveBeenCalledTimes(1); // only one real run started, despite 2 callers

    releaseTopology();
    const [resultA, resultB] = await Promise.all([first, second]);

    expect(resultA).toBe(resultB); // literally the same object — the second call got the first's result
    expect(topologyAnalyze).toHaveBeenCalledTimes(1); // still only one, after both resolved
  });

  it('three concurrent triggers (2x run/analysis + 1x run/report) result in exactly one analysis run', async () => {
    const { scheduler, topologyAnalyze, releaseTopology } = buildScheduler();

    const requestA = scheduler.computeFullAnalysis(); // run/analysis
    const requestB = scheduler.computeFullAnalysis(); // run/analysis again, immediately
    const requestC = scheduler.dailyTier(); // run/report, immediately — calls computeFullAnalysis() internally

    await new Promise((r) => setTimeout(r, 10));
    expect(topologyAnalyze).toHaveBeenCalledTimes(1);

    releaseTopology();
    await Promise.all([requestA, requestB, requestC]);

    expect(topologyAnalyze).toHaveBeenCalledTimes(1);
  });

  it('releases the lock after a successful run, allowing a genuinely new run afterwards', async () => {
    const { scheduler, topologyAnalyze } = buildScheduler({ topologyDelayMs: 5 });

    await scheduler.computeFullAnalysis();
    await scheduler.computeFullAnalysis(); // sequential, after the first fully resolved

    expect(topologyAnalyze).toHaveBeenCalledTimes(2); // two genuinely separate runs, not reused
  });

  it('releases the lock even when the run throws, and the error propagates to the caller', async () => {
    const { scheduler, topologyAnalyze } = buildScheduler({ topologyDelayMs: 5, failTopology: true });

    await expect(scheduler.computeFullAnalysis()).rejects.toThrow('simulated topology failure');

    // Lock must be released despite the failure — a second call starts a genuinely new run,
    // not "stuck forever" behind a dead lock.
    await expect(scheduler.computeFullAnalysis()).rejects.toThrow('simulated topology failure');
    expect(topologyAnalyze).toHaveBeenCalledTimes(2);
  });

  it('releases the lock correctly when a dependency call rejects due to a simulated Groq 429 exhaustion', async () => {
    // GroqService itself never throws (verified in groq.service.spec.ts) — but this proves the
    // scheduler's lock doesn't depend on that: even if some downstream call DID reject, the lock
    // still releases and a subsequent call is not permanently blocked.
    const { scheduler } = buildScheduler({ topologyDelayMs: 1, failTopology: true });

    await expect(scheduler.computeFullAnalysis()).rejects.toThrow();

    const { scheduler: freshScheduler, topologyAnalyze: freshTopologyAnalyze } = buildScheduler({ topologyDelayMs: 1 });
    await freshScheduler.computeFullAnalysis();
    expect(freshTopologyAnalyze).toHaveBeenCalledTimes(1);
  });
});
