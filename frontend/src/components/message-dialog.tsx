import { useState } from 'react'
import { CheckIcon, CopyIcon } from 'lucide-react'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { JsonView } from '@/components/json-view'
import { formatClock, prettyJson } from '@/lib/format'
import type { FeedEvent } from '@/hooks/use-event-stream'

/** Full-width view of a single published message — the feed column is narrow. */
export function MessageDialog({
  event,
  onClose,
}: {
  event: FeedEvent | null
  onClose: () => void
}) {
  const [copied, setCopied] = useState(false)

  if (!event) return null

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(prettyJson(event.payload ?? ''))
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    } catch {
      // Clipboard blocked (insecure origin) — the JSON is selectable anyway.
    }
  }

  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      {/* Only the JSON scrolls — the header stays put when focus lands on a
          footer button. */}
      <DialogContent className="max-h-[85vh] grid-rows-[auto_auto_minmax(0,1fr)_auto] sm:max-w-3xl">
        <DialogHeader>
          <DialogTitle>{event.machineName ?? 'Message'}</DialogTitle>
          <DialogDescription className="font-mono break-all">
            {event.topic ?? '—'}
          </DialogDescription>
        </DialogHeader>

        <div className="flex flex-wrap items-center gap-1.5">
          <Badge variant="outline">{formatClock(event.at)}</Badge>
          {event.qos !== undefined && <Badge variant="outline">QoS {event.qos}</Badge>}
          {event.retain && <Badge variant="secondary">retained</Badge>}
          <Badge variant="outline">
            {new Blob([event.payload ?? '']).size} bytes
          </Badge>
        </div>

        <div className="min-h-0 overflow-auto rounded-lg bg-muted/50">
          <JsonView value={event.payload ?? ''} className="p-3 text-xs" />
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => void copy()}>
            {copied ? <CheckIcon /> : <CopyIcon />}
            {copied ? 'Copied' : 'Copy JSON'}
          </Button>
          <Button onClick={onClose}>Close</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
