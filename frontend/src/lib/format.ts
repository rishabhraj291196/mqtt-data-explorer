export function formatInterval(ms: number): string {
  if (ms < 1000) return `${ms}ms`
  if (ms < 60_000) {
    const seconds = ms / 1000
    return `${Number.isInteger(seconds) ? seconds : seconds.toFixed(1)}s`
  }
  const minutes = ms / 60_000
  return `${Number.isInteger(minutes) ? minutes : minutes.toFixed(1)}m`
}

export function formatRelative(iso: string | null): string {
  if (!iso) return 'never'
  const diff = Date.now() - new Date(iso).getTime()
  if (diff < 1500) return 'just now'
  if (diff < 60_000) return `${Math.round(diff / 1000)}s ago`
  if (diff < 3_600_000) return `${Math.round(diff / 60_000)}m ago`
  return `${Math.round(diff / 3_600_000)}h ago`
}

export function formatClock(iso: string): string {
  const date = new Date(iso)
  const pad = (value: number) => value.toString().padStart(2, '0')
  return `${pad(date.getHours())}:${pad(date.getMinutes())}:${pad(date.getSeconds())}.${date
    .getMilliseconds()
    .toString()
    .padStart(3, '0')}`
}

export function formatCount(value: number): string {
  return value.toLocaleString()
}

/** Pretty-prints JSON when possible, otherwise returns the raw string. */
export function prettyJson(value: string): string {
  try {
    return JSON.stringify(JSON.parse(value), null, 2)
  } catch {
    return value
  }
}
