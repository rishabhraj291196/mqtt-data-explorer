import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { EventsService } from '../core/events.service';
import { PayloadGenerator } from '../core/payload.generator';
import { RuntimeRegistry } from '../core/runtime.registry';
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

@Injectable()
export class MachinesService {
  constructor(
    private readonly store: MachinesStore,
    private readonly runtimes: RuntimeRegistry,
    private readonly generator: PayloadGenerator,
    private readonly events: EventsService,
    private readonly emitter: EventEmitter2,
  ) {}

  findAll(): MachineWithRuntime[] {
    return this.store.list().map((machine) => this.withRuntime(machine));
  }

  /** Small, poll-friendly snapshot of every machine's live counters. */
  stats(): MachineStats[] {
    return this.store.list().map((machine) => {
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

  findOne(id: string): MachineWithRuntime {
    const machine = this.store.find(id);
    if (!machine) throw new NotFoundException(`Machine ${id} not found`);
    return this.withRuntime(machine);
  }

  /** Raw config without runtime — used by the simulator. */
  getConfig(id: string): Machine {
    const machine = this.store.find(id);
    if (!machine) throw new NotFoundException(`Machine ${id} not found`);
    return machine;
  }

  async create(dto: CreateMachineDto): Promise<MachineWithRuntime> {
    this.assertTemplateIsUsable(dto.publish.payloadTemplate);
    const format = dto.deviceIdFormat ?? 'numeric';
    const created = await this.store.insert({
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
      machineId: created.id,
      machineName: created.name,
      message: 'Machine created',
    });
    this.emitter.emit(MACHINE_CREATED, created);
    return this.withRuntime(created);
  }

  async update(id: string, dto: UpdateMachineDto): Promise<MachineWithRuntime> {
    const existing = this.getConfig(id);
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

    const updated = await this.store.replace(id, merged);
    this.events.emit({
      type: 'machine',
      machineId: updated.id,
      machineName: updated.name,
      message: 'Machine updated',
    });
    // The simulator listens and hot-restarts the machine if it is running.
    this.emitter.emit(MACHINE_UPDATED, updated);
    return this.withRuntime(updated);
  }

  async remove(id: string): Promise<{ ok: true }> {
    const existing = this.getConfig(id);
    this.emitter.emit(MACHINE_DELETED, existing);
    await this.store.remove(id);
    this.runtimes.remove(id);
    this.events.emit({
      type: 'machine',
      machineId: existing.id,
      machineName: existing.name,
      message: 'Machine deleted',
    });
    return { ok: true };
  }

  /** Duplicates a machine `count` times — quick way to fake a fleet. */
  async clone(id: string, count = 1): Promise<MachineWithRuntime[]> {
    const source = this.getConfig(id);
    const existingNames = new Set(this.store.list().map((item) => item.name));
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
      machineId: source.id,
      machineName: source.name,
      message: `Cloned into ${copies.length} machine(s)`,
    });
    return copies;
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
