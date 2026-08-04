export type QoS = 0 | 1 | 2;

export interface BrokerConfig {
  /** e.g. mqtt://broker.emqx.io:1883, mqtts://..., ws://..., wss://... */
  url: string;
  username?: string;
  password?: string;
  /** Left empty => auto generated from the machine name. */
  clientId?: string;
  keepalive?: number;
  cleanSession?: boolean;
}

export interface PublishConfig {
  /** Supports tokens, e.g. `factory/{{machineName}}/telemetry` */
  topic: string;
  qos: QoS;
  retain: boolean;
  intervalMs: number;
  /** JSON (or raw text) template containing `{{token}}` placeholders. */
  payloadTemplate: string;
}

/**
 * How `deviceId` is produced. `custom` means the user typed it themselves and
 * it is never regenerated.
 */
export type DeviceIdFormat = 'numeric' | 'alphanumeric' | 'custom';

export interface Machine {
  id: string;
  name: string;
  description?: string;
  /** The identity the device reports — exposed to templates as `{{deviceId}}`. */
  deviceId: string;
  deviceIdFormat: DeviceIdFormat;
  broker: BrokerConfig;
  publish: PublishConfig;
  /** Start publishing automatically when the backend boots. */
  autoStart: boolean;
  createdAt: string;
  updatedAt: string;
}

export type MachineStatus = 'stopped' | 'connecting' | 'running' | 'error';

export interface MachineRuntime {
  status: MachineStatus;
  messagesSent: number;
  errorCount: number;
  startedAt: string | null;
  lastPublishAt: string | null;
  lastTopic: string | null;
  lastPayload: string | null;
  lastError: string | null;
}

export type MachineWithRuntime = Machine & { runtime: MachineRuntime };

/**
 * The only fields that change while a machine runs. Polled every couple of
 * seconds, so it deliberately leaves out the (large) last payload.
 */
export interface MachineStats {
  id: string;
  status: MachineStatus;
  messagesSent: number;
  errorCount: number;
  lastPublishAt: string | null;
  lastError: string | null;
}

export const createEmptyRuntime = (): MachineRuntime => ({
  status: 'stopped',
  messagesSent: 0,
  errorCount: 0,
  startedAt: null,
  lastPublishAt: null,
  lastTopic: null,
  lastPayload: null,
  lastError: null,
});
