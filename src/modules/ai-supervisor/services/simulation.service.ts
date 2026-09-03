import { Injectable } from '@nestjs/common';

export type SimulationScenario = {
  name: string;
  description: string;
  projectedValuePct: number;
  improvementPct: number; // positive = reduction in occupation/saturation
  /** Only set by simulateRedistribution: the source/target split behind projectedValuePct
   *  (which is just max(source,target)) — needed when a proposal must show "old NRO -> X%,
   *  new NRO -> Y%" as two separate numbers instead of one combined figure. */
  sourceAfterPct?: number;
  targetAfterPct?: number;
};

// Exported (not just module-local) so InfrastructurePlannerAgent reuses the exact same defaults
// SimulationService already uses elsewhere, instead of guessing its own "typical" capacity.
export const TYPICAL_FDT_PORTS = 32;
export const TYPICAL_NRO_CAPACITY_GB = 300;

/**
 * Pure, deterministic what-if calculator — no LLM involved. Agents run candidate scenarios
 * through this before recommending, so "expectedImprovement" is a real computed number instead
 * of prose the LLM guessed. Kept intentionally simple (capacity arithmetic, not queueing
 * theory): good enough to rank scenarios and give an admin a credible before/after, not meant
 * to be a network simulator.
 */
@Injectable()
export class SimulationService {
  /** FDT capacity: what happens to occupation% if we add `addedPorts` to the pool. */
  simulateAddFdtCapacity(usedPorts: number, currentTotalPorts: number, addedPorts = TYPICAL_FDT_PORTS): SimulationScenario {
    const currentPct = currentTotalPorts > 0 ? (usedPorts / currentTotalPorts) * 100 : 0;
    const newTotal = currentTotalPorts + addedPorts;
    const projectedValuePct = newTotal > 0 ? (usedPorts / newTotal) * 100 : 0;
    return {
      name: 'CREATE_FDT',
      description: `Ajout d'un FDT de ${addedPorts} ports`,
      projectedValuePct: Math.round(projectedValuePct * 10) / 10,
      improvementPct: Math.round((currentPct - projectedValuePct) * 10) / 10,
    };
  }

  /** NRO capacity: what happens to saturation% if we add `addedCapacityGb` to maxCapacity. */
  simulateAddNroCapacity(currentLoad: number, currentMaxCapacity: number, addedCapacityGb = TYPICAL_NRO_CAPACITY_GB): SimulationScenario {
    const currentPct = currentMaxCapacity > 0 ? (currentLoad / currentMaxCapacity) * 100 : 0;
    const newCapacity = currentMaxCapacity + addedCapacityGb;
    const projectedValuePct = newCapacity > 0 ? (currentLoad / newCapacity) * 100 : 0;
    return {
      name: 'CREATE_NRO',
      description: `Ajout d'un NRO / extension de ${addedCapacityGb}Gb`,
      projectedValuePct: Math.round(projectedValuePct * 10) / 10,
      improvementPct: Math.round((currentPct - projectedValuePct) * 10) / 10,
    };
  }

  /** Redistribution: move `moveFraction` of the overloaded entity's load onto a target with spare capacity. */
  simulateRedistribution(
    sourceLoad: number,
    sourceCapacity: number,
    targetLoad: number,
    targetCapacity: number,
    moveFraction = 0.3,
  ): SimulationScenario {
    const currentPct = sourceCapacity > 0 ? (sourceLoad / sourceCapacity) * 100 : 0;
    const moved = sourceLoad * moveFraction;
    const projectedSourcePct = sourceCapacity > 0 ? ((sourceLoad - moved) / sourceCapacity) * 100 : 0;
    const projectedTargetPct = targetCapacity > 0 ? ((targetLoad + moved) / targetCapacity) * 100 : 0;

    return {
      name: 'MOVE_CONTRACTS',
      description: `Redistribution de ${Math.round(moveFraction * 100)}% de la charge vers une ressource moins chargee`,
      projectedValuePct: Math.round(Math.max(projectedSourcePct, projectedTargetPct) * 10) / 10,
      improvementPct: Math.round((currentPct - projectedSourcePct) * 10) / 10,
      sourceAfterPct: Math.round(projectedSourcePct * 10) / 10,
      targetAfterPct: Math.round(projectedTargetPct * 10) / 10,
    };
  }

  /** Zone split: contracts (and their load) roughly halved between two new sub-zones. */
  simulateSplitZone(currentLoadPct: number): SimulationScenario {
    const projectedValuePct = currentLoadPct / 2;
    return {
      name: 'SPLIT_ZONE',
      description: 'Scission de la zone en deux sous-zones',
      projectedValuePct: Math.round(projectedValuePct * 10) / 10,
      improvementPct: Math.round((currentLoadPct - projectedValuePct) * 10) / 10,
    };
  }

  /** Picks the scenario with the largest improvement among candidates. */
  chooseBestScenario(scenarios: SimulationScenario[]): SimulationScenario | null {
    if (scenarios.length === 0) return null;
    return [...scenarios].sort((a, b) => b.improvementPct - a.improvementPct)[0];
  }

  formatImprovement(before: number, scenario: SimulationScenario): string {
    return `${Math.round(before)}% -> ${Math.round(scenario.projectedValuePct)}% apres ${scenario.description} (-${Math.round(scenario.improvementPct)} pts)`;
  }
}
