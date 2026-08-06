import type { WorkspaceColor } from './types'

/**
 * Spelled out rather than built from a template — Tailwind only ships classes
 * it can see in the source.
 */
export const WORKSPACE_DOT: Record<WorkspaceColor, string> = {
  sky: 'bg-sky-500',
  violet: 'bg-violet-500',
  emerald: 'bg-emerald-500',
  amber: 'bg-amber-500',
  rose: 'bg-rose-500',
  slate: 'bg-slate-500',
}

export const WORKSPACE_RING: Record<WorkspaceColor, string> = {
  sky: 'ring-sky-500',
  violet: 'ring-violet-500',
  emerald: 'ring-emerald-500',
  amber: 'ring-amber-500',
  rose: 'ring-rose-500',
  slate: 'ring-slate-500',
}

export const WORKSPACE_COLOR_LABEL: Record<WorkspaceColor, string> = {
  sky: 'Sky',
  violet: 'Violet',
  emerald: 'Emerald',
  amber: 'Amber',
  rose: 'Rose',
  slate: 'Slate',
}
