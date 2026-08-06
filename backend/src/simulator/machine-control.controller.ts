import { Controller, Param, Post, UseGuards } from '@nestjs/common';
import type { MachineRuntime } from '../machines/machine.types';
import {
  ActiveWorkspace,
  WorkspaceScopeGuard,
} from '../workspaces/workspace.scope';
import { SimulatorService } from './simulator.service';

/**
 * Runtime actions for a single machine. Shares the `/machines` prefix with
 * MachinesController — CRUD lives there, start/stop lives here — and the same
 * workspace scoping: you cannot start a machine you cannot see.
 */
@UseGuards(WorkspaceScopeGuard)
@Controller('machines')
export class MachineControlController {
  constructor(private readonly simulator: SimulatorService) {}

  @Post(':id/start')
  start(
    @ActiveWorkspace() workspaceId: string,
    @Param('id') id: string,
  ): MachineRuntime {
    return this.simulator.start(workspaceId, id);
  }

  @Post(':id/stop')
  stop(
    @ActiveWorkspace() workspaceId: string,
    @Param('id') id: string,
  ): MachineRuntime {
    return this.simulator.stop(workspaceId, id);
  }

  @Post(':id/restart')
  restart(
    @ActiveWorkspace() workspaceId: string,
    @Param('id') id: string,
  ): MachineRuntime {
    return this.simulator.restart(workspaceId, id);
  }

  @Post(':id/publish-once')
  publishOnce(
    @ActiveWorkspace() workspaceId: string,
    @Param('id') id: string,
  ): Promise<{ topic: string; payload: string }> {
    return this.simulator.publishOnce(workspaceId, id);
  }

  @Post(':id/test-connection')
  testConnection(
    @ActiveWorkspace() workspaceId: string,
    @Param('id') id: string,
  ): Promise<{ ok: boolean; message: string }> {
    return this.simulator.testConnection(workspaceId, id);
  }
}
