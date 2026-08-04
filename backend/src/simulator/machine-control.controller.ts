import { Controller, Param, Post } from '@nestjs/common';
import type { MachineRuntime } from '../machines/machine.types';
import { SimulatorService } from './simulator.service';

/**
 * Runtime actions for a single machine. Shares the `/machines` prefix with
 * MachinesController — CRUD lives there, start/stop lives here.
 */
@Controller('machines')
export class MachineControlController {
  constructor(private readonly simulator: SimulatorService) {}

  @Post(':id/start')
  start(@Param('id') id: string): MachineRuntime {
    return this.simulator.start(id);
  }

  @Post(':id/stop')
  stop(@Param('id') id: string): MachineRuntime {
    return this.simulator.stop(id);
  }

  @Post(':id/restart')
  restart(@Param('id') id: string): MachineRuntime {
    return this.simulator.restart(id);
  }

  @Post(':id/publish-once')
  publishOnce(
    @Param('id') id: string,
  ): Promise<{ topic: string; payload: string }> {
    return this.simulator.publishOnce(id);
  }

  @Post(':id/test-connection')
  testConnection(
    @Param('id') id: string,
  ): Promise<{ ok: boolean; message: string }> {
    return this.simulator.testConnection(id);
  }
}
