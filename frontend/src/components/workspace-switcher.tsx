import { CheckIcon, ChevronsUpDownIcon, FolderPlusIcon, SettingsIcon } from 'lucide-react'
import { Button } from '@/components/ui/button'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { WORKSPACE_DOT } from '@/lib/workspace-colors'
import { cn } from '@/lib/utils'
import type { Workspace } from '@/lib/types'

interface WorkspaceSwitcherProps {
  workspaces: Workspace[]
  active: Workspace | null
  onSelect: (id: string) => void
  onCreate: () => void
  onManage: () => void
}

/** Which project is open, and the door to the other ones. */
export function WorkspaceSwitcher({
  workspaces,
  active,
  onSelect,
  onCreate,
  onManage,
}: WorkspaceSwitcherProps) {
  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        render={
          <Button variant="outline" size="sm" className="min-w-44 justify-start gap-2" />
        }
        aria-label="Switch workspace"
      >
        <span
          className={cn(
            'size-2.5 shrink-0 rounded-full',
            active ? WORKSPACE_DOT[active.color] : 'bg-muted-foreground',
          )}
          aria-hidden
        />
        <span className="truncate">{active?.name ?? 'No workspace'}</span>
        <span className="ms-auto text-xs text-muted-foreground">
          {active ? active.machineCount : 0}
        </span>
        <ChevronsUpDownIcon className="size-3.5 shrink-0 text-muted-foreground" />
      </DropdownMenuTrigger>
      <DropdownMenuContent className="w-72" align="start">
        <DropdownMenuLabel>Workspaces</DropdownMenuLabel>
        {workspaces.map((workspace) => (
          <DropdownMenuItem
            key={workspace.id}
            className="gap-2"
            onClick={() => onSelect(workspace.id)}
          >
            <span
              className={cn('size-2.5 shrink-0 rounded-full', WORKSPACE_DOT[workspace.color])}
              aria-hidden
            />
            <span className="min-w-0 flex-1">
              <span className="block truncate">{workspace.name}</span>
              <span className="block text-xs text-muted-foreground">
                {workspace.machineCount === 0
                  ? 'no machines'
                  : `${workspace.machineCount} machine${workspace.machineCount === 1 ? '' : 's'}`}
                {workspace.runningCount > 0 && ` · ${workspace.runningCount} running`}
              </span>
            </span>
            {workspace.id === active?.id && (
              <CheckIcon className="size-4 shrink-0 text-primary" />
            )}
          </DropdownMenuItem>
        ))}

        <DropdownMenuSeparator />
        <DropdownMenuItem className="gap-2" onClick={onCreate}>
          <FolderPlusIcon className="size-4" />
          New workspace
        </DropdownMenuItem>
        <DropdownMenuItem className="gap-2" disabled={!active} onClick={onManage}>
          <SettingsIcon className="size-4" />
          Workspace settings
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  )
}
