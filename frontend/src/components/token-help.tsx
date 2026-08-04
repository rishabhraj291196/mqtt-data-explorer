import { useEffect, useState } from 'react'
import { BookOpenIcon, CircleHelpIcon } from 'lucide-react'
import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog'
import { api } from '@/lib/api'
import type { TokenDoc } from '@/lib/types'

export function TokenHelp() {
  const [open, setOpen] = useState(false)
  const [tokens, setTokens] = useState<TokenDoc[]>([])

  useEffect(() => {
    if (!open || tokens.length > 0) return
    void api
      .tokens()
      .then((response) => setTokens(response.tokens))
      .catch(() => undefined)
  }, [open, tokens.length])

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger
        render={<Button variant="outline" size="sm" />}
        aria-label="Token reference"
      >
        <CircleHelpIcon />
        Tokens
      </DialogTrigger>
      <DialogContent className="sm:max-w-2xl max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Dummy data tokens</DialogTitle>
          <DialogDescription>
            Put these anywhere in the JSON template or the topic. A value that is
            exactly one token keeps its real type — <code>"temp": "{'{{'}float:1:2:1{'}}'}"</code>{' '}
            publishes <code>"temp": 1.4</code>, a number, not a string.
          </DialogDescription>
        </DialogHeader>

        <a
          href="/docs.html"
          target="_blank"
          rel="noreferrer"
          className="inline-flex items-center gap-1.5 text-sm text-primary hover:underline"
        >
          <BookOpenIcon className="size-3.5" />
          Full JSON reference — arguments, defaults, worked examples
        </a>

        <div className="divide-y rounded-lg ring-1 ring-foreground/10">
          {tokens.map((token) => (
            <div key={token.token} className="grid gap-1 p-3">
              <code className="font-mono text-xs text-primary">{token.token}</code>
              <p className="text-sm">{token.description}</p>
              <p className="font-mono text-xs text-muted-foreground">{token.example}</p>
            </div>
          ))}
          {tokens.length === 0 && (
            <p className="p-4 text-sm text-muted-foreground">Loading…</p>
          )}
        </div>
      </DialogContent>
    </Dialog>
  )
}
