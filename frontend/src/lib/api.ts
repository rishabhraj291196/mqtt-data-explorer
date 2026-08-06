import type {
  Machine,
  MachineInput,
  MachineRuntime,
  MachineStats,
  PreviewResponse,
  SimEvent,
  TokensResponse,
  Workspace,
  WorkspaceInput,
} from './types'

const BASE = import.meta.env.VITE_API_URL ?? '/api'

export class ApiError extends Error {}

/**
 * The workspace every machine call is scoped to. Kept here rather than
 * threaded through each call site so no request can accidentally go out
 * unscoped — the backend rejects one that does.
 */
let workspaceId = ''

export function setActiveWorkspaceId(id: string): void {
  workspaceId = id
}

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const headers: Record<string, string> = {}
  if (init?.body) headers['Content-Type'] = 'application/json'
  if (workspaceId) headers['X-Workspace-Id'] = workspaceId

  let response: Response
  try {
    response = await fetch(`${BASE}${path}`, { ...init, headers })
  } catch {
    throw new ApiError(
      'Cannot reach the backend. Is it running on port 3006? (npm run start:dev)',
    )
  }

  if (!response.ok) {
    let detail = `${response.status} ${response.statusText}`
    try {
      const body = (await response.json()) as { message?: string | string[] }
      if (body?.message) {
        detail = Array.isArray(body.message) ? body.message.join(', ') : body.message
      }
    } catch {
      // Non-JSON error body — keep the status line.
    }
    throw new ApiError(detail)
  }

  if (response.status === 204) return undefined as T
  return (await response.json()) as T
}

export const api = {
  listWorkspaces: () => request<Workspace[]>('/workspaces'),

  createWorkspace: (input: WorkspaceInput) =>
    request<Workspace>('/workspaces', {
      method: 'POST',
      body: JSON.stringify(input),
    }),

  updateWorkspace: (id: string, input: WorkspaceInput) =>
    request<Workspace>(`/workspaces/${id}`, {
      method: 'PATCH',
      body: JSON.stringify(input),
    }),

  /** Deletes the project and every machine in it. */
  deleteWorkspace: (id: string) =>
    request<{ ok: true; machinesDeleted: number }>(`/workspaces/${id}`, {
      method: 'DELETE',
    }),

  listMachines: () => request<Machine[]>('/machines'),

  /** Tiny counters-only snapshot, safe to poll. */
  machineStats: () => request<MachineStats[]>('/machines/stats'),

  getMachine: (id: string) => request<Machine>(`/machines/${id}`),

  createMachine: (input: MachineInput) =>
    request<Machine>('/machines', {
      method: 'POST',
      body: JSON.stringify(input),
    }),

  updateMachine: (id: string, input: MachineInput) =>
    request<Machine>(`/machines/${id}`, {
      method: 'PATCH',
      body: JSON.stringify(input),
    }),

  deleteMachine: (id: string) =>
    request<{ ok: true }>(`/machines/${id}`, { method: 'DELETE' }),

  cloneMachine: (id: string, count: number) =>
    request<Machine[]>(`/machines/${id}/clone`, {
      method: 'POST',
      body: JSON.stringify({ count }),
    }),

  /** Hands a machine to another project instead of re-creating it there. */
  moveMachine: (id: string, targetWorkspaceId: string) =>
    request<Machine>(`/machines/${id}/move`, {
      method: 'POST',
      body: JSON.stringify({ workspaceId: targetWorkspaceId }),
    }),

  start: (id: string) =>
    request<MachineRuntime>(`/machines/${id}/start`, { method: 'POST' }),

  stop: (id: string) =>
    request<MachineRuntime>(`/machines/${id}/stop`, { method: 'POST' }),

  publishOnce: (id: string) =>
    request<{ topic: string; payload: string }>(`/machines/${id}/publish-once`, {
      method: 'POST',
    }),

  testConnection: (id: string) =>
    request<{ ok: boolean; message: string }>(`/machines/${id}/test-connection`, {
      method: 'POST',
    }),

  startAll: () => request<{ started: number }>('/simulator/start-all', { method: 'POST' }),

  stopAll: () => request<{ stopped: number }>('/simulator/stop-all', { method: 'POST' }),

  tokens: () => request<TokensResponse>('/simulator/tokens'),

  preview: (payload: {
    payloadTemplate: string
    topic?: string
    machineName?: string
    deviceId?: string
    samples?: number
  }) =>
    request<PreviewResponse>('/simulator/preview', {
      method: 'POST',
      body: JSON.stringify(payload),
    }),

  recentEvents: (limit = 10) =>
    request<SimEvent[]>(`/events/recent?limit=${limit}`),

  clearEvents: () => request<{ ok: true }>('/events/recent', { method: 'DELETE' }),

  /** EventSource cannot set headers, so the workspace rides in the query. */
  streamUrl: (id: string) =>
    `${BASE}/events/stream?workspaceId=${encodeURIComponent(id)}`,
}
