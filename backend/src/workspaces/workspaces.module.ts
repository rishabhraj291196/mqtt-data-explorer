import { Global, Module } from '@nestjs/common';
import { MachinesModule } from '../machines/machines.module';
import { WorkspaceScopeGuard } from './workspace.scope';
import { WorkspacesController } from './workspaces.controller';
import { WorkspacesService } from './workspaces.service';
import { WorkspacesStore } from './workspaces.store';

/**
 * Global so that the machine, control and event routes can apply
 * `WorkspaceScopeGuard` without importing this module — which would close a
 * cycle, since the workspace service needs MachinesService to count and to
 * cascade deletes.
 */
@Global()
@Module({
  imports: [MachinesModule],
  controllers: [WorkspacesController],
  providers: [WorkspacesStore, WorkspacesService, WorkspaceScopeGuard],
  exports: [WorkspacesStore, WorkspacesService, WorkspaceScopeGuard],
})
export class WorkspacesModule {}
