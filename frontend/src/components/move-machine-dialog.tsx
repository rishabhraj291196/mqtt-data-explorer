import { useState } from 'react'
import { FolderInputIcon } from 'lucide-react'
import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Label } from '@/components/ui/label'
import { NativeSelect, NativeSelectOption } from '@/components/ui/native-select'
import type { Machine, Workspace } from '@/lib/types'

/**
 * Filed under the wrong project? Hand it over instead of deleting and
 * rebuilding it — the device keeps its id, counters and, if it is running, its
 * connection.
 */
export function MoveMachineDialog({
  machine,
  workspaces,
  currentWorkspaceId,
  onClose,
  onMove,
}: {
  machine: Machine | null
  workspaces: Workspace[]
  currentWorkspaceId: string
  onClose: () => void
  onMove: (id: string, workspaceId: string, workspaceName: string) => Promise<unknown>
}) {
  const targets = workspaces.filter((workspace) => workspace.id !== currentWorkspaceId)
  const [targetId, setTargetId] = useState(targets[0]?.id ?? '')
  const [working, setWorking] = useState(false)

  if (!machine) return null

  const target = targets.find((workspace) => workspace.id === targetId)

  const submit = async () => {
    if (!target) return
    setWorking(true)
    const result = await onMove(machine.id, target.id, target.name)
    setWorking(false)
    if (result !== undefined) onClose()
  }

  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Move {machine.name}</DialogTitle>
          <DialogDescription>
            It disappears from this workspace and shows up in the one you pick.
            Nothing about the broker, topic or payload changes.
          </DialogDescription>
        </DialogHeader>

        {targets.length === 0 ? (
          <p className="rounded-lg bg-muted/40 p-3 text-sm text-muted-foreground">
            There is nowhere to move it — create a second workspace first.
          </p>
        ) : (
          <div className="grid gap-1.5">
            <Label htmlFor="move-target">Move to</Label>
            <NativeSelect
              id="move-target"
              className="w-full"
              value={targetId}
              onChange={(event) => setTargetId(event.target.value)}
            >
              {targets.map((workspace) => (
                <NativeSelectOption key={workspace.id} value={workspace.id}>
                  {workspace.name}
                </NativeSelectOption>
              ))}
            </NativeSelect>
          </div>
        )}

        <DialogFooter>
          <Button variant="outline" onClick={onClose}>
            Cancel
          </Button>
          <Button disabled={!target || working} onClick={() => void submit()}>
            <FolderInputIcon />
            {working ? 'Moving…' : 'Move machine'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
