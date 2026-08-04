import { useMemo } from 'react'
import { prettyJson } from '@/lib/format'
import { cn } from '@/lib/utils'

// Strings (optionally followed by a colon, which makes them keys), literals, numbers.
const TOKEN =
  /("(?:\\.|[^"\\])*"\s*:?)|(\btrue\b|\bfalse\b|\bnull\b)|(-?\d+(?:\.\d+)?(?:[eE][+-]?\d+)?)/g

interface Piece {
  text: string
  className?: string
}

function tokenize(source: string): Piece[] {
  const pieces: Piece[] = []
  let cursor = 0

  for (const match of source.matchAll(TOKEN)) {
    const start = match.index ?? 0
    if (start > cursor) pieces.push({ text: source.slice(cursor, start) })

    const [raw, stringOrKey, literal] = match
    if (stringOrKey) {
      pieces.push({
        text: raw,
        className: raw.trimEnd().endsWith(':')
          ? 'text-sky-700 dark:text-sky-300'
          : 'text-emerald-700 dark:text-emerald-400',
      })
    } else if (literal) {
      pieces.push({ text: raw, className: 'text-purple-600 dark:text-purple-400' })
    } else {
      pieces.push({ text: raw, className: 'text-amber-700 dark:text-amber-400' })
    }
    cursor = start + raw.length
  }

  if (cursor < source.length) pieces.push({ text: source.slice(cursor) })
  return pieces
}

/** Pretty-prints a JSON payload with light syntax colouring. */
export function JsonView({
  value,
  className,
}: {
  value: string
  className?: string
}) {
  const pieces = useMemo(() => tokenize(prettyJson(value)), [value])

  return (
    <pre
      className={cn(
        'font-mono text-[11px] leading-relaxed break-words whitespace-pre-wrap text-muted-foreground',
        className,
      )}
    >
      {pieces.map((piece, index) => (
        <span key={index} className={piece.className}>
          {piece.text}
        </span>
      ))}
    </pre>
  )
}
