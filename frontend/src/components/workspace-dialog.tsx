import { useState } from 'react'
import { Trash2Icon, TriangleAlertIcon } from 'lucide-react'
import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { WORKSPACE_COLORS, type Workspace, type WorkspaceColor, type WorkspaceInput } from '@/lib/types'
import { WORKSPACE_COLOR_LABEL, WORKSPACE_DOT } from '@/lib/workspace-colors'
import { cn } from '@/lib/utils'

interface WorkspaceDialogProps {
  /** null creates a new project; a workspace edits that one. */
  workspace: Workspace | null
  /** Deleting the only project would leave machines nowhere to live. */
  canDelete: boolean
  onClose: () => void
  onSubmit: (input: WorkspaceInput) => Promise<Workspace | undefined>
  onDelete: (id: string) => Promise<boolean>
}

export function WorkspaceDialog({
  workspace,
  canDelete,
  onClose,
  onSubmit,
  onDelete,
}: WorkspaceDialogProps) {
  const [name, setName] = useState(workspace?.name ?? '')
  const [description, setDescription] = useState(workspace?.description ?? '')
  const [color, setColor] = useState<WorkspaceColor>(workspace?.color ?? 'sky')
  const [confirmDelete, setConfirmDelete] = useState(false)
  const [working, setWorking] = useState(false)

  const trimmed = name.trim()

  const save = async () => {
    if (!trimmed) return
    setWorking(true)
    const result = await onSubmit({
      name: trimmed,
      description: description.trim() || undefined,
      color,
    })
    setWorking(false)
    if (result) onClose()
  }

  const remove = async () => {
    if (!workspace) return
    setWorking(true)
    const removed = await onDelete(workspace.id)
    setWorking(false)
    if (removed) onClose()
  }

  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>
            {workspace ? `Workspace settings` : 'New workspace'}
          </DialogTitle>
          <DialogDescription>
            A workspace is one project. Its machines are only ever visible,
            startable and deletable from inside it.
          </DialogDescription>
        </DialogHeader>

        <div className="grid gap-1.5">
          <Label htmlFor="workspace-name">Name</Label>
          <Input
            id="workspace-name"
            value={name}
            placeholder="Factory A"
            autoFocus
            onChange={(event) => setName(event.target.value)}
          />
        </div>

        <div className="grid gap-1.5">
          <Label htmlFor="workspace-description">Description (optional)</Label>
          <Input
            id="workspace-description"
            value={description}
            placeholder="Staging broker, line 2 sensors"
            onChange={(event) => setDescription(event.target.value)}
          />
        </div>

        <div className="grid gap-1.5">
          <Label>Colour</Label>
          <div className="flex flex-wrap gap-1.5">
            {WORKSPACE_COLORS.map((option) => (
              <button
                key={option}
                type="button"
                aria-label={WORKSPACE_COLOR_LABEL[option]}
                aria-pressed={color === option}
                className={cn(
                  'size-7 rounded-full ring-offset-2 ring-offset-background transition-shadow',
                  WORKSPACE_DOT[option],
                  color === option && 'ring-2 ring-foreground/60',
                )}
                onClick={() => setColor(option)}
              />
            ))}
          </div>
        </div>

        {workspace && confirmDelete && (
          <p className="flex gap-2 rounded-lg bg-destructive/10 p-3 text-xs text-destructive">
            <TriangleAlertIcon className="mt-px size-3.5 shrink-0" />
            <span>
              Deleting <strong>{workspace.name}</strong> also deletes its{' '}
              {workspace.machineCount} machine
              {workspace.machineCount === 1 ? '' : 's'}. Move anything you want
              to keep to another workspace first.
            </span>
          </p>
        )}

        <DialogFooter className="sm:justify-between">
          {workspace && canDelete ? (
            <Button
              variant={confirmDelete ? 'destructive' : 'ghost'}
              disabled={working}
              onClick={() => {
                if (!confirmDelete) {
                  setConfirmDelete(true)
                  return
                }
                void remove()
              }}
            >
              <Trash2Icon />
              {confirmDelete ? 'Delete for good' : 'Delete workspace'}
            </Button>
          ) : (
            <span />
          )}
          <span className="flex gap-2">
            <Button variant="outline" onClick={onClose}>
              Cancel
            </Button>
            <Button disabled={!trimmed || working} onClick={() => void save()}>
              {working ? 'Saving…' : workspace ? 'Save changes' : 'Create workspace'}
            </Button>
          </span>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
