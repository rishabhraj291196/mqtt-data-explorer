import { Controller, Delete, Get, Query, Sse, UseGuards } from '@nestjs/common';
import { filter, interval, map, merge, Observable } from 'rxjs';
import {
  ActiveWorkspace,
  WorkspaceScopeGuard,
} from '../workspaces/workspace.scope';
import { EventsService, SimEvent } from './events.service';

interface SseMessage {
  data: SimEvent | { type: 'ping'; at: string };
}

@UseGuards(WorkspaceScopeGuard)
@Controller('events')
export class EventsController {
  constructor(private readonly events: EventsService) {}

  /**
   * Live feed of everything the simulator does in this workspace.
   *
   * `EventSource` cannot send headers, so the UI passes `?workspaceId=` here —
   * the guard accepts either and still refuses an unknown one.
   */
  @Sse('stream')
  stream(@ActiveWorkspace() workspaceId: string): Observable<SseMessage> {
    // Heartbeat keeps proxies / browsers from closing an idle SSE connection.
    const heartbeat$ = interval(20_000).pipe(
      map((): SseMessage => ({
        data: { type: 'ping' as const, at: new Date().toISOString() },
      })),
    );
    const events$ = this.events.stream$.pipe(
      filter((event) => event.workspaceId === workspaceId),
      map((event): SseMessage => ({ data: event })),
    );
    return merge(events$, heartbeat$);
  }

  @Get('recent')
  recent(
    @ActiveWorkspace() workspaceId: string,
    @Query('limit') limit?: string,
  ): SimEvent[] {
    const parsed = Number(limit);
    return this.events.getRecent(
      workspaceId,
      Number.isFinite(parsed) && parsed > 0 ? Math.min(parsed, 300) : 300,
    );
  }

  @Delete('recent')
  clear(@ActiveWorkspace() workspaceId: string): { ok: true } {
    this.events.clear(workspaceId);
    return { ok: true };
  }
}
