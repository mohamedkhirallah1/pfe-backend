import { SimulationService } from './simulation.service';

describe('SimulationService', () => {
  const service = new SimulationService();

  it('simulateAddFdtCapacity computes a real before/after occupation percentage', () => {
    const scenario = service.simulateAddFdtCapacity(30, 32, 32); // 93.75% -> add 32 ports
    expect(scenario.projectedValuePct).toBeCloseTo((30 / 64) * 100, 1);
    expect(scenario.improvementPct).toBeGreaterThan(0);
  });

  it('simulateRedistribution reports source and target after-percentages separately', () => {
    const scenario = service.simulateRedistribution(94, 100, 0, 300, 0.3);
    // 30% of a load of 94 = 28.2 moved
    expect(scenario.sourceAfterPct).toBeCloseTo(((94 - 28.2) / 100) * 100, 0);
    expect(scenario.targetAfterPct).toBeCloseTo((28.2 / 300) * 100, 0);
    expect(scenario.sourceAfterPct).toBeLessThan(94);
  });

  // Test 12/13: comparing scenarios picks the one with the larger improvement, not a fixed
  // preference for one action type over another.
  it('chooseBestScenario picks ADD_FDT when it improves saturation more than the alternative', () => {
    const addFdt = service.simulateAddFdtCapacity(93, 100, 64); // big capacity bump
    const redistribute = service.simulateRedistribution(93, 100, 90, 95, 0.05); // tiny move
    const best = service.chooseBestScenario([addFdt, redistribute]);
    expect(best?.name).toBe('CREATE_FDT');
  });

  it('chooseBestScenario picks the redistribution when it improves saturation more', () => {
    const addFdt = service.simulateAddFdtCapacity(93, 100, 4); // tiny capacity bump
    const redistribute = service.simulateRedistribution(93, 100, 10, 200, 0.5); // big move to a mostly-empty target
    const best = service.chooseBestScenario([addFdt, redistribute]);
    expect(best?.name).toBe('MOVE_CONTRACTS');
  });

  it('chooseBestScenario returns null for an empty list', () => {
    expect(service.chooseBestScenario([])).toBeNull();
  });

  it('formatImprovement renders a human-readable before -> after string', () => {
    const scenario = service.simulateAddNroCapacity(94, 100, 300);
    const text = service.formatImprovement(94, scenario);
    expect(text).toContain('94%');
    expect(text).toContain('->');
  });
});
