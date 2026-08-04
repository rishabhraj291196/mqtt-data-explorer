import { memo, useEffect, useState, type MouseEvent } from 'react'
import {
  CopyIcon,
  PencilIcon,
  PlayIcon,
  PlugIcon,
  SendIcon,
  SquareIcon,
  Trash2Icon,
  TriangleAlertIcon,
} from 'lucide-react'
import { Button } from '@/components/ui/button'
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from '@/components/ui/card'
import { JsonView } from '@/components/json-view'
import { StatusBadge } from '@/components/status-badge'
import { api } from '@/lib/api'
import { formatCount, formatInterval, formatRelative } from '@/lib/format'
import { cn } from '@/lib/utils'
import type { Machine } from '@/lib/types'

interface MachineCardProps {
  machine: Machine
  busy: boolean
  /** This machine is the one the live feed is filtered to. */
  selected: boolean
  onSelect: (id: string) => void
  onEdit: (machine: Machine) => void
  onStart: (id: string) => void
  onStop: (id: string) => void
  onPublishOnce: (id: string) => void
  onTest: (id: string) => void
  onClone: (machine: Machine) => void
  onDelete: (id: string) => void
}

/** Memoised: the list is polled every 2s, so untouched cards must stay put. */
export const MachineCard = memo(function MachineCard({
  machine,
  busy,
  selected,
  onSelect,
  onEdit,
  onStart,
  onStop,
  onPublishOnce,
  onTest,
  onClone,
  onDelete,
}: MachineCardProps) {
  const [confirmDelete, setConfirmDelete] = useState(false)
  const [showPayload, setShowPayload] = useState(false)
  const [livePayload, setLivePayload] = useState<string | null>(null)
  const { runtime } = machine
  const isLive = runtime.status === 'running' || runtime.status === 'connecting'

  // Payloads are big, so they are fetched only while this card shows one —
  // the 2s stats poll deliberately leaves them out.
  useEffect(() => {
    if (!showPayload) return
    let cancelled = false
    const load = () =>
      api
        .getMachine(machine.id)
        .then((fresh) => {
          if (!cancelled) setLivePayload(fresh.runtime.lastPayload)
        })
        .catch(() => undefined)
    void load()
    const timer = setInterval(load, 2000)
    return () => {
      cancelled = true
      clearInterval(timer)
    }
  }, [showPayload, machine.id])

  const payload = livePayload ?? runtime.lastPayload

  /**
   * Clicking the card points the live feed at this machine. Buttons, links and
   * anything the user is selecting text in keep their own behaviour.
   */
  const selectFromCard = (event: MouseEvent<HTMLDivElement>) => {
    const target = event.target as HTMLElement
    if (target.closest('button, a, input, textarea, select')) return
    if (window.getSelection()?.toString()) return
    onSelect(machine.id)
  }

  return (
    <Card
      className={cn(
        'h-full cursor-pointer',
        selected && 'ring-2 ring-primary',
      )}
      aria-current={selected || undefined}
      onClick={selectFromCard}
    >
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <button
            type="button"
            className="truncate text-left underline-offset-4 hover:underline"
            aria-label={
              selected
                ? `Show all machines in the live feed`
                : `Show only ${machine.name} in the live feed`
            }
            onClick={() => onSelect(machine.id)}
          >
            {machine.name}
          </button>
          <StatusBadge status={runtime.status} />
          {selected && (
            <span className="rounded-full bg-primary/10 px-2 py-0.5 text-[11px] font-normal text-primary">
              in feed
            </span>
          )}
        </CardTitle>
        <CardDescription className="truncate">
          {machine.description || 'No description'}
        </CardDescription>
        <div className="col-start-2 row-span-2 row-start-1 flex gap-0.5 self-start justify-self-end">
          <Button
            variant="ghost"
            size="icon-sm"
            aria-label="Edit machine"
            onClick={() => onEdit(machine)}
          >
            <PencilIcon />
          </Button>
          <Button
            variant="ghost"
            size="icon-sm"
            aria-label="Duplicate machine"
            disabled={busy}
            onClick={() => onClone(machine)}
          >
            <CopyIcon />
          </Button>
          <Button
            variant={confirmDelete ? 'destructive' : 'ghost'}
            size="icon-sm"
            aria-label={confirmDelete ? 'Confirm delete' : 'Delete machine'}
            disabled={busy}
            onClick={() => {
              if (!confirmDelete) {
                setConfirmDelete(true)
                setTimeout(() => setConfirmDelete(false), 4000)
                return
              }
              setConfirmDelete(false)
              onDelete(machine.id)
            }}
          >
            <Trash2Icon />
          </Button>
        </div>
      </CardHeader>

      <CardContent className="grid gap-3">
        <dl className="grid grid-cols-[auto_1fr] gap-x-3 gap-y-1 text-xs">
          <dt className="text-muted-foreground">Device ID</dt>
          <dd className="truncate font-mono">{machine.deviceId}</dd>
          <dt className="text-muted-foreground">Broker</dt>
          <dd className="truncate font-mono">{machine.broker.url}</dd>
          <dt className="text-muted-foreground">Topic</dt>
          <dd className="truncate font-mono">{machine.publish.topic}</dd>
          <dt className="text-muted-foreground">Rate</dt>
          <dd className="font-mono">
            every {formatInterval(machine.publish.intervalMs)} · QoS{' '}
            {machine.publish.qos}
            {machine.publish.retain ? ' · retained' : ''}
            {machine.autoStart ? ' · autostart' : ''}
          </dd>
        </dl>

        <div className="grid grid-cols-3 gap-2 rounded-lg bg-muted/40 p-2 text-center">
          <div>
            <p className="font-mono text-base">{formatCount(runtime.messagesSent)}</p>
            <p className="text-[11px] text-muted-foreground">published</p>
          </div>
          <div>
            <p className="font-mono text-base">{formatCount(runtime.errorCount)}</p>
            <p className="text-[11px] text-muted-foreground">errors</p>
          </div>
          <div>
            <p className="font-mono text-base">{formatRelative(runtime.lastPublishAt)}</p>
            <p className="text-[11px] text-muted-foreground">last message</p>
          </div>
        </div>

        {runtime.lastError && (
          <p className="flex gap-1.5 rounded-lg bg-destructive/10 p-2 text-xs text-destructive">
            <TriangleAlertIcon className="mt-px size-3.5 shrink-0" />
            <span className="min-w-0 wrap-break-word">{runtime.lastError}</span>
          </p>
        )}

        {(payload || runtime.messagesSent > 0) && (
          <div className="grid gap-1">
            <button
              type="button"
              className="w-fit text-xs text-muted-foreground underline-offset-4 hover:underline"
              onClick={() => setShowPayload((value) => !value)}
            >
              {showPayload ? 'Hide' : 'Show'} last payload
            </button>
            {showPayload && payload && (
              <JsonView
                value={payload}
                className="max-h-72 overflow-auto rounded-lg bg-muted/60 p-2"
              />
            )}
          </div>
        )}
      </CardContent>

      <CardFooter className="flex-wrap gap-1.5">
        {isLive ? (
          <Button
            variant="destructive"
            size="sm"
            disabled={busy}
            onClick={() => onStop(machine.id)}
          >
            <SquareIcon />
            Stop
          </Button>
        ) : (
          <Button size="sm" disabled={busy} onClick={() => onStart(machine.id)}>
            <PlayIcon />
            Start
          </Button>
        )}
        <Button
          variant="outline"
          size="sm"
          disabled={busy}
          onClick={() => onPublishOnce(machine.id)}
        >
          <SendIcon />
          Send one
        </Button>
        <Button
          variant="ghost"
          size="sm"
          disabled={busy}
          onClick={() => onTest(machine.id)}
        >
          <PlugIcon />
          Test broker
        </Button>
      </CardFooter>
    </Card>
  )
})
