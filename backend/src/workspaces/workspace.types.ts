/**
 * Fixed palette — the UI maps each name to a static Tailwind class, so colours
 * have to come from a closed set rather than free-form hex.
 */
export const WORKSPACE_COLORS = [
  'sky',
  'violet',
  'emerald',
  'amber',
  'rose',
  'slate',
] as const;

export type WorkspaceColor = (typeof WORKSPACE_COLORS)[number];

/**
 * A project boundary.
 *
 * Every machine belongs to exactly one workspace and is only ever reachable
 * through it — see `WorkspaceScopeGuard`. That is what lets one person keep a
 * "Factory A" fleet and a "Customer demo" fleet side by side without either
 * one seeing, starting or deleting the other's machines.
 */
export interface Workspace {
  id: string;
  name: string;
  description?: string;
  color: WorkspaceColor;
  createdAt: string;
  updatedAt: string;
}

/** What the API returns — the tallies the switcher shows next to each name. */
export type WorkspaceWithCount = Workspace & {
  machineCount: number;
  runningCount: number;
};
