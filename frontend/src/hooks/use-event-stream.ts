import { useCallback, useEffect, useRef, useState } from 'react'
import { api } from '@/lib/api'
import type { SimEvent } from '@/lib/types'

/** Only the newest handful of messages stay mounted. */
const EVENT_BUFFER = 10

/** Feed rows need a stable identity: the array index shifts as events arrive. */
export interface FeedEvent extends SimEvent {
  id: string
}

let feedSequence = 0
const withId = (event: SimEvent): FeedEvent => ({
  ...event,
  id: `evt-${(feedSequence += 1)}`,
})

/**
 * Lives inside the feed component on purpose: messages arrive several times a
 * second, and re-rendering the whole dashboard for each one is what made the
 * page feel heavy.
 */
/** Messages are flushed to state on a timer instead of one render each. */
const FLUSH_MS = 300

/**
 * @param machineId Keep only this machine's events; empty string keeps every
 *   machine. Filtering here rather than at render time matters: the buffer holds
 *   10 events in total, so a busy fleet would otherwise crowd one machine's
 *   messages out before they could be filtered.
 */
export function useEventStream(machineId = '') {
  const [events, setEvents] = useState<FeedEvent[]>([])
  const [streamConnected, setStreamConnected] = useState(false)
  const [renderedFilter, setRenderedFilter] = useState(machineId)
  const pausedRef = useRef(false)
  const inboxRef = useRef<FeedEvent[]>([])
  const filterRef = useRef(machineId)

  // Switching machine empties the buffer while rendering, so the previous
  // machine's rows never paint under the new filter.
  if (renderedFilter !== machineId) {
    setRenderedFilter(machineId)
    setEvents([])
  }

  // A fleet of machines can emit dozens of messages a second; rendering each
  // one separately is pure waste when only the newest 10 are ever shown.
  useEffect(() => {
    const timer = setInterval(() => {
      const inbox = inboxRef.current
      if (inbox.length === 0) return
      inboxRef.current = []
      setEvents((prev) => [...inbox.reverse(), ...prev].slice(0, EVENT_BUFFER))
    }, FLUSH_MS)
    return () => clearInterval(timer)
  }, [])

  // Point the stream at the new machine and backfill from the server's own
  // history — the SSE connection below is deliberately left alone.
  useEffect(() => {
    filterRef.current = machineId
    inboxRef.current = []

    let cancelled = false
    void api
      // A filtered view has to look further back: the machine's last 10 messages
      // may sit well inside the server's 300-event history.
      .recentEvents(machineId ? 300 : EVENT_BUFFER)
      .then((recent) => {
        if (cancelled) return
        const matching = machineId
          ? recent.filter((event) => event.machineId === machineId)
          : recent
        setEvents([...matching].reverse().slice(0, EVENT_BUFFER).map(withId))
      })
      .catch(() => undefined)

    return () => {
      cancelled = true
    }
  }, [machineId])

  useEffect(() => {
    const source = new EventSource(api.streamUrl)
    source.onopen = () => setStreamConnected(true)
    source.onerror = () => setStreamConnected(false)
    source.onmessage = (message: MessageEvent<string>) => {
      let event: SimEvent
      try {
        event = JSON.parse(message.data) as SimEvent
      } catch {
        return
      }
      if (event.type === 'ping') {
        setStreamConnected(true)
        return
      }
      if (pausedRef.current) return
      if (filterRef.current && event.machineId !== filterRef.current) return
      const inbox = inboxRef.current
      inbox.push(withId(event))
      if (inbox.length > EVENT_BUFFER) inbox.splice(0, inbox.length - EVENT_BUFFER)
    }

    return () => source.close()
  }, [])

  const clear = useCallback(async () => {
    setEvents([])
    await api.clearEvents().catch(() => undefined)
  }, [])

  const setPaused = useCallback((paused: boolean) => {
    pausedRef.current = paused
  }, [])

  return { events, streamConnected, clear, setPaused }
}
