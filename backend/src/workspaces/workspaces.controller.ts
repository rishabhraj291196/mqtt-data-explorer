import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Patch,
  Post,
} from '@nestjs/common';
import { CreateWorkspaceDto, UpdateWorkspaceDto } from './dto/workspace.dto';
import type { WorkspaceWithCount } from './workspace.types';
import { WorkspacesService } from './workspaces.service';

/**
 * Managing the projects themselves. Deliberately *not* workspace-scoped —
 * this is the one place that is allowed to see every workspace, so the UI can
 * offer a switcher.
 */
@Controller('workspaces')
export class WorkspacesController {
  constructor(private readonly workspaces: WorkspacesService) {}

  @Get()
  findAll(): WorkspaceWithCount[] {
    return this.workspaces.findAll();
  }

  @Get(':id')
  findOne(@Param('id') id: string): WorkspaceWithCount {
    return this.workspaces.findOne(id);
  }

  @Post()
  create(@Body() dto: CreateWorkspaceDto): Promise<WorkspaceWithCount> {
    return this.workspaces.create(dto);
  }

  @Patch(':id')
  update(
    @Param('id') id: string,
    @Body() dto: UpdateWorkspaceDto,
  ): Promise<WorkspaceWithCount> {
    return this.workspaces.update(id, dto);
  }

  /** Takes every machine in the workspace with it. */
  @Delete(':id')
  remove(
    @Param('id') id: string,
  ): Promise<{ ok: true; machinesDeleted: number }> {
    return this.workspaces.remove(id);
  }
}
