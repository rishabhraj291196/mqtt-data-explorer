import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import { mkdir, readFile, rename, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { WorkspacesStore } from '../workspaces/workspaces.store';
import { buildSeedMachine, generateDeviceId } from './machine.defaults';
import { Machine } from './machine.types';

/**
 * File-backed persistence for machine definitions.
 *
 * Deliberately dependency-free: the simulator only ever holds a handful of
 * device configs, so a single JSON file (written atomically) is plenty.
 *
 * Every read takes a `workspaceId`. There is no lookup by id alone, which is
 * what makes it impossible for one project to reach another's machines even
 * if a caller forgets to filter.
 */
@Injectable()
export class MachinesStore implements OnModuleInit {
  private readonly logger = new Logger(MachinesStore.name);
  private readonly file =
    process.env.DATA_FILE ?? join(process.cwd(), 'data', 'machines.json');

  private machines: Machine[] = [];
  private writeChain: Promise<void> = Promise.resolve();

  constructor(private readonly workspaces: WorkspacesStore) {}

  async onModuleInit(): Promise<void> {
    // Machines saved before workspaces existed need one to be adopted into.
    await this.workspaces.ready();
    await this.load();
  }

  list(workspaceId: string): Machine[] {
    return this.machines
      .filter((machine) => machine.workspaceId === workspaceId)
      .map((machine) => ({ ...machine }));
  }

  /** Every machine regardless of project — boot autostart and tallies only. */
  listAll(): Machine[] {
    return this.machines.map((machine) => ({ ...machine }));
  }

  find(workspaceId: string, id: string): Machine | undefined {
    const machine = this.machines.find(
      (item) => item.id === id && item.workspaceId === workspaceId,
    );
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

  async replace(
    workspaceId: string,
    id: string,
    machine: Machine,
  ): Promise<Machine> {
    const index = this.indexOf(workspaceId, id);
    if (index === -1) throw new Error(`Machine ${id} not found`);
    const updated: Machine = {
      ...machine,
      updatedAt: new Date().toISOString(),
    };
    this.machines[index] = updated;
    await this.persist();
    return { ...updated };
  }

  async remove(workspaceId: string, id: string): Promise<boolean> {
    const index = this.indexOf(workspaceId, id);
    if (index === -1) return false;
    this.machines.splice(index, 1);
    await this.persist();
    return true;
  }

  /** Used when a whole workspace goes away. Returns what was removed. */
  async removeAllIn(workspaceId: string): Promise<Machine[]> {
    const removed = this.machines.filter(
      (machine) => machine.workspaceId === workspaceId,
    );
    if (removed.length === 0) return [];
    this.machines = this.machines.filter(
      (machine) => machine.workspaceId !== workspaceId,
    );
    await this.persist();
    return removed.map((machine) => ({ ...machine }));
  }

  private indexOf(workspaceId: string, id: string): number {
    return this.machines.findIndex(
      (item) => item.id === id && item.workspaceId === workspaceId,
    );
  }

  private async load(): Promise<void> {
    const defaultWorkspaceId = this.workspaces.defaultId();

    try {
      const raw = await readFile(this.file, 'utf8');
      const parsed: unknown = JSON.parse(raw);
      const loaded = Array.isArray(parsed) ? (parsed as Machine[]) : [];

      let migrated = 0;
      this.machines = loaded.map((machine) => {
        const patched = { ...machine };
        // Pre-workspace machines — and any whose project has since been
        // deleted by hand — are adopted rather than left unreachable.
        if (
          !patched.workspaceId ||
          !this.workspaces.exists(patched.workspaceId)
        ) {
          patched.workspaceId = defaultWorkspaceId;
          migrated += 1;
        }
        // Machines saved before device identities existed get one now.
        if (!patched.deviceId) {
          patched.deviceIdFormat = patched.deviceIdFormat ?? 'numeric';
          patched.deviceId = generateDeviceId(patched.deviceIdFormat);
          migrated += 1;
        }
        return patched;
      });
      if (migrated > 0) await this.persist();

      this.logger.log(
        `Loaded ${this.machines.length} machine(s) from ${this.file}`,
      );
    } catch (error) {
      const err = error as NodeJS.ErrnoException;
      if (err.code === 'ENOENT') {
        this.machines = [
          buildSeedMachine(
            randomUUID(),
            defaultWorkspaceId,
            new Date().toISOString(),
          ),
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
