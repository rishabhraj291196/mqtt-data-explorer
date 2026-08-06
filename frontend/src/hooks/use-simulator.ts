import { useCallback, useEffect, useMemo, useState } from 'react'
import { api } from '@/lib/api'
import { toast } from '@/components/ui/toast'
import type { Machine, MachineInput, MachineStats } from '@/lib/types'

const POLL_MS = 2000

/** True when nothing the UI shows has moved — lets us reuse the old object. */
function sameStats(machine: Machine, stats: MachineStats): boolean {
  const runtime = machine.runtime
  return (
    runtime.status === stats.status &&
    runtime.messagesSent === stats.messagesSent &&
    runtime.errorCount === stats.errorCount &&
    runtime.lastPublishAt === stats.lastPublishAt &&
    runtime.lastError === stats.lastError
  )
}

/**
 * @param workspaceId The project to show. Every request is scoped to it by the
 *   API client, so this hook only ever holds one project's machines. An empty
 *   string means the workspace list has not resolved yet — nothing is fetched.
 */
export function useSimulator(workspaceId: string) {
  const [machines, setMachines] = useState<Machine[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [busyId, setBusyId] = useState<string | null>(null)
  const [renderedWorkspace, setRenderedWorkspace] = useState(workspaceId)

  // Switching project empties the list while rendering, so the previous
  // project's cards never paint for a frame under the new one.
  if (renderedWorkspace !== workspaceId) {
    setRenderedWorkspace(workspaceId)
    setMachines([])
    setLoading(true)
    setError(null)
  }

  /** Full reload — only after something structural changes. */
  const refresh = useCallback(async () => {
    if (!workspaceId) return
    try {
      setMachines(await api.listMachines())
      setError(null)
    } catch (err) {
      setError((err as Error).message)
    } finally {
      setLoading(false)
    }
  }, [workspaceId])

  /**
   * Counters tick constantly, so they are polled separately from the (much
   * larger) machine configs. Machines whose numbers did not move keep their
   * old object identity, so their memoised card never re-renders.
   */
  const pollStats = useCallback(async () => {
    if (!workspaceId) return
    let stats: MachineStats[]
    try {
      stats = await api.machineStats()
      setError(null)
    } catch (err) {
      setError((err as Error).message)
      return
    }

    setMachines((prev) => {
      const byId = new Map(stats.map((item) => [item.id, item]))
      if (byId.size !== prev.length) {
        // A machine appeared or vanished elsewhere — take the full list again.
        void refresh()
        return prev
      }
      let changed = false
      const next = prev.map((machine) => {
        const item = byId.get(machine.id)
        if (!item || sameStats(machine, item)) return machine
        changed = true
        return { ...machine, runtime: { ...machine.runtime, ...item } }
      })
      return changed ? next : prev
    })
  }, [refresh, workspaceId])

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void refresh()
    const timer = setInterval(() => void pollStats(), POLL_MS)
    return () => clearInterval(timer)
  }, [refresh, pollStats])

  const run = useCallback(
    async <T,>(
      machineId: string | null,
      action: () => Promise<T>,
      success?: (result: T) => string,
    ): Promise<T | undefined> => {
      setBusyId(machineId)
      try {
        const result = await action()
        if (success) {
          toast.add({ title: success(result), type: 'success', timeout: 3500 })
        }
        await refresh()
        return result
      } catch (err) {
        toast.add({
          title: 'Something went wrong',
          description: (err as Error).message,
          type: 'error',
          timeout: 8000,
        })
        return undefined
      } finally {
        setBusyId(null)
      }
    },
    [refresh],
  )

  // Stable identity keeps memoised cards from re-rendering on every poll.
  const actions = useMemo(
    () => ({
      start: (id: string) => run(id, () => api.start(id)),
      stop: (id: string) => run(id, () => api.stop(id)),
      startAll: () =>
        run(null, () => api.startAll(), (r) => `Started ${r.started} machine(s)`),
      stopAll: () =>
        run(null, () => api.stopAll(), (r) => `Stopped ${r.stopped} machine(s)`),
      publishOnce: (id: string) =>
        run(id, () => api.publishOnce(id), (r) => `Published to ${r.topic}`),
      testConnection: (id: string) =>
        run(
          id,
          async () => {
            const result = await api.testConnection(id)
            if (!result.ok) throw new Error(result.message)
            return result
          },
          (r) => r.message,
        ),
      create: (input: MachineInput) =>
        run(null, () => api.createMachine(input), (m) => `${m.name} created`),
      update: (id: string, input: MachineInput) =>
        run(id, () => api.updateMachine(id, input), (m) => `${m.name} saved`),
      remove: (id: string) =>
        run(id, () => api.deleteMachine(id), () => 'Machine deleted'),
      clone: (id: string, count: number) =>
        run(
          id,
          () => api.cloneMachine(id, count),
          (list) => `Created ${list.length} ${list.length === 1 ? 'copy' : 'copies'}`,
        ),
      /** Sends it to another project; it leaves this list on the next refresh. */
      move: (id: string, targetWorkspaceId: string, targetName: string) =>
        run(
          id,
          () => api.moveMachine(id, targetWorkspaceId),
          (m) => `${m.name} moved to ${targetName}`,
        ),
    }),
    [run],
  )

  return { machines, loading, error, busyId, refresh, actions }
}

export type SimulatorApi = ReturnType<typeof useSimulator>
