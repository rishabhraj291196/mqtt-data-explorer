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
  MACHINE_MOVED,
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

/**
 * Runners are keyed by machine id alone — ids are unique across the whole
 * install. Workspace isolation is enforced one layer up: every public method
 * resolves its machine through `MachinesService`, which only ever hands back
 * machines belonging to the calling workspace.
 */
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
    // Boot ignores workspaces on purpose: every project's autostart machines
    // come up, not just whichever one a browser happens to open first.
    const autoStart = this.machines
      .findAllAcrossWorkspaces()
      .filter((item) => item.autoStart);
    for (const machine of autoStart) {
      this.logger.log(`Auto-starting ${machine.name}`);
      this.launch(machine);
    }
  }

  onModuleDestroy(): void {
    for (const machineId of [...this.runners.keys()]) {
      this.stopRunner(machineId);
    }
  }

  isRunning(machineId: string): boolean {
    return this.runners.has(machineId);
  }

  start(workspaceId: string, machineId: string): MachineRuntime {
    return this.launch(this.machines.getConfig(workspaceId, machineId));
  }

  stop(workspaceId: string, machineId: string): MachineRuntime {
    // Resolve first: a machine from another project must 404, not stop.
    this.machines.getConfig(workspaceId, machineId);
    return this.stopRunner(machineId);
  }

  restart(workspaceId: string, machineId: string): MachineRuntime {
    const machine = this.machines.getConfig(workspaceId, machineId);
    this.stopRunner(machineId);
    return this.launch(machine);
  }

  startAll(workspaceId: string): { started: number } {
    let started = 0;
    for (const machine of this.machines.findAll(workspaceId)) {
      if (!this.runners.has(machine.id)) {
        this.launch(machine);
        started += 1;
      }
    }
    return { started };
  }

  stopAll(workspaceId: string): { stopped: number } {
    const ids = this.machines
      .findAll(workspaceId)
      .map((machine) => machine.id)
      .filter((id) => this.runners.has(id));
    ids.forEach((id) => this.stopRunner(id));
    return { stopped: ids.length };
  }

  /** Publishes exactly one message, using the live client when available. */
  async publishOnce(
    workspaceId: string,
    machineId: string,
  ): Promise<{ topic: string; payload: string }> {
    const machine = this.machines.getConfig(workspaceId, machineId);
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
      workspaceId: machine.workspaceId,
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
    workspaceId: string,
    machineId: string,
  ): Promise<{ ok: boolean; message: string }> {
    const machine = this.machines.getConfig(workspaceId, machineId);
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
    this.stopRunner(machine.id);
    this.launch(machine);
  }

  /**
   * A move changes nothing about the connection, so the runner keeps its
   * client and timer — only the cached config is swapped, which is what makes
   * its next event land in the new workspace's feed instead of the old one.
   */
  @OnEvent(MACHINE_MOVED)
  handleMachineMoved(machine: Machine): void {
    const runner = this.runners.get(machine.id);
    if (runner) runner.machine = machine;
  }

  @OnEvent(MACHINE_DELETED)
  handleMachineDeleted(machine: Machine): void {
    if (this.runners.has(machine.id)) this.stopRunner(machine.id);
    this.generator.resetState(machine.id);
  }

  /** Boots a runner for an already-resolved (and therefore in-scope) machine. */
  private launch(machine: Machine): MachineRuntime {
    const machineId = machine.id;
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
      this.setStatus(
        runner.machine,
        'running',
        `Connected to ${machine.broker.url}`,
      );
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
        this.setStatus(runner.machine, 'connecting', 'Reconnecting…');
      }
    });

    client.on('offline', () => {
      if (this.runners.has(machineId)) {
        this.setStatus(
          runner.machine,
          'connecting',
          'Broker offline, retrying…',
        );
      }
    });

    client.on('error', (error: Error) => {
      this.runtimes.increment(machineId, 'errorCount');
      this.runtimes.patch(machineId, { lastError: error.message });
      this.setStatus(runner.machine, 'error', error.message);
    });

    return this.runtimes.get(machineId);
  }

  /** Tears a runner down. Callers have already checked the workspace. */
  private stopRunner(machineId: string): MachineRuntime {
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
      workspaceId: runner.machine.workspaceId,
      machineId,
      machineName: runner.machine.name,
      status: 'stopped',
      message: 'Stopped',
    });
    return runtime;
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
        workspaceId: machine.workspaceId,
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
          workspaceId: runner.machine.workspaceId,
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
        workspaceId: machine.workspaceId,
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
      workspaceId: machine.workspaceId,
      machineId: machine.id,
      machineName: machine.name,
      status,
      message,
    });
  }
}
