import { memo } from 'react'
import { ChevronDownIcon, ChevronRightIcon, Maximize2Icon } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { JsonView } from '@/components/json-view'
import { formatClock } from '@/lib/format'
import { cn } from '@/lib/utils'
import type { FeedEvent } from '@/hooks/use-event-stream'

const TYPE_STYLES: Record<string, string> = {
  message: 'text-foreground',
  status: 'text-sky-600 dark:text-sky-400',
  error: 'text-destructive',
  machine: 'text-muted-foreground',
}

interface FeedRowProps {
  event: FeedEvent
  expanded: boolean
  onToggle: (id: string) => void
  onOpen: (event: FeedEvent) => void
}

/**
 * Memoised: the machine list re-renders every couple of seconds as counters
 * tick, and rows must not re-parse their JSON because of it.
 */
export const FeedRow = memo(function FeedRow({
  event,
  expanded,
  onToggle,
  onOpen,
}: FeedRowProps) {
  return (
    <li className="min-w-0 px-3 py-2">
      <div className="flex min-w-0 items-center gap-2 text-[11px]">
        <span className="shrink-0 font-mono text-muted-foreground">
          {formatClock(event.at)}
        </span>
        <span className="min-w-0 flex-1 truncate font-medium">
          {event.machineName ?? '—'}
        </span>
        {event.payload && (
          <>
            <Button
              variant="ghost"
              size="icon-xs"
              aria-label={expanded ? 'Collapse message' : 'Expand message'}
              onClick={() => onToggle(event.id)}
            >
              {expanded ? <ChevronDownIcon /> : <ChevronRightIcon />}
            </Button>
            <Button
              variant="ghost"
              size="icon-xs"
              aria-label="Open message"
              onClick={() => onOpen(event)}
            >
              <Maximize2Icon />
            </Button>
          </>
        )}
      </div>

      {event.topic && (
        <p className="truncate font-mono text-[11px] text-primary">{event.topic}</p>
      )}

      {event.payload ? (
        expanded ? (
          <JsonView
            value={event.payload}
            className="mt-1 rounded-md bg-background/60 p-2"
          />
        ) : (
          <button
            type="button"
            className="w-full cursor-pointer text-start"
            onClick={() => onToggle(event.id)}
          >
            <span className="line-clamp-2 font-mono text-[11px] break-all text-muted-foreground">
              {event.payload}
            </span>
          </button>
        )
      ) : (
        <p
          className={cn(
            'font-mono text-[11px] break-all',
            TYPE_STYLES[event.type] ?? 'text-foreground',
          )}
        >
          {event.message ?? event.status}
        </p>
      )}
    </li>
  )
})
