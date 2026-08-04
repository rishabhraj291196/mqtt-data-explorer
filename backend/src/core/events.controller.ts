import { Controller, Delete, Get, Query, Sse } from '@nestjs/common';
import { interval, map, merge, Observable } from 'rxjs';
import { EventsService, SimEvent } from './events.service';

interface SseMessage {
  data: SimEvent | { type: 'ping'; at: string };
}

@Controller('events')
export class EventsController {
  constructor(private readonly events: EventsService) {}

  /** Live feed of everything the simulator does. */
  @Sse('stream')
  stream(): Observable<SseMessage> {
    // Heartbeat keeps proxies / browsers from closing an idle SSE connection.
    const heartbeat$ = interval(20_000).pipe(
      map((): SseMessage => ({
        data: { type: 'ping' as const, at: new Date().toISOString() },
      })),
    );
    const events$ = this.events.stream$.pipe(
      map((event): SseMessage => ({ data: event })),
    );
    return merge(events$, heartbeat$);
  }

  @Get('recent')
  recent(@Query('limit') limit?: string): SimEvent[] {
    const parsed = Number(limit);
    return this.events.getRecent(
      Number.isFinite(parsed) && parsed > 0 ? Math.min(parsed, 300) : 300,
    );
  }

  @Delete('recent')
  clear(): { ok: true } {
    this.events.clear();
    return { ok: true };
  }
}
