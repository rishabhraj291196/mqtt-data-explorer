import { useCallback, useState } from 'react'
import {
  EraserIcon,
  ListTreeIcon,
  PauseIcon,
  PlayIcon,
  RadioIcon,
  XIcon,
} from 'lucide-react'
import { Button } from '@/components/ui/button'
import { NativeSelect, NativeSelectOption } from '@/components/ui/native-select'
import { FeedRow } from '@/components/feed-row'
import { MessageDialog } from '@/components/message-dialog'
import { cn } from '@/lib/utils'
import { useEventStream, type FeedEvent } from '@/hooks/use-event-stream'

export interface MachineOption {
  id: string
  name: string
}

interface LiveFeedProps {
  machines: MachineOption[]
  /** Machine id the feed is limited to; empty string means every machine. */
  machineFilter: string
  onMachineFilterChange: (machineId: string) => void
}

export function LiveFeed({
  machines,
  machineFilter,
  onMachineFilterChange,
}: LiveFeedProps) {
  // Subscribing here rather than in App keeps message traffic off the cards.
  // The stream itself is filtered, so `events` is already only what we show.
  const { events, streamConnected, clear, setPaused: setStreamPaused } =
    useEventStream(machineFilter)
  const [paused, setPaused] = useState(false)
  const [expandAll, setExpandAll] = useState(false)
  const [overrides, setOverrides] = useState<ReadonlySet<string>>(new Set())
  const [detail, setDetail] = useState<FeedEvent | null>(null)

  const toggleRow = useCallback((id: string) => {
    setOverrides((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }, [])

  const openDetail = useCallback((event: FeedEvent) => setDetail(event), [])

  const toggleAll = () => {
    setExpandAll((value) => !value)
    setOverrides(new Set())
  }

  const togglePause = () => {
    const next = !paused
    setPaused(next)
    setStreamPaused(next)
  }

  return (
    <div className="flex h-full min-h-0 flex-col gap-3 rounded-xl bg-card p-4 ring-1 ring-foreground/10">
      <div className="flex items-center gap-2">
        <RadioIcon
          className={cn(
            'size-4',
            streamConnected ? 'text-emerald-500' : 'text-muted-foreground',
          )}
        />
        <h2 className="font-heading text-base font-medium">Live feed</h2>
        <span className="text-xs text-muted-foreground">
          {streamConnected ? 'connected' : 'disconnected'}
        </span>
        <div className="ms-auto flex gap-1.5">
          <Button
            variant={expandAll ? 'secondary' : 'outline'}
            size="icon-sm"
            aria-label={expandAll ? 'Collapse all messages' : 'Expand all messages'}
            onClick={toggleAll}
          >
            <ListTreeIcon />
          </Button>
          <Button
            variant="outline"
            size="icon-sm"
            aria-label={paused ? 'Resume feed' : 'Pause feed'}
            onClick={togglePause}
          >
            {paused ? <PlayIcon /> : <PauseIcon />}
          </Button>
          <Button
            variant="outline"
            size="icon-sm"
            aria-label="Clear feed"
            onClick={() => void clear()}
          >
            <EraserIcon />
          </Button>
        </div>
      </div>

      <div className="flex items-center gap-1.5">
        <NativeSelect
          className="w-full"
          value={machineFilter}
          aria-label="Filter by machine"
          size="sm"
          onChange={(event) => onMachineFilterChange(event.target.value)}
        >
          <NativeSelectOption value="">All machines</NativeSelectOption>
          {machines.map((machine) => (
            <NativeSelectOption key={machine.id} value={machine.id}>
              {machine.name}
            </NativeSelectOption>
          ))}
        </NativeSelect>
        {machineFilter && (
          <Button
            variant="ghost"
            size="icon-sm"
            aria-label="Show all machines"
            onClick={() => onMachineFilterChange('')}
          >
            <XIcon />
          </Button>
        )}
      </div>

      <div className="min-h-0 flex-1 overflow-x-hidden overflow-y-auto rounded-lg bg-muted/30">
        {events.length === 0 ? (
          <p className="p-4 text-sm text-muted-foreground">
            {paused
              ? 'Feed paused.'
              : machineFilter
                ? 'Nothing from this machine yet — start it and its messages show up here.'
                : 'Nothing yet — start a machine and messages will show up here.'}
          </p>
        ) : (
          <ul className="divide-y divide-border/60">
            {events.map((event) => (
              <FeedRow
                key={event.id}
                event={event}
                expanded={overrides.has(event.id) ? !expandAll : expandAll}
                onToggle={toggleRow}
                onOpen={openDetail}
              />
            ))}
          </ul>
        )}
      </div>

      <p className="text-[11px] text-muted-foreground">
        Showing the 10 most recent messages
        {machineFilter ? ' from this machine' : ''}. Counters on each card stay
        exact.
      </p>

      <MessageDialog event={detail} onClose={() => setDetail(null)} />
    </div>
  )
}
