import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Patch,
  Post,
  UseGuards,
} from '@nestjs/common';
import {
  ActiveWorkspace,
  WorkspaceScopeGuard,
} from '../workspaces/workspace.scope';
import {
  CloneMachineDto,
  CreateMachineDto,
  MoveMachineDto,
  UpdateMachineDto,
} from './dto/machine.dto';
import type { MachineStats, MachineWithRuntime } from './machine.types';
import { MachinesService } from './machines.service';

/**
 * Every route here is scoped to one workspace: the guard resolves it, and the
 * service filters by it, so a machine id from another project reads as "not
 * found" no matter which verb is used on it.
 */
@UseGuards(WorkspaceScopeGuard)
@Controller('machines')
export class MachinesController {
  constructor(private readonly machines: MachinesService) {}

  @Get()
  findAll(@ActiveWorkspace() workspaceId: string): MachineWithRuntime[] {
    return this.machines.findAll(workspaceId);
  }

  /** Declared before `:id` so the literal path wins the route match. */
  @Get('stats')
  stats(@ActiveWorkspace() workspaceId: string): MachineStats[] {
    return this.machines.stats(workspaceId);
  }

  @Get(':id')
  findOne(
    @ActiveWorkspace() workspaceId: string,
    @Param('id') id: string,
  ): MachineWithRuntime {
    return this.machines.findOne(workspaceId, id);
  }

  @Post()
  create(
    @ActiveWorkspace() workspaceId: string,
    @Body() dto: CreateMachineDto,
  ): Promise<MachineWithRuntime> {
    return this.machines.create(workspaceId, dto);
  }

  @Patch(':id')
  update(
    @ActiveWorkspace() workspaceId: string,
    @Param('id') id: string,
    @Body() dto: UpdateMachineDto,
  ): Promise<MachineWithRuntime> {
    return this.machines.update(workspaceId, id, dto);
  }

  @Delete(':id')
  remove(
    @ActiveWorkspace() workspaceId: string,
    @Param('id') id: string,
  ): Promise<{ ok: true }> {
    return this.machines.remove(workspaceId, id);
  }

  @Post(':id/clone')
  clone(
    @ActiveWorkspace() workspaceId: string,
    @Param('id') id: string,
    @Body() dto: CloneMachineDto,
  ): Promise<MachineWithRuntime[]> {
    return this.machines.clone(workspaceId, id, dto.count ?? 1);
  }

  /** Re-files a machine under another project instead of re-creating it. */
  @Post(':id/move')
  move(
    @ActiveWorkspace() workspaceId: string,
    @Param('id') id: string,
    @Body() dto: MoveMachineDto,
  ): Promise<MachineWithRuntime> {
    return this.machines.move(workspaceId, id, dto.workspaceId);
  }
}
