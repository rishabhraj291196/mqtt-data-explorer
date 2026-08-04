import { useCallback, useEffect, useMemo, useState } from 'react'
import {
  BookOpenIcon,
  CpuIcon,
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
import { ThemeToggle } from '@/components/theme-toggle'
import { useSimulator } from '@/hooks/use-simulator'
import { api } from '@/lib/api'
import { formatCount } from '@/lib/format'
import type { Machine, MachineInput } from '@/lib/types'

function StatTile({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-xl bg-card px-4 py-3 ring-1 ring-foreground/10">
      <p className="font-heading text-2xl leading-tight">{value}</p>
      <p className="text-xs text-muted-foreground">{label}</p>
    </div>
  )
}

function App() {
  const { machines, loading, error, busyId, actions } = useSimulator()
  const [dialogOpen, setDialogOpen] = useState(false)
  const [editing, setEditing] = useState<Machine | null>(null)
  const [cloning, setCloning] = useState<Machine | null>(null)
  const [defaultBrokerUrl, setDefaultBrokerUrl] = useState('mqtt://localhost:1883')
  /** Machine the live feed is pinned to — empty string shows the whole fleet. */
  const [feedFilter, setFeedFilter] = useState('')

  useEffect(() => {
    void api
      .tokens()
      .then((response) => setDefaultBrokerUrl(response.defaultBrokerUrl))
      .catch(() => undefined)
  }, [])

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

  return (
    <div className="min-h-screen bg-background">
      <header className="sticky top-0 z-40 border-b bg-background/85 backdrop-blur">
        <div className="mx-auto flex max-w-[1600px] flex-wrap items-center gap-3 px-4 py-3">
          <CpuIcon className="size-5 text-primary" />
          <div className="me-auto">
            <h1 className="font-heading text-base leading-tight font-medium">
              MQTT Device Simulator
            </h1>
            <p className="text-xs text-muted-foreground">
              Fake IoT machines that publish real MQTT data — no hardware needed
            </p>
          </div>
          <Button variant="outline" size="sm" onClick={() => void actions.startAll()}>
            <PlayIcon />
            Start all
          </Button>
          <Button variant="outline" size="sm" onClick={() => void actions.stopAll()}>
            <SquareIcon />
            Stop all
          </Button>
          <Button size="sm" onClick={openCreate}>
            <PlusIcon />
            New machine
          </Button>
          {/* Static page from public/, so it opens in its own tab without routing. */}
          <Button
            variant="ghost"
            size="sm"
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
          {error && (
            <p className="flex items-center gap-2 rounded-xl bg-destructive/10 p-3 text-sm text-destructive">
              <TriangleAlertIcon className="size-4 shrink-0" />
              {error}
            </p>
          )}

          <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
            <StatTile label="machines" value={formatCount(machines.length)} />
            <StatTile label="running" value={formatCount(stats.running)} />
            <StatTile label="messages published" value={formatCount(stats.sent)} />
            <StatTile label="errors" value={formatCount(stats.errors)} />
          </div>

          {loading ? (
            <p className="text-sm text-muted-foreground">Loading machines…</p>
          ) : machines.length === 0 ? (
            <div className="grid justify-items-center gap-3 rounded-xl bg-card p-10 text-center ring-1 ring-foreground/10">
              <CpuIcon className="size-8 text-muted-foreground" />
              <div>
                <p className="font-heading text-base">No machines yet</p>
                <p className="text-sm text-muted-foreground">
                  Create one, point it at your broker, and it starts behaving like a
                  real device.
                </p>
              </div>
              <Button onClick={openCreate}>
                <PlusIcon />
                Create your first machine
              </Button>
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
                  onDelete={actions.remove}
                />
              ))}
            </div>
          )}
        </section>

        <aside className="lg:sticky lg:top-18 lg:h-[calc(100vh-6rem)]">
          <LiveFeed
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
