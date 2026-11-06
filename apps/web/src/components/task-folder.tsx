import { InlineError } from '@/components/ui/inline-error'
import { CLI_NAMES } from '@src/tasks/own-ai'
import type { FolderCheck, TaskView, WorkTool } from '@src/tasks/types'
import { FolderOpen, Lock, SquareTerminal } from 'lucide-react'
import { useEffect, useState } from 'react'
import type * as React from 'react'
import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogTitle,
} from '@/components/ui/dialog'
import { Tooltip } from '@/components/ui/tooltip'
import { formatRelative, homePath } from '@/lib/format'
import { useText } from '@/lib/i18n'
import { cn } from '@/lib/utils'
import { text } from './task-row.text'

/**
 * The folder a code task's session opens in: said on Continue's buttons, and
 * asked when its repository has none yet
 */

/**
 * Where Continue opens, on hover: the folder, and the desktop app with the
 * task written in when sessions open there
 */
export function OpensIn({
  folder,
  app,
  children,
}: {
  folder: string | undefined
  /** The tool whose desktop app it opens */
  app?: WorkTool
  children: React.ReactElement
}) {
  const t = useText(text)
  const where = folder && homePath(folder)
  const content = app ? t.opensApp(app, where) : where && t.opensIn(where)
  if (!content) return children
  return <Tooltip content={content}>{children}</Tooltip>
}

type FolderProps = {
  task: TaskView
  tool: WorkTool
  onOpen: (folder: string) => Promise<string | undefined>
}

/**
 * Where the session opens, when its repository has no folder yet (or you
 * choose another): the likeliest folders, the first one chosen. The folders
 * are looked up each time it opens.
 */
export function FolderDialog({
  open,
  onClose,
  ...props
}: FolderProps & { open: boolean; onClose: () => void }) {
  return (
    <Dialog open={open} onOpenChange={(next) => !next && onClose()}>
      <DialogContent className="w-[34rem] max-w-[calc(100vw-2rem)] gap-4 p-6">
        <FolderChoice {...props} />
      </DialogContent>
    </Dialog>
  )
}

function FolderChoice({ task, tool, onOpen }: FolderProps) {
  const t = useText(text)
  const bridge = window.pacenoteDesktop?.tasks
  const [found, setFound] = useState<FolderCheck[]>()
  const [chosen, setChosen] = useState<string>()
  const [error, setError] = useState<string>()
  const [opening, setOpening] = useState(false)
  useEffect(() => {
    void bridge?.folders(task.id).then((folders) => {
      setFound(folders)
      setChosen((current) => current ?? folders[0]?.path)
    })
  }, [bridge, task.id])
  const choose = async () => {
    const check = await bridge?.chooseFolder(task.repo)
    if (!check) return
    setFound((list) => [
      check,
      ...(list ?? []).filter((f) => f.path !== check.path),
    ])
    setChosen(check.path)
  }
  const chosenCheck = found?.find((folder) => folder.path === chosen)
  return (
    <>
      <div className="flex flex-col gap-1.5">
        <DialogTitle className="text-heading">
          {task.repo ? t.whereIsRepo(task.repo) : t.whereToOpen}
        </DialogTitle>
        <DialogDescription className="text-body text-muted-foreground">
          {t.opensHere(CLI_NAMES[tool], Boolean(task.repo))}
        </DialogDescription>
      </div>
      <div
        role="radiogroup"
        aria-label={t.folder}
        className="flex flex-col gap-2"
      >
        {found === undefined && (
          <p className="text-body text-muted-foreground">
            {task.repo ? t.lookingForRepo(task.repo) : t.lookingForFolders}
          </p>
        )}
        {found?.length === 0 && task.repo && (
          <p className="text-body text-muted-foreground">
            {t.noCheckout(task.repo)}
          </p>
        )}
        {found?.map((folder) => (
          <FolderOption
            key={folder.path}
            folder={folder}
            repo={task.repo}
            chosen={folder.path === chosen}
            onChoose={() => setChosen(folder.path)}
          />
        ))}
        <Button
          size="sm"
          variant="outline"
          className="self-start"
          onClick={() => void choose()}
        >
          <FolderOpen />
          {t.chooseFolder}
        </Button>
      </div>
      <p className="flex items-start gap-2 rounded-[10px] bg-well px-3 py-2.5 text-meta text-muted-foreground">
        <Lock className="mt-px size-3.5 shrink-0" />
        {t.runsAsYou(CLI_NAMES[tool])}
      </p>
      <InlineError error={error} />
      <div className="flex justify-end gap-2">
        <DialogClose asChild>
          <Button variant="secondary">{t.cancel}</Button>
        </DialogClose>
        <Button
          disabled={!chosen || opening || !!chosenCheck?.error}
          onClick={async () => {
            setOpening(true)
            setError(await onOpen(chosen!))
            setOpening(false)
          }}
        >
          <SquareTerminal />
          {t.openHere(CLI_NAMES[tool])}
        </Button>
      </div>
    </>
  )
}

/**
 * A folder to open the session in: its path, its remote and changes, and
 * when you last worked in it
 */
function FolderOption({
  folder,
  repo,
  chosen,
  onChoose,
}: {
  folder: FolderCheck
  /** The task's repository, which the folder may not be */
  repo?: string
  chosen: boolean
  onChoose: () => void
}) {
  const t = useText(text)
  return (
    <button
      type="button"
      role="radio"
      aria-checked={chosen}
      onClick={onChoose}
      className={cn(
        'flex items-start gap-3 rounded-xl border px-3.5 py-3 text-left transition-colors',
        chosen
          ? 'border-primary/50 bg-primary/6'
          : 'border-border hover:border-primary/30'
      )}
    >
      <span
        className={cn(
          'mt-0.5 grid size-3.5 shrink-0 place-items-center rounded-full border',
          chosen ? 'border-primary' : 'border-muted-foreground/40'
        )}
      >
        {chosen && <span className="size-1.5 rounded-full bg-primary" />}
      </span>
      <span className="flex min-w-0 flex-col gap-0.5">
        <span className="font-mono text-body font-semibold break-all">
          {folder.path}
        </span>
        <span className="text-meta text-muted-foreground">
          {[
            folder.error?.replace(/\.$/, '') ??
              [
                folder.remote ? t.remote(folder.remote) : t.noRemote,
                folder.changes ? t.uncommitted(folder.changes) : t.clean,
              ].join(' · '),
            !folder.matches && !folder.error && repo
              ? t.notRepo(repo)
              : undefined,
            folder.usedAt ? t.used(formatRelative(folder.usedAt)) : undefined,
          ]
            .filter(Boolean)
            .join(' · ')}
        </span>
      </span>
    </button>
  )
}
