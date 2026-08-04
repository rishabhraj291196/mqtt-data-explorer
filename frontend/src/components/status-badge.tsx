import { Badge } from '@/components/ui/badge'
import { cn } from '@/lib/utils'
import type { MachineStatus } from '@/lib/types'

const STATUS_STYLES: Record<MachineStatus, { label: string; dot: string; className: string }> = {
  running: {
    label: 'Running',
    dot: 'bg-emerald-500',
    className: 'bg-emerald-500/10 text-emerald-600 dark:text-emerald-400',
  },
  connecting: {
    label: 'Connecting',
    dot: 'bg-amber-500 animate-pulse',
    className: 'bg-amber-500/10 text-amber-600 dark:text-amber-400',
  },
  error: {
    label: 'Error',
    dot: 'bg-destructive',
    className: 'bg-destructive/10 text-destructive',
  },
  stopped: {
    label: 'Stopped',
    dot: 'bg-muted-foreground/50',
    className: 'bg-muted text-muted-foreground',
  },
}

export function StatusBadge({
  status,
  className,
}: {
  status: MachineStatus
  className?: string
}) {
  const style = STATUS_STYLES[status]
  return (
    <Badge variant="ghost" className={cn(style.className, className)}>
      <span className={cn('size-1.5 rounded-full', style.dot)} />
      {style.label}
    </Badge>
  )
}
