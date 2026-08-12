import { useCallback, useEffect, useMemo, useState } from 'react'
import {
  BookOpenIcon,
  CpuIcon,
  FolderPlusIcon,
  PlayIcon,
  PlusIcon,
  SquareIcon,
  TriangleAlertIcon,
} from 'lucide-react'
import { Button } from '@/components/ui/button'
import { CloneDialog } from '@/components/clone-dialog'
import { LiveFeed } from '@/components/live-feed'
import { MachineCard } from '@/components/machine-card'
import { MachineDialog } from '@/components/machine-dialog'
import { MoveMachineDialog } from '@/components/move-machine-dialog'
import { ThemeToggle } from '@/components/theme-toggle'
import { WorkspaceDialog } from '@/components/workspace-dialog'
import { WorkspaceSwitcher } from '@/components/workspace-switcher'
import { useSimulator } from '@/hooks/use-simulator'
import { useWorkspaces } from '@/hooks/use-workspaces'
import { api } from '@/lib/api'
import { formatCount } from '@/lib/format'
import type { Machine, MachineInput, Workspace } from '@/lib/types'

function StatTile({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-xl bg-card px-4 py-3 ring-1 ring-foreground/10">
      <p className="font-heading text-2xl leading-tight">{value}</p>
      <p className="text-xs text-muted-foreground">{label}</p>
    </div>
  )
}

/** Which workspace form is open: none, a new one, or the current one. */
type WorkspaceEditor = { mode: 'create' } | { mode: 'edit'; workspace: Workspace } | null

function App() {
  const {
    workspaces,
    active: activeWorkspace,
    activeId: workspaceId,
    loading: workspacesLoading,
    error: workspacesError,
    actions: workspaceActions,
  } = useWorkspaces()
  const { machines, loading, error, busyId, actions } = useSimulator(workspaceId)
  const [dialogOpen, setDialogOpen] = useState(false)
  const [editing, setEditing] = useState<Machine | null>(null)
  const [cloning, setCloning] = useState<Machine | null>(null)
  const [moving, setMoving] = useState<Machine | null>(null)
  const [workspaceEditor, setWorkspaceEditor] = useState<WorkspaceEditor>(null)
  const [defaultBrokerUrl, setDefaultBrokerUrl] = useState('mqtt://localhost:1883')
  /** Machine the live feed is pinned to — empty string shows the whole fleet. */
  const [feedFilter, setFeedFilter] = useState('')

  useEffect(() => {
    void api
      .tokens()
      .then((response) => setDefaultBrokerUrl(response.defaultBrokerUrl))
      .catch(() => undefined)
  }, [])

  // Adding, removing or moving a machine changes the tallies in the switcher.
  const refreshWorkspaces = workspaceActions.refresh
  useEffect(() => {
    void refreshWorkspaces()
  }, [machines.length, refreshWorkspaces])

  const stats = useMemo(() => {
    const running = machines.filter((m) => m.runtime.status === 'running').length
    const sent = machines.reduce((total, m) => total + m.runtime.messagesSent, 0)
    const errors = machines.reduce((total, m) => total + m.runtime.errorCount, 0)
    return { running, sent, errors }
  }, [machines])

  /** Machine cards are memoised, so their handlers must keep a stable identity. */
  const openCreate = useCallback(() => {
    setEditing(null)
    setDialogOpen(true)
  }, [])

  const openEdit = useCallback((machine: Machine) => {
    setEditing(machine)
    setDialogOpen(true)
  }, [])

  const openClone = useCallback((machine: Machine) => setCloning(machine), [])

  const openMove = useCallback((machine: Machine) => setMoving(machine), [])

  /** Clicking the pinned machine again releases the feed back to all machines. */
  const toggleFeedFilter = useCallback((id: string) => {
    setFeedFilter((current) => (current === id ? '' : id))
  }, [])

  // A deleted machine must not leave the feed pinned to something that is gone.
  const activeFilter =
    feedFilter && machines.some((machine) => machine.id === feedFilter)
      ? feedFilter
      : ''

  // The feed's filter only needs id + name, not the constantly-ticking counters.
  const machineOptions = machines.map((machine) => ({
    id: machine.id,
    name: machine.name,
  }))

  const submit = (input: MachineInput) =>
    editing ? actions.update(editing.id, input) : actions.create(input)

  const canMove = workspaces.length > 1
  // A workspace id restored from a previous session may since have been
  // deleted. Until the list confirms it, a machine error says nothing useful —
  // the id gets corrected a moment later and the request is retried.
  const banner = workspacesError ?? (workspacesLoading ? null : error)

  return (
    <div className="min-h-screen bg-background">
      <header className="sticky top-0 z-40 border-b bg-background/85 backdrop-blur">
        <div className="mx-auto flex max-w-[1600px] flex-wrap items-center gap-3 px-4 py-3">
          <CpuIcon className="size-5 text-primary" />
          <div>
            <h1 className="font-heading text-base leading-tight font-medium">
              MQTT Device Simulator
            </h1>
            <p className="text-xs text-muted-foreground">
              Fake IoT machines that publish real MQTT data — no hardware needed
            </p>
          </div>
          <div className="me-auto ps-1">
            <WorkspaceSwitcher
              workspaces={workspaces}
              active={activeWorkspace}
              onSelect={workspaceActions.select}
              onCreate={() => setWorkspaceEditor({ mode: 'create' })}
              onManage={() =>
                activeWorkspace &&
                setWorkspaceEditor({ mode: 'edit', workspace: activeWorkspace })
              }
            />
          </div>
          <Button variant="outline" size="sm" onClick={() => void actions.startAll()}>
            <PlayIcon />
            Start all
          </Button>
          <Button variant="outline" size="sm" onClick={() => void actions.stopAll()}>
            <SquareIcon />
            Stop all
          </Button>
          <Button size="sm" disabled={!workspaceId} onClick={openCreate}>
            <PlusIcon />
            New machine
          </Button>
          {/* Static page from public/, so it opens in its own tab without routing. */}
          <Button
            variant="ghost"
            size="sm"
            nativeButton={false}
            render={<a href="/docs.html" target="_blank" rel="noreferrer" />}
          >
            <BookOpenIcon />
            Docs
          </Button>
          <ThemeToggle />
        </div>
      </header>

      <main className="mx-auto grid max-w-[1600px] gap-4 p-4 lg:grid-cols-[minmax(0,1fr)_400px] xl:grid-cols-[minmax(0,1fr)_480px]">
        <section className="grid content-start gap-4">
          {banner && (
            <p className="flex items-center gap-2 rounded-xl bg-destructive/10 p-3 text-sm text-destructive">
              <TriangleAlertIcon className="size-4 shrink-0" />
              {banner}
            </p>
          )}

          {activeWorkspace?.description && (
            <p className="text-sm text-muted-foreground">
              {activeWorkspace.description}
            </p>
          )}

          <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
            <StatTile label="machines" value={formatCount(machines.length)} />
            <StatTile label="running" value={formatCount(stats.running)} />
            <StatTile label="messages published" value={formatCount(stats.sent)} />
            <StatTile label="errors" value={formatCount(stats.errors)} />
          </div>

          {loading || workspacesLoading ? (
            <p className="text-sm text-muted-foreground">Loading machines…</p>
          ) : machines.length === 0 ? (
            <div className="grid justify-items-center gap-3 rounded-xl bg-card p-10 text-center ring-1 ring-foreground/10">
              <CpuIcon className="size-8 text-muted-foreground" />
              <div>
                <p className="font-heading text-base">
                  No machines in {activeWorkspace?.name ?? 'this workspace'}
                </p>
                <p className="text-sm text-muted-foreground">
                  Machines live inside one workspace only — create one here, or
                  switch to another project.
                </p>
              </div>
              <div className="flex flex-wrap justify-center gap-2">
                <Button disabled={!workspaceId} onClick={openCreate}>
                  <PlusIcon />
                  Create a machine
                </Button>
                <Button
                  variant="outline"
                  onClick={() => setWorkspaceEditor({ mode: 'create' })}
                >
                  <FolderPlusIcon />
                  New workspace
                </Button>
              </div>
            </div>
          ) : (
            <div className="grid gap-4 xl:grid-cols-2">
              {machines.map((machine) => (
                <MachineCard
                  key={machine.id}
                  machine={machine}
                  busy={busyId === machine.id}
                  selected={activeFilter === machine.id}
                  onSelect={toggleFeedFilter}
                  onEdit={openEdit}
                  onStart={actions.start}
                  onStop={actions.stop}
                  onPublishOnce={actions.publishOnce}
                  onTest={actions.testConnection}
                  onClone={openClone}
                  canMove={canMove}
                  onMove={openMove}
                  onDelete={actions.remove}
                />
              ))}
            </div>
          )}
        </section>

        <aside className="lg:sticky lg:top-18 lg:h-[calc(100vh-6rem)]">
          <LiveFeed
            workspaceId={workspaceId}
            machines={machineOptions}
            machineFilter={activeFilter}
            onMachineFilterChange={setFeedFilter}
          />
        </aside>
      </main>

      <CloneDialog
        machine={cloning}
        onClose={() => setCloning(null)}
        onClone={actions.clone}
      />

      <MoveMachineDialog
        // Keyed so the target picker resets between machines.
        key={moving?.id ?? 'no-move'}
        machine={moving}
        workspaces={workspaces}
        currentWorkspaceId={workspaceId}
        onClose={() => setMoving(null)}
        onMove={actions.move}
      />

      {workspaceEditor && (
        <WorkspaceDialog
          workspace={workspaceEditor.mode === 'edit' ? workspaceEditor.workspace : null}
          canDelete={workspaces.length > 1}
          onClose={() => setWorkspaceEditor(null)}
          onSubmit={(input) =>
            workspaceEditor.mode === 'edit'
              ? workspaceActions.update(workspaceEditor.workspace.id, input)
              : workspaceActions.create(input)
          }
          onDelete={workspaceActions.remove}
        />
      )}

      {/* Keyed + conditionally mounted so every open starts from a clean form. */}
      {dialogOpen && (
        <MachineDialog
          key={editing?.id ?? 'new'}
          open
          onOpenChange={setDialogOpen}
          machine={editing}
          defaultBrokerUrl={defaultBrokerUrl}
          onSubmit={submit}
        />
      )}
    </div>
  )
}

export default App
