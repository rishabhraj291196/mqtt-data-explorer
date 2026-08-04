import {
  Injectable,
  Logger,
  OnApplicationBootstrap,
  OnModuleDestroy,
} from '@nestjs/common';
import { OnEvent } from '@nestjs/event-emitter';
import { connect, type IClientOptions, type MqttClient } from 'mqtt';
import { EventsService } from '../core/events.service';
import { PayloadGenerator } from '../core/payload.generator';
import { RuntimeRegistry } from '../core/runtime.registry';
import {
  MACHINE_DELETED,
  MACHINE_UPDATED,
  MachinesService,
} from '../machines/machines.service';
import type { Machine, MachineRuntime } from '../machines/machine.types';

interface Runner {
  machine: Machine;
  client: MqttClient;
  timer: NodeJS.Timeout | null;
  tick: number;
  /** Throttles how often a publish is pushed to the live SSE feed. */
  lastFeedAt: number;
}

const CONNECT_TIMEOUT_MS = 10_000;
const FEED_THROTTLE_MS = 200;

@Injectable()
export class SimulatorService
  implements OnApplicationBootstrap, OnModuleDestroy
{
  private readonly logger = new Logger(SimulatorService.name);
  private readonly runners = new Map<string, Runner>();

  constructor(
    private readonly machines: MachinesService,
    private readonly generator: PayloadGenerator,
    private readonly runtimes: RuntimeRegistry,
    private readonly events: EventsService,
  ) {}

  onApplicationBootstrap(): void {
    const autoStart = this.machines.findAll().filter((item) => item.autoStart);
    for (const machine of autoStart) {
      this.logger.log(`Auto-starting ${machine.name}`);
      this.start(machine.id);
    }
  }

  onModuleDestroy(): void {
    for (const machineId of [...this.runners.keys()]) {
      this.stop(machineId);
    }
  }

  isRunning(machineId: string): boolean {
    return this.runners.has(machineId);
  }

  start(machineId: string): MachineRuntime {
    const machine = this.machines.getConfig(machineId);
    if (this.runners.has(machineId)) return this.runtimes.get(machineId);

    this.generator.resetState(machineId);
    this.runtimes.reset(machineId);
    this.setStatus(
      machine,
      'connecting',
      `Connecting to ${machine.broker.url}`,
    );

    let client: MqttClient;
    try {
      client = connect(machine.broker.url, this.buildOptions(machine));
    } catch (error) {
      const message = (error as Error).message;
      this.runtimes.patch(machineId, { lastError: message });
      this.setStatus(machine, 'error', `Connection failed: ${message}`);
      return this.runtimes.get(machineId);
    }

    const runner: Runner = {
      machine,
      client,
      timer: null,
      tick: 0,
      lastFeedAt: 0,
    };
    this.runners.set(machineId, runner);

    client.on('connect', () => {
      this.runtimes.patch(machineId, {
        startedAt:
          this.runtimes.get(machineId).startedAt ?? new Date().toISOString(),
        lastError: null,
      });
      this.setStatus(machine, 'running', `Connected to ${machine.broker.url}`);
      this.publishTick(machineId);
      if (!runner.timer) {
        runner.timer = setInterval(
          () => this.publishTick(machineId),
          machine.publish.intervalMs,
        );
      }
    });

    client.on('reconnect', () => {
      // Only report it while the machine is still supposed to be alive.
      if (this.runners.has(machineId)) {
        this.setStatus(machine, 'connecting', 'Reconnecting…');
      }
    });

    client.on('offline', () => {
      if (this.runners.has(machineId)) {
        this.setStatus(machine, 'connecting', 'Broker offline, retrying…');
      }
    });

    client.on('error', (error: Error) => {
      this.runtimes.increment(machineId, 'errorCount');
      this.runtimes.patch(machineId, { lastError: error.message });
      this.setStatus(machine, 'error', error.message);
    });

    return this.runtimes.get(machineId);
  }

  stop(machineId: string): MachineRuntime {
    const runner = this.runners.get(machineId);
    if (!runner) {
      return this.runtimes.patch(machineId, { status: 'stopped' });
    }

    if (runner.timer) clearInterval(runner.timer);
    runner.timer = null;
    this.runners.delete(machineId);
    runner.client.removeAllListeners();
    runner.client.end(true);

    const runtime = this.runtimes.patch(machineId, {
      status: 'stopped',
      startedAt: null,
    });
    this.events.emit({
      type: 'status',
      machineId,
      machineName: runner.machine.name,
      status: 'stopped',
      message: 'Stopped',
    });
    return runtime;
  }

  restart(machineId: string): MachineRuntime {
    this.stop(machineId);
    return this.start(machineId);
  }

  startAll(): { started: number } {
    const machines = this.machines.findAll();
    let started = 0;
    for (const machine of machines) {
      if (!this.runners.has(machine.id)) {
        this.start(machine.id);
        started += 1;
      }
    }
    return { started };
  }

  stopAll(): { stopped: number } {
    const ids = [...this.runners.keys()];
    ids.forEach((id) => this.stop(id));
    return { stopped: ids.length };
  }

  /** Publishes exactly one message, using the live client when available. */
  async publishOnce(
    machineId: string,
  ): Promise<{ topic: string; payload: string }> {
    const machine = this.machines.getConfig(machineId);
    const runner = this.runners.get(machineId);

    if (runner?.client.connected) {
      return this.publishTick(machineId);
    }

    const ctx = {
      machineId: machine.id,
      machineName: machine.name,
      deviceId: machine.deviceId,
      tick: (runner?.tick ?? 0) + 1,
    };
    const payload = this.generator.render(machine.publish.payloadTemplate, ctx);
    const topic = this.generator.renderTopic(machine.publish.topic, ctx);

    await this.withTemporaryClient(
      machine,
      (client) =>
        new Promise<void>((resolve, reject) => {
          client.publish(
            topic,
            payload,
            { qos: machine.publish.qos, retain: machine.publish.retain },
            (error) => (error ? reject(error) : resolve()),
          );
        }),
    );

    this.runtimes.increment(machineId, 'messagesSent');
    this.runtimes.patch(machineId, {
      lastPublishAt: new Date().toISOString(),
      lastTopic: topic,
      lastPayload: payload,
    });
    this.events.emit({
      type: 'message',
      machineId,
      machineName: machine.name,
      topic,
      payload,
      qos: machine.publish.qos,
      retain: machine.publish.retain,
      message: 'manual publish',
    });
    return { topic, payload };
  }

  /** Connects, then immediately disconnects — used by the "Test" button. */
  async testConnection(
    machineId: string,
  ): Promise<{ ok: boolean; message: string }> {
    const machine = this.machines.getConfig(machineId);
    try {
      await this.withTemporaryClient(machine, () => Promise.resolve());
      return { ok: true, message: `Connected to ${machine.broker.url}` };
    } catch (error) {
      return { ok: false, message: (error as Error).message };
    }
  }

  @OnEvent(MACHINE_UPDATED)
  handleMachineUpdated(machine: Machine): void {
    if (!this.runners.has(machine.id)) return;
    this.logger.log(`Config changed for ${machine.name} — restarting`);
    this.restart(machine.id);
  }

  @OnEvent(MACHINE_DELETED)
  handleMachineDeleted(machine: Machine): void {
    if (this.runners.has(machine.id)) this.stop(machine.id);
    this.generator.resetState(machine.id);
  }

  private publishTick(machineId: string): { topic: string; payload: string } {
    const runner = this.runners.get(machineId);
    if (!runner) return { topic: '', payload: '' };

    const { machine } = runner;
    runner.tick += 1;
    const ctx = {
      machineId: machine.id,
      machineName: machine.name,
      deviceId: machine.deviceId,
      tick: runner.tick,
    };

    let topic = machine.publish.topic;
    let payload = '';
    try {
      // Payload first: it defines the `{{var:…}}` values a topic may reference.
      payload = this.generator.render(machine.publish.payloadTemplate, ctx);
      topic = this.generator.renderTopic(machine.publish.topic, ctx);
    } catch (error) {
      const message = `Template error: ${(error as Error).message}`;
      this.runtimes.increment(machineId, 'errorCount');
      this.runtimes.patch(machineId, { lastError: message });
      this.events.emit({
        type: 'error',
        machineId,
        machineName: machine.name,
        message,
      });
      return { topic, payload };
    }

    runner.client.publish(
      topic,
      payload,
      { qos: machine.publish.qos, retain: machine.publish.retain },
      (error) => {
        if (!error) return;
        this.runtimes.increment(machineId, 'errorCount');
        this.runtimes.patch(machineId, { lastError: error.message });
        this.events.emit({
          type: 'error',
          machineId,
          machineName: machine.name,
          message: `Publish failed: ${error.message}`,
        });
      },
    );

    this.runtimes.increment(machineId, 'messagesSent');
    this.runtimes.patch(machineId, {
      lastPublishAt: new Date().toISOString(),
      lastTopic: topic,
      lastPayload: payload,
    });

    // Fast machines would otherwise drown the live feed; the counters stay exact.
    const now = Date.now();
    if (now - runner.lastFeedAt >= FEED_THROTTLE_MS) {
      runner.lastFeedAt = now;
      this.events.emit({
        type: 'message',
        machineId,
        machineName: machine.name,
        topic,
        payload,
        qos: machine.publish.qos,
        retain: machine.publish.retain,
      });
    }

    return { topic, payload };
  }

  private async withTemporaryClient<T>(
    machine: Machine,
    action: (client: MqttClient) => Promise<T>,
  ): Promise<T> {
    const client = connect(machine.broker.url, {
      ...this.buildOptions(machine),
      clientId: `${this.resolveClientId(machine)}-probe-${Math.random()
        .toString(16)
        .slice(2, 8)}`,
      reconnectPeriod: 0,
    });

    try {
      await new Promise<void>((resolve, reject) => {
        const timer = setTimeout(
          () =>
            reject(new Error(`Timed out after ${CONNECT_TIMEOUT_MS / 1000}s`)),
          CONNECT_TIMEOUT_MS,
        );
        client.once('connect', () => {
          clearTimeout(timer);
          resolve();
        });
        client.once('error', (error: Error) => {
          clearTimeout(timer);
          reject(error);
        });
      });
      return await action(client);
    } finally {
      client.removeAllListeners();
      client.end(true);
    }
  }

  private buildOptions(machine: Machine): IClientOptions {
    return {
      clientId: this.resolveClientId(machine),
      username: machine.broker.username || undefined,
      password: machine.broker.password || undefined,
      keepalive: machine.broker.keepalive ?? 60,
      clean: machine.broker.cleanSession ?? true,
      reconnectPeriod: 5000,
      connectTimeout: CONNECT_TIMEOUT_MS,
      resubscribe: false,
    };
  }

  private resolveClientId(machine: Machine): string {
    if (machine.broker.clientId) return machine.broker.clientId;
    const slug = machine.name
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-|-$/g, '')
      .slice(0, 24);
    return `${slug || 'machine'}-${machine.id.slice(0, 8)}`;
  }

  private setStatus(
    machine: Machine,
    status: MachineRuntime['status'],
    message: string,
  ): void {
    this.runtimes.patch(machine.id, { status });
    this.events.emit({
      type: status === 'error' ? 'error' : 'status',
      machineId: machine.id,
      machineName: machine.name,
      status,
      message,
    });
  }
}
