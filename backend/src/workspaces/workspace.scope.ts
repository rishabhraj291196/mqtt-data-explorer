import {
  BadRequestException,
  CanActivate,
  createParamDecorator,
  ExecutionContext,
  Injectable,
  InternalServerErrorException,
  NotFoundException,
} from '@nestjs/common';
import type { Request } from 'express';
import { WorkspacesStore } from './workspaces.store';

/** Sent by the UI on every machine call. */
export const WORKSPACE_HEADER = 'x-workspace-id';

interface ScopedRequest extends Request {
  workspaceId?: string;
}

/**
 * The single choke point that keeps projects apart.
 *
 * Every route that touches machines runs through here first, so a request can
 * only ever name a workspace that exists — and the id it resolves is the one
 * the services filter by. A machine from another workspace is simply not
 * visible to that request, which is why nothing downstream has to remember to
 * check ownership.
 *
 * The id arrives as the `X-Workspace-Id` header, or as a `workspaceId` query
 * param for `EventSource`, which cannot set headers.
 */
@Injectable()
export class WorkspaceScopeGuard implements CanActivate {
  constructor(private readonly workspaces: WorkspacesStore) {}

  canActivate(context: ExecutionContext): boolean {
    const request = context.switchToHttp().getRequest<ScopedRequest>();
    const fromHeader = request.headers[WORKSPACE_HEADER];
    const fromQuery = (request.query as Record<string, unknown> | undefined)
      ?.workspaceId;
    const raw = fromHeader ?? fromQuery;
    const workspaceId = String(
      Array.isArray(raw) ? raw[0] : (raw ?? ''),
    ).trim();

    if (!workspaceId) {
      throw new BadRequestException(
        'No workspace selected — send the X-Workspace-Id header (or a ?workspaceId= query param)',
      );
    }
    if (!this.workspaces.exists(workspaceId)) {
      throw new NotFoundException(`Workspace ${workspaceId} not found`);
    }

    request.workspaceId = workspaceId;
    return true;
  }
}

/** The workspace `WorkspaceScopeGuard` resolved for this request. */
export const ActiveWorkspace = createParamDecorator(
  (_data: unknown, context: ExecutionContext): string => {
    const request = context.switchToHttp().getRequest<ScopedRequest>();
    if (!request.workspaceId) {
      // Guard missing on the route — fail loudly rather than serve unscoped data.
      throw new InternalServerErrorException(
        'WorkspaceScopeGuard must run before @ActiveWorkspace()',
      );
    }
    return request.workspaceId;
  },
);
