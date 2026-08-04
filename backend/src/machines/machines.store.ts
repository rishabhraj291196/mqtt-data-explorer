import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import { mkdir, readFile, rename, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { buildSeedMachine, generateDeviceId } from './machine.defaults';
import { Machine } from './machine.types';

/**
 * File-backed persistence for machine definitions.
 *
 * Deliberately dependency-free: the simulator only ever holds a handful of
 * device configs, so a single JSON file (written atomically) is plenty.
 */
@Injectable()
export class MachinesStore implements OnModuleInit {
  private readonly logger = new Logger(MachinesStore.name);
  private readonly file =
    process.env.DATA_FILE ?? join(process.cwd(), 'data', 'machines.json');

  private machines: Machine[] = [];
  private writeChain: Promise<void> = Promise.resolve();

  async onModuleInit(): Promise<void> {
    await this.load();
  }

  list(): Machine[] {
    return this.machines.map((machine) => ({ ...machine }));
  }

  find(id: string): Machine | undefined {
    const machine = this.machines.find((item) => item.id === id);
    return machine ? { ...machine } : undefined;
  }

  async insert(
    machine: Omit<Machine, 'id' | 'createdAt' | 'updatedAt'>,
  ): Promise<Machine> {
    const now = new Date().toISOString();
    const created: Machine = {
      ...machine,
      id: randomUUID(),
      createdAt: now,
      updatedAt: now,
    };
    this.machines.push(created);
    await this.persist();
    return { ...created };
  }

  async replace(id: string, machine: Machine): Promise<Machine> {
    const index = this.machines.findIndex((item) => item.id === id);
    if (index === -1) throw new Error(`Machine ${id} not found`);
    const updated: Machine = {
      ...machine,
      updatedAt: new Date().toISOString(),
    };
    this.machines[index] = updated;
    await this.persist();
    return { ...updated };
  }

  async remove(id: string): Promise<boolean> {
    const index = this.machines.findIndex((item) => item.id === id);
    if (index === -1) return false;
    this.machines.splice(index, 1);
    await this.persist();
    return true;
  }

  private async load(): Promise<void> {
    try {
      const raw = await readFile(this.file, 'utf8');
      const parsed: unknown = JSON.parse(raw);
      const loaded = Array.isArray(parsed) ? (parsed as Machine[]) : [];

      // Machines saved before device identities existed get one now.
      let migrated = false;
      this.machines = loaded.map((machine) => {
        if (machine.deviceId) return machine;
        migrated = true;
        return {
          ...machine,
          deviceIdFormat: machine.deviceIdFormat ?? 'numeric',
          deviceId: generateDeviceId(machine.deviceIdFormat ?? 'numeric'),
        };
      });
      if (migrated) await this.persist();

      this.logger.log(
        `Loaded ${this.machines.length} machine(s) from ${this.file}`,
      );
    } catch (error) {
      const err = error as NodeJS.ErrnoException;
      if (err.code === 'ENOENT') {
        this.machines = [
          buildSeedMachine(randomUUID(), new Date().toISOString()),
        ];
        await this.persist();
        this.logger.log(`Created ${this.file} with one sample machine`);
        return;
      }
      this.logger.error(
        `Could not read ${this.file} (${err.message}); starting empty`,
      );
      this.machines = [];
    }
  }

  /** Serialised, atomic write — concurrent mutations never interleave. */
  private persist(): Promise<void> {
    const snapshot = JSON.stringify(this.machines, null, 2);
    this.writeChain = this.writeChain.then(async () => {
      try {
        await mkdir(dirname(this.file), { recursive: true });
        const tmp = `${this.file}.${process.pid}.tmp`;
        await writeFile(tmp, snapshot, 'utf8');
        await rename(tmp, this.file);
      } catch (error) {
        this.logger.error(
          `Failed to persist machines: ${(error as Error).message}`,
        );
      }
    });
    return this.writeChain;
  }
}
