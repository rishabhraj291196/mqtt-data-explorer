import { Injectable } from '@nestjs/common';
import { createEmptyRuntime, MachineRuntime } from '../machines/machine.types';

/**
 * In-memory runtime state for every simulated machine.
 *
 * Lives in the global core module so that both the simulator (writer) and the
 * machines module (reader) can reach it without a circular dependency.
 */
@Injectable()
export class RuntimeRegistry {
  private readonly runtimes = new Map<string, MachineRuntime>();

  get(machineId: string): MachineRuntime {
    const existing = this.runtimes.get(machineId);
    if (existing) return existing;
    const fresh = createEmptyRuntime();
    this.runtimes.set(machineId, fresh);
    return fresh;
  }

  patch(machineId: string, patch: Partial<MachineRuntime>): MachineRuntime {
    const next = { ...this.get(machineId), ...patch };
    this.runtimes.set(machineId, next);
    return next;
  }

  increment(machineId: string, key: 'messagesSent' | 'errorCount'): void {
    const current = this.get(machineId);
    this.runtimes.set(machineId, { ...current, [key]: current[key] + 1 });
  }

  reset(machineId: string): MachineRuntime {
    const fresh = createEmptyRuntime();
    this.runtimes.set(machineId, fresh);
    return fresh;
  }

  remove(machineId: string): void {
    this.runtimes.delete(machineId);
  }
}
