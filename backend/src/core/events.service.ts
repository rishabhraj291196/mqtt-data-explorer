import { Injectable } from '@nestjs/common';
import { Observable, Subject } from 'rxjs';
import { MachineStatus } from '../machines/machine.types';

export type SimEventType = 'message' | 'status' | 'error' | 'machine';

export interface SimEvent {
  type: SimEventType;
  at: string;
  /** The project this happened in — the feed never mixes two of them. */
  workspaceId: string;
  machineId?: string;
  machineName?: string;
  /** message events */
  topic?: string;
  payload?: string;
  qos?: number;
  retain?: boolean;
  /** status events */
  status?: MachineStatus;
  /** error / machine events */
  message?: string;
}

const LOG_LIMIT = 300;

@Injectable()
export class EventsService {
  private readonly subject = new Subject<SimEvent>();
  private readonly recent: SimEvent[] = [];

  get stream$(): Observable<SimEvent> {
    return this.subject.asObservable();
  }

  emit(event: Omit<SimEvent, 'at'> & { at?: string }): SimEvent {
    const full: SimEvent = {
      ...event,
      at: event.at ?? new Date().toISOString(),
    };
    this.recent.push(full);
    if (this.recent.length > LOG_LIMIT) {
      this.recent.splice(0, this.recent.length - LOG_LIMIT);
    }
    this.subject.next(full);
    return full;
  }

  /**
   * The history is one shared ring buffer, so it is filtered on the way out —
   * a workspace only ever sees what its own machines did.
   */
  getRecent(workspaceId: string, limit = LOG_LIMIT): SimEvent[] {
    return this.recent
      .filter((event) => event.workspaceId === workspaceId)
      .slice(-limit);
  }

  /** Clearing the feed in one project leaves the others untouched. */
  clear(workspaceId: string): void {
    const kept = this.recent.filter(
      (event) => event.workspaceId !== workspaceId,
    );
    this.recent.length = 0;
    this.recent.push(...kept);
  }
}
