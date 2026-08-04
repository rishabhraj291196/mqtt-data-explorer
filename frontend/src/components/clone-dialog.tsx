import { useMemo, useState } from 'react'
import { CopyIcon } from 'lucide-react'
import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import type { Machine } from '@/lib/types'

const QUICK_COUNTS = [1, 5, 10, 25]
const MAX_COUNT = 50

/** Duplicates an existing machine N times — the fast way to fake a fleet. */
export function CloneDialog({
  machine,
  onClose,
  onClone,
}: {
  machine: Machine | null
  onClose: () => void
  onClone: (id: string, count: number) => Promise<unknown>
}) {
  const [count, setCount] = useState('5')
  const [working, setWorking] = useState(false)

  const parsed = Math.min(MAX_COUNT, Math.max(1, Number(count) || 0))
  const names = useMemo(
    () =>
      machine
        ? Array.from({ length: parsed }, (_, index) => `${machine.name} (${index + 1})`)
        : [],
    [machine, parsed],
  )

  if (!machine) return null

  const usesNameToken =
    machine.publish.payloadTemplate.includes('{{machineName}}') ||
    machine.publish.topic.includes('{{machineName}}')

  const nextIdExample =
    machine.deviceIdFormat === 'custom'
      ? `${machine.deviceId}-1`
      : machine.deviceIdFormat === 'numeric'
        ? 'a new 10-digit number'
        : 'a new alphanumeric id'

  const submit = async () => {
    setWorking(true)
    const result = await onClone(machine.id, parsed)
    setWorking(false)
    if (result !== undefined) onClose()
  }

  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Duplicate {machine.name}</DialogTitle>
          <DialogDescription>
            Same broker, topic and payload template. Each copy gets its own name,
            MQTT client ID and device ID ({nextIdExample}).
          </DialogDescription>
        </DialogHeader>

        <div className="grid gap-1.5">
          <Label htmlFor="clone-count">How many copies?</Label>
          <Input
            id="clone-count"
            type="number"
            min={1}
            max={MAX_COUNT}
            value={count}
            onChange={(event) => setCount(event.target.value)}
          />
          <div className="flex flex-wrap gap-1.5 pt-1">
            {QUICK_COUNTS.map((quick) => (
              <Button
                key={quick}
                type="button"
                variant="outline"
                size="xs"
                onClick={() => setCount(String(quick))}
              >
                {quick}
              </Button>
            ))}
          </div>
        </div>

        <div className="grid gap-1 rounded-lg bg-muted/40 p-3 text-xs">
          <p className="text-muted-foreground">Will create</p>
          <ul className="grid gap-0.5 font-mono">
            {names.slice(0, 4).map((name) => (
              <li key={name}>{name}</li>
            ))}
            {names.length > 4 && (
              <li className="text-muted-foreground">
                …and {names.length - 4} more
              </li>
            )}
          </ul>
        </div>

        {usesNameToken && (
          <p className="text-xs text-muted-foreground">
            Heads up: this machine uses <code>{'{{machineName}}'}</code>, so copies
            publish as <code>{machine.name} (1)</code>, <code>(2)</code>, … Switch it
            to <code>{'{{deviceId}}'}</code> if every copy needs a real device id.
          </p>
        )}

        <DialogFooter>
          <Button variant="outline" onClick={onClose}>
            Cancel
          </Button>
          <Button disabled={working} onClick={() => void submit()}>
            <CopyIcon />
            {working ? 'Duplicating…' : `Create ${parsed} cop${parsed === 1 ? 'y' : 'ies'}`}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
