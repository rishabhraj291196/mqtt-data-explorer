import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { EventsService } from '../core/events.service';
import { PayloadGenerator } from '../core/payload.generator';
import { RuntimeRegistry } from '../core/runtime.registry';
import { WorkspacesStore } from '../workspaces/workspaces.store';
import { CreateMachineDto, UpdateMachineDto } from './dto/machine.dto';
import { generateDeviceId } from './machine.defaults';
import {
  DeviceIdFormat,
  Machine,
  MachineStats,
  MachineWithRuntime,
} from './machine.types';
import { MachinesStore } from './machines.store';

export const MACHINE_CREATED = 'machine.created';
export const MACHINE_UPDATED = 'machine.updated';
export const MACHINE_DELETED = 'machine.deleted';
/** Same config, new project — the simulator re-tags without reconnecting. */
export const MACHINE_MOVED = 'machine.moved';

/** Per-project tallies for the workspace switcher. */
export interface WorkspaceTally {
  machineCount: number;
  runningCount: number;
}

@Injectable()
export class MachinesService {
  constructor(
    private readonly store: MachinesStore,
    private readonly runtimes: RuntimeRegistry,
    private readonly generator: PayloadGenerator,
    private readonly events: EventsService,
    private readonly emitter: EventEmitter2,
    private readonly workspaces: WorkspacesStore,
  ) {}

  findAll(workspaceId: string): MachineWithRuntime[] {
    return this.store
      .list(workspaceId)
      .map((machine) => this.withRuntime(machine));
  }

  /** Every machine in every project — boot autostart only. */
  findAllAcrossWorkspaces(): Machine[] {
    return this.store.listAll();
  }

  /** Small, poll-friendly snapshot of the workspace's live counters. */
  stats(workspaceId: string): MachineStats[] {
    return this.store.list(workspaceId).map((machine) => {
      const runtime = this.runtimes.get(machine.id);
      return {
        id: machine.id,
        status: runtime.status,
        messagesSent: runtime.messagesSent,
        errorCount: runtime.errorCount,
        lastPublishAt: runtime.lastPublishAt,
        lastError: runtime.lastError,
      };
    });
  }

  /**
   * How many machines each project holds, and how many are live. Only counts
   * cross the workspace boundary — never a machine itself.
   */
  countByWorkspace(): Map<string, WorkspaceTally> {
    const counts = new Map<string, WorkspaceTally>();
    for (const machine of this.store.listAll()) {
      const tally = counts.get(machine.workspaceId) ?? {
        machineCount: 0,
        runningCount: 0,
      };
      tally.machineCount += 1;
      if (this.runtimes.get(machine.id).status === 'running') {
        tally.runningCount += 1;
      }
      counts.set(machine.workspaceId, tally);
    }
    return counts;
  }

  findOne(workspaceId: string, id: string): MachineWithRuntime {
    return this.withRuntime(this.getConfig(workspaceId, id));
  }

  /**
   * Raw config without runtime — used by the simulator. Throws for a machine
   * that belongs to another workspace, exactly as it does for one that does
   * not exist: from this project's point of view there is no difference.
   */
  getConfig(workspaceId: string, id: string): Machine {
    const machine = this.store.find(workspaceId, id);
    if (!machine) throw new NotFoundException(`Machine ${id} not found`);
    return machine;
  }

  async create(
    workspaceId: string,
    dto: CreateMachineDto,
  ): Promise<MachineWithRuntime> {
    this.assertTemplateIsUsable(dto.publish.payloadTemplate);
    const format = dto.deviceIdFormat ?? 'numeric';
    const created = await this.store.insert({
      workspaceId,
      name: dto.name.trim(),
      description: dto.description?.trim(),
      deviceIdFormat: format,
      deviceId: this.resolveDeviceId(format, dto.deviceId),
      broker: {
        url: dto.broker.url.trim(),
        username: dto.broker.username || undefined,
        password: dto.broker.password || undefined,
        clientId: dto.broker.clientId || undefined,
        keepalive: dto.broker.keepalive ?? 60,
        cleanSession: dto.broker.cleanSession ?? true,
      },
      publish: {
        topic: dto.publish.topic.trim(),
        qos: dto.publish.qos ?? 0,
        retain: dto.publish.retain ?? false,
        intervalMs: dto.publish.intervalMs,
        payloadTemplate: dto.publish.payloadTemplate,
      },
      autoStart: dto.autoStart ?? false,
    });

    this.events.emit({
      type: 'machine',
      workspaceId,
      machineId: created.id,
      machineName: created.name,
      message: 'Machine created',
    });
    this.emitter.emit(MACHINE_CREATED, created);
    return this.withRuntime(created);
  }

  async update(
    workspaceId: string,
    id: string,
    dto: UpdateMachineDto,
  ): Promise<MachineWithRuntime> {
    const existing = this.getConfig(workspaceId, id);
    if (dto.publish?.payloadTemplate) {
      this.assertTemplateIsUsable(dto.publish.payloadTemplate);
    }

    const format = dto.deviceIdFormat ?? existing.deviceIdFormat;
    const merged: Machine = {
      ...existing,
      name: dto.name?.trim() ?? existing.name,
      description:
        dto.description === undefined
          ? existing.description
          : dto.description.trim(),
      deviceIdFormat: format,
      deviceId:
        dto.deviceId?.trim() ||
        // A format switch (numeric ⇄ alphanumeric) mints a matching id.
        (format === existing.deviceIdFormat
          ? existing.deviceId
          : this.resolveDeviceId(format, undefined)),
      autoStart: dto.autoStart ?? existing.autoStart,
      broker: dto.broker
        ? {
            url: dto.broker.url.trim(),
            username: dto.broker.username || undefined,
            password: dto.broker.password || undefined,
            clientId: dto.broker.clientId || undefined,
            keepalive: dto.broker.keepalive ?? existing.broker.keepalive ?? 60,
            cleanSession:
              dto.broker.cleanSession ?? existing.broker.cleanSession ?? true,
          }
        : existing.broker,
      publish: dto.publish
        ? {
            topic: dto.publish.topic.trim(),
            qos: dto.publish.qos ?? existing.publish.qos,
            retain: dto.publish.retain ?? existing.publish.retain,
            intervalMs: dto.publish.intervalMs,
            payloadTemplate: dto.publish.payloadTemplate,
          }
        : existing.publish,
    };

    const updated = await this.store.replace(workspaceId, id, merged);
    this.events.emit({
      type: 'machine',
      workspaceId,
      machineId: updated.id,
      machineName: updated.name,
      message: 'Machine updated',
    });
    // The simulator listens and hot-restarts the machine if it is running.
    this.emitter.emit(MACHINE_UPDATED, updated);
    return this.withRuntime(updated);
  }

  async remove(workspaceId: string, id: string): Promise<{ ok: true }> {
    const existing = this.getConfig(workspaceId, id);
    await this.forget(existing);
    return { ok: true };
  }

  /**
   * Wipes a whole project's fleet. Each machine still goes through the same
   * teardown as a single delete, so no MQTT client is left connected.
   */
  async removeAllIn(workspaceId: string): Promise<number> {
    const removed = await this.store.removeAllIn(workspaceId);
    for (const machine of removed) {
      this.emitter.emit(MACHINE_DELETED, machine);
      this.runtimes.remove(machine.id);
    }
    return removed.length;
  }

  /**
   * Hands a machine to another project. The point of workspaces is to stop
   * deleting and re-creating the same device, so this is the escape hatch for
   * one that was filed in the wrong place.
   */
  async move(
    workspaceId: string,
    id: string,
    targetWorkspaceId: string,
  ): Promise<MachineWithRuntime> {
    const existing = this.getConfig(workspaceId, id);
    if (targetWorkspaceId === workspaceId) return this.withRuntime(existing);
    if (!this.workspaces.exists(targetWorkspaceId)) {
      throw new NotFoundException(`Workspace ${targetWorkspaceId} not found`);
    }

    const moved = await this.store.replace(workspaceId, id, {
      ...existing,
      workspaceId: targetWorkspaceId,
    });

    const target = this.workspaces.find(targetWorkspaceId);
    this.events.emit({
      type: 'machine',
      workspaceId,
      machineId: moved.id,
      machineName: moved.name,
      message: `Moved to ${target?.name ?? 'another workspace'}`,
    });
    // Nothing about the connection changed, so the runner is re-tagged rather
    // than restarted — a running machine keeps publishing straight through.
    this.emitter.emit(MACHINE_MOVED, moved);
    return this.withRuntime(moved);
  }

  /** Duplicates a machine `count` times — quick way to fake a fleet. */
  async clone(
    workspaceId: string,
    id: string,
    count = 1,
  ): Promise<MachineWithRuntime[]> {
    const source = this.getConfig(workspaceId, id);
    const existingNames = new Set(
      this.store.list(workspaceId).map((item) => item.name),
    );
    const copies: MachineWithRuntime[] = [];

    for (let index = 0; index < count; index += 1) {
      let suffix = index + 1;
      let name = `${source.name} (${suffix})`;
      while (existingNames.has(name)) {
        suffix += 1;
        name = `${source.name} (${suffix})`;
      }
      existingNames.add(name);

      const created = await this.store.insert({
        workspaceId,
        name,
        description: source.description,
        deviceIdFormat: source.deviceIdFormat,
        // Every copy is a distinct device, so it needs a distinct identity.
        deviceId:
          source.deviceIdFormat === 'custom'
            ? `${source.deviceId}-${suffix}`
            : generateDeviceId(source.deviceIdFormat),
        broker: { ...source.broker, clientId: undefined },
        publish: { ...source.publish },
        autoStart: false,
      });
      this.emitter.emit(MACHINE_CREATED, created);
      copies.push(this.withRuntime(created));
    }

    this.events.emit({
      type: 'machine',
      workspaceId,
      machineId: source.id,
      machineName: source.name,
      message: `Cloned into ${copies.length} machine(s)`,
    });
    return copies;
  }

  private async forget(machine: Machine): Promise<void> {
    // Emitted first: the simulator has to stop the runner while the config is
    // still readable.
    this.emitter.emit(MACHINE_DELETED, machine);
    await this.store.remove(machine.workspaceId, machine.id);
    this.runtimes.remove(machine.id);
    this.events.emit({
      type: 'machine',
      workspaceId: machine.workspaceId,
      machineId: machine.id,
      machineName: machine.name,
      message: 'Machine deleted',
    });
  }

  private resolveDeviceId(
    format: DeviceIdFormat,
    provided: string | undefined,
  ): string {
    const trimmed = provided?.trim();
    if (trimmed) return trimmed;
    if (format === 'custom') {
      throw new BadRequestException(
        'A custom device id is required — enter one or pick a generated format',
      );
    }
    return generateDeviceId(format);
  }

  private assertTemplateIsUsable(template: string): void {
    const error = this.generator.validate(template);
    if (error) throw new BadRequestException(error);
  }

  private withRuntime(machine: Machine): MachineWithRuntime {
    return { ...machine, runtime: this.runtimes.get(machine.id) };
  }
}
