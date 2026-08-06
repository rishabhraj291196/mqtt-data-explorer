import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import { mkdir, readFile, rename, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { Workspace } from './workspace.types';

/**
 * File-backed persistence for workspaces — same shape as MachinesStore: a
 * single JSON file written atomically.
 */
@Injectable()
export class WorkspacesStore implements OnModuleInit {
  private readonly logger = new Logger(WorkspacesStore.name);
  private readonly file =
    process.env.WORKSPACES_FILE ??
    join(process.cwd(), 'data', 'workspaces.json');

  private workspaces: Workspace[] = [];
  private loading: Promise<void> | null = null;
  private writeChain: Promise<void> = Promise.resolve();

  onModuleInit(): Promise<void> {
    return this.ready();
  }

  /**
   * Idempotent load. MachinesStore awaits this during its own boot, because a
   * machine saved before workspaces existed has to be adopted into one.
   */
  ready(): Promise<void> {
    this.loading ??= this.load();
    return this.loading;
  }

  list(): Workspace[] {
    return this.workspaces.map((workspace) => ({ ...workspace }));
  }

  find(id: string): Workspace | undefined {
    const workspace = this.workspaces.find((item) => item.id === id);
    return workspace ? { ...workspace } : undefined;
  }

  exists(id: string): boolean {
    return this.workspaces.some((item) => item.id === id);
  }

  count(): number {
    return this.workspaces.length;
  }

  /** Where orphaned machines land. Always present once `ready()` resolved. */
  defaultId(): string {
    const first = this.workspaces[0];
    if (!first) throw new Error('WorkspacesStore was read before it was ready');
    return first.id;
  }

  async insert(
    workspace: Omit<Workspace, 'id' | 'createdAt' | 'updatedAt'>,
  ): Promise<Workspace> {
    const now = new Date().toISOString();
    const created: Workspace = {
      ...workspace,
      id: randomUUID(),
      createdAt: now,
      updatedAt: now,
    };
    this.workspaces.push(created);
    await this.persist();
    return { ...created };
  }

  async replace(id: string, workspace: Workspace): Promise<Workspace> {
    const index = this.workspaces.findIndex((item) => item.id === id);
    if (index === -1) throw new Error(`Workspace ${id} not found`);
    const updated: Workspace = {
      ...workspace,
      updatedAt: new Date().toISOString(),
    };
    this.workspaces[index] = updated;
    await this.persist();
    return { ...updated };
  }

  async remove(id: string): Promise<boolean> {
    const index = this.workspaces.findIndex((item) => item.id === id);
    if (index === -1) return false;
    this.workspaces.splice(index, 1);
    await this.persist();
    return true;
  }

  private async load(): Promise<void> {
    try {
      const raw = await readFile(this.file, 'utf8');
      const parsed: unknown = JSON.parse(raw);
      const loaded = Array.isArray(parsed) ? (parsed as Workspace[]) : [];
      this.workspaces = loaded.filter(
        (workspace) => workspace && typeof workspace.id === 'string',
      );

      // An empty or unusable file still has to leave one workspace behind:
      // machines cannot exist without a home.
      if (this.workspaces.length === 0) {
        this.workspaces = [buildDefaultWorkspace()];
        await this.persist();
      }
      this.logger.log(
        `Loaded ${this.workspaces.length} workspace(s) from ${this.file}`,
      );
      return;
    } catch (error) {
      const err = error as NodeJS.ErrnoException;
      if (err.code !== 'ENOENT') {
        this.logger.error(
          `Could not read ${this.file} (${err.message}); starting fresh`,
        );
      }
      this.workspaces = [buildDefaultWorkspace()];
      await this.persist();
      this.logger.log(`Created ${this.file} with the default workspace`);
    }
  }

  /** Serialised, atomic write — concurrent mutations never interleave. */
  private persist(): Promise<void> {
    const snapshot = JSON.stringify(this.workspaces, null, 2);
    this.writeChain = this.writeChain.then(async () => {
      try {
        await mkdir(dirname(this.file), { recursive: true });
        const tmp = `${this.file}.${process.pid}.tmp`;
        await writeFile(tmp, snapshot, 'utf8');
        await rename(tmp, this.file);
      } catch (error) {
        this.logger.error(
          `Failed to persist workspaces: ${(error as Error).message}`,
        );
      }
    });
    return this.writeChain;
  }
}

function buildDefaultWorkspace(): Workspace {
  const now = new Date().toISOString();
  return {
    id: randomUUID(),
    name: 'Default',
    description: 'Rename this to match the project you are testing.',
    color: 'sky',
    createdAt: now,
    updatedAt: now,
  };
}
