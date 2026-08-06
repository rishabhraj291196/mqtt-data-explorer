import { useCallback, useEffect, useMemo, useState } from 'react'
import { toast } from '@/components/ui/toast'
import { api, setActiveWorkspaceId } from '@/lib/api'
import type { Workspace, WorkspaceInput } from '@/lib/types'

const STORAGE_KEY = 'mqtt-simulator.workspace'

/** Machine and running tallies move on their own, so the switcher refreshes. */
const POLL_MS = 5000

const readStored = (): string => {
  try {
    return window.localStorage.getItem(STORAGE_KEY) ?? ''
  } catch {
    // Private mode / storage disabled — the picker still works for this session.
    return ''
  }
}

/** True when nothing the switcher shows has moved. */
function sameList(a: Workspace[], b: Workspace[]): boolean {
  return (
    a.length === b.length &&
    a.every((workspace, index) => {
      const other = b[index]
      return (
        workspace.id === other.id &&
        workspace.name === other.name &&
        workspace.color === other.color &&
        workspace.description === other.description &&
        workspace.machineCount === other.machineCount &&
        workspace.runningCount === other.runningCount
      )
    })
  )
}

/**
 * Owns which project is open. The id it settles on is pushed into the API
 * client, which stamps it onto every machine request — that is the only way a
 * machine is ever addressed, so one project can never reach into another.
 */
export function useWorkspaces() {
  const [workspaces, setWorkspaces] = useState<Workspace[]>([])
  const [activeId, setActiveId] = useState<string>(readStored)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const refresh = useCallback(async () => {
    try {
      const list = await api.listWorkspaces()
      setWorkspaces((prev) => (sameList(prev, list) ? prev : list))
      // A stored id can point at a workspace that was deleted elsewhere.
      setActiveId((current) =>
        list.some((workspace) => workspace.id === current)
          ? current
          : (list[0]?.id ?? ''),
      )
      setError(null)
    } catch (err) {
      setError((err as Error).message)
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void refresh()
    const timer = setInterval(() => void refresh(), POLL_MS)
    return () => clearInterval(timer)
  }, [refresh])

  useEffect(() => {
    if (!activeId) return
    try {
      window.localStorage.setItem(STORAGE_KEY, activeId)
    } catch {
      // Nothing to do — the choice just will not survive a reload.
    }
  }, [activeId])

  // Set while rendering, not in an effect: a child's effect runs before its
  // parent's, so the live feed would otherwise fire its first request before
  // the id had been handed over.
  setActiveWorkspaceId(activeId)

  const active = useMemo(
    () => workspaces.find((workspace) => workspace.id === activeId) ?? null,
    [workspaces, activeId],
  )

  const actions = useMemo(
    () => ({
      select: (id: string) => setActiveId(id),

      /** Creates the project and opens it. */
      create: async (input: WorkspaceInput): Promise<Workspace | undefined> => {
        try {
          const created = await api.createWorkspace(input)
          await refresh()
          setActiveId(created.id)
          toast.add({
            title: `${created.name} created`,
            type: 'success',
            timeout: 3500,
          })
          return created
        } catch (err) {
          toast.add({
            title: 'Could not create the workspace',
            description: (err as Error).message,
            type: 'error',
            timeout: 8000,
          })
          return undefined
        }
      },

      update: async (
        id: string,
        input: WorkspaceInput,
      ): Promise<Workspace | undefined> => {
        try {
          const updated = await api.updateWorkspace(id, input)
          await refresh()
          toast.add({ title: `${updated.name} saved`, type: 'success', timeout: 3500 })
          return updated
        } catch (err) {
          toast.add({
            title: 'Could not save the workspace',
            description: (err as Error).message,
            type: 'error',
            timeout: 8000,
          })
          return undefined
        }
      },

      /** Deletes the project and every machine in it. */
      remove: async (id: string): Promise<boolean> => {
        try {
          const result = await api.deleteWorkspace(id)
          await refresh()
          toast.add({
            title:
              result.machinesDeleted > 0
                ? `Workspace and ${result.machinesDeleted} machine(s) deleted`
                : 'Workspace deleted',
            type: 'success',
            timeout: 4000,
          })
          return true
        } catch (err) {
          toast.add({
            title: 'Could not delete the workspace',
            description: (err as Error).message,
            type: 'error',
            timeout: 8000,
          })
          return false
        }
      },

      refresh,
    }),
    [refresh],
  )

  return { workspaces, active, activeId, loading, error, actions }
}

export type WorkspacesApi = ReturnType<typeof useWorkspaces>
