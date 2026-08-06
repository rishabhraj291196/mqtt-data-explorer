export type QoS = 0 | 1 | 2

export interface BrokerConfig {
  url: string
  username?: string
  password?: string
  clientId?: string
  keepalive?: number
  cleanSession?: boolean
}

export interface PublishConfig {
  topic: string
  qos: QoS
  retain: boolean
  intervalMs: number
  payloadTemplate: string
}

export type MachineStatus = 'stopped' | 'connecting' | 'running' | 'error'

export interface MachineRuntime {
  status: MachineStatus
  messagesSent: number
  errorCount: number
  startedAt: string | null
  lastPublishAt: string | null
  lastTopic: string | null
  lastPayload: string | null
  lastError: string | null
}

export type DeviceIdFormat = 'numeric' | 'alphanumeric' | 'custom'

/** Poll-sized slice of MachineRuntime — no payloads. */
export interface MachineStats {
  id: string
  status: MachineStatus
  messagesSent: number
  errorCount: number
  lastPublishAt: string | null
  lastError: string | null
}

export const WORKSPACE_COLORS = [
  'sky',
  'violet',
  'emerald',
  'amber',
  'rose',
  'slate',
] as const

export type WorkspaceColor = (typeof WORKSPACE_COLORS)[number]

/** A project. Machines belong to exactly one and are invisible from the rest. */
export interface Workspace {
  id: string
  name: string
  description?: string
  color: WorkspaceColor
  machineCount: number
  runningCount: number
  createdAt: string
  updatedAt: string
}

export interface WorkspaceInput {
  name: string
  description?: string
  color?: WorkspaceColor
}

export interface Machine {
  id: string
  workspaceId: string
  name: string
  description?: string
  deviceId: string
  deviceIdFormat: DeviceIdFormat
  broker: BrokerConfig
  publish: PublishConfig
  autoStart: boolean
  createdAt: string
  updatedAt: string
  runtime: MachineRuntime
}

export interface MachineInput {
  name: string
  description?: string
  deviceId: string
  deviceIdFormat: DeviceIdFormat
  broker: BrokerConfig
  publish: PublishConfig
  autoStart: boolean
}

export type SimEventType = 'message' | 'status' | 'error' | 'machine' | 'ping'

export interface SimEvent {
  type: SimEventType
  at: string
  workspaceId?: string
  machineId?: string
  machineName?: string
  topic?: string
  payload?: string
  qos?: number
  retain?: boolean
  status?: MachineStatus
  message?: string
}

export interface TokenDoc {
  token: string
  description: string
  example: string
}

export interface TokensResponse {
  tokens: TokenDoc[]
  sampleTemplate: string
  defaultBrokerUrl: string
}

export interface PreviewResponse {
  ok: boolean
  error: string | null
  samples: { topic: string | null; payload: string }[]
}
