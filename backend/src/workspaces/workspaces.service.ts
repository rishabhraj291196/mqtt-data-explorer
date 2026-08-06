import {
  BadRequestException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { EventsService } from '../core/events.service';
import { MachinesService } from '../machines/machines.service';
import { CreateWorkspaceDto, UpdateWorkspaceDto } from './dto/workspace.dto';
import {
  WORKSPACE_COLORS,
  Workspace,
  WorkspaceColor,
  WorkspaceWithCount,
} from './workspace.types';
import { WorkspacesStore } from './workspaces.store';

@Injectable()
export class WorkspacesService {
  private readonly logger = new Logger(WorkspacesService.name);

  constructor(
    private readonly store: WorkspacesStore,
    private readonly machines: MachinesService,
    private readonly events: EventsService,
  ) {}

  findAll(): WorkspaceWithCount[] {
    const counts = this.machines.countByWorkspace();
    return this.store
      .list()
      .map((workspace) => this.withCounts(workspace, counts));
  }

  findOne(id: string): WorkspaceWithCount {
    const workspace = this.store.find(id);
    if (!workspace) throw new NotFoundException(`Workspace ${id} not found`);
    return this.withCounts(workspace, this.machines.countByWorkspace());
  }

  async create(dto: CreateWorkspaceDto): Promise<WorkspaceWithCount> {
    const name = dto.name.trim();
    this.assertNameIsFree(name);
    const created = await this.store.insert({
      name,
      description: dto.description?.trim() || undefined,
      color: dto.color ?? this.leastUsedColor(),
    });
    this.logger.log(`Created workspace ${created.name}`);
    return { ...created, machineCount: 0, runningCount: 0 };
  }

  async update(
    id: string,
    dto: UpdateWorkspaceDto,
  ): Promise<WorkspaceWithCount> {
    const existing = this.store.find(id);
    if (!existing) throw new NotFoundException(`Workspace ${id} not found`);

    const name = dto.name?.trim() ?? existing.name;
    if (name !== existing.name) this.assertNameIsFree(name, id);

    const updated = await this.store.replace(id, {
      ...existing,
      name,
      description:
        dto.description === undefined
          ? existing.description
          : dto.description.trim() || undefined,
      color: dto.color ?? existing.color,
    });
    return this.withCounts(updated, this.machines.countByWorkspace());
  }

  /**
   * Deleting a project takes its machines with it — they belong to nothing
   * else. Each one is removed through MachinesService, so its runner is
   * stopped and its MQTT client closed on the way out.
   */
  async remove(id: string): Promise<{ ok: true; machinesDeleted: number }> {
    const workspace = this.store.find(id);
    if (!workspace) throw new NotFoundException(`Workspace ${id} not found`);
    if (this.store.count() <= 1) {
      throw new BadRequestException(
        'The last workspace cannot be deleted — rename it instead',
      );
    }

    const machinesDeleted = await this.machines.removeAllIn(id);
    await this.store.remove(id);
    this.events.clear(id);
    this.logger.log(
      `Deleted workspace ${workspace.name} and ${machinesDeleted} machine(s)`,
    );
    return { ok: true, machinesDeleted };
  }

  private withCounts(
    workspace: Workspace,
    counts: Map<string, { machineCount: number; runningCount: number }>,
  ): WorkspaceWithCount {
    const tally = counts.get(workspace.id);
    return {
      ...workspace,
      machineCount: tally?.machineCount ?? 0,
      runningCount: tally?.runningCount ?? 0,
    };
  }

  /** Names are how people tell projects apart, so duplicates are rejected. */
  private assertNameIsFree(name: string, exceptId?: string): void {
    const clash = this.store
      .list()
      .some(
        (workspace) =>
          workspace.id !== exceptId &&
          workspace.name.toLowerCase() === name.toLowerCase(),
      );
    if (clash) {
      throw new BadRequestException(
        `A workspace named "${name}" already exists`,
      );
    }
  }

  /** Keeps new workspaces visually distinct without asking the user to pick. */
  private leastUsedColor(): WorkspaceColor {
    const used = new Map<WorkspaceColor, number>();
    for (const workspace of this.store.list()) {
      used.set(workspace.color, (used.get(workspace.color) ?? 0) + 1);
    }
    return [...WORKSPACE_COLORS].sort(
      (a, b) => (used.get(a) ?? 0) - (used.get(b) ?? 0),
    )[0];
  }
}
