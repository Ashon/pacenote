import { useQueryClient } from '@tanstack/react-query'
import type { RepoFolderRow } from '@src/tasks/types'
import {
  CircleCheck,
  CircleDashed,
  FolderOpen,
  FolderSearch,
} from 'lucide-react'
import { useState } from 'react'
import { Button } from '@/components/ui/button'
import { useText } from '@/lib/i18n'
import { REPO_FOLDERS_KEY, REPO_ROWS_KEY, useRepoRows } from '@/lib/tasks'
import { cn } from '@/lib/utils'
import { text } from './repo-folders.text'

/**
 * Settings > Todo: the repositories you work in, from your tasks and the
 * folders you worked in lately, each with where its code tasks open. A folder
 * is remembered the first time a task needs one, or here: a checkout found
 * where you worked lately is offered first until one is chosen.
 */
export function RepoFolders() {
  const t = useText(text)
  const bridge = window.pacenoteDesktop?.tasks
  const client = useQueryClient()
  const rows = useRepoRows().data
  const [error, setError] = useState<string>()
  if (!bridge || !rows) return null
  // Shared with the task rows, which open code tasks there
  const saved = async (next: Record<string, string>) => {
    client.setQueryData(REPO_FOLDERS_KEY, next)
    await client.invalidateQueries({ queryKey: REPO_ROWS_KEY })
  }
  const choose = async (repo: string) => {
    setError(undefined)
    const check = await bridge.chooseFolder(repo)
    if (!check) return
    if (check.error || !check.matches) {
      setError(check.error ?? t.notCheckout(check.path, repo, check.remote))
      return
    }
    await saved(await bridge.setRepo(repo, check.path))
  }

  return (
    <div className="px-4 pb-4">
      <p className="text-row">{t.title}</p>
      <p className="mt-0.5 text-meta text-muted-foreground">{t.help}</p>
      {rows.length === 0 ? (
        <p className="mt-2 text-meta text-muted-foreground">{t.none}</p>
      ) : (
        <ul className="mt-2.5 divide-y divide-card overflow-hidden rounded-lg bg-well">
          {rows.map((row) => (
            <li
              key={row.repo}
              data-repo={row.repo}
              className="flex items-center gap-3 px-3 py-2"
            >
              <StateIcon state={row.state} />
              <div className="min-w-0 flex-1">
                <p className="flex items-baseline gap-2">
                  <span className="truncate font-mono text-meta font-semibold">
                    {row.repo}
                  </span>
                  {row.tasks > 0 && (
                    <span className="shrink-0 text-caption text-muted-foreground">
                      {t.tasks(row.tasks)}
                    </span>
                  )}
                </p>
                <p
                  className={cn(
                    'truncate text-meta text-muted-foreground',
                    row.folder && 'font-mono select-text'
                  )}
                  title={row.folder}
                >
                  {row.folder ?? t.notChosen}
                </p>
                {row.folder && (
                  <p className="text-caption text-muted-foreground/80">
                    {row.state === 'remembered' ? t.remembered : t.found}
                  </p>
                )}
              </div>
              {row.state === 'found' && (
                <Button
                  size="xs"
                  variant="outline"
                  onClick={() =>
                    void bridge.setRepo(row.repo, row.folder).then(saved)
                  }
                >
                  {t.use}
                </Button>
              )}
              <Button
                size="xs"
                variant="ghost"
                onClick={() => void choose(row.repo)}
              >
                {row.state === 'remembered' ? <FolderOpen /> : <FolderSearch />}
                {row.state === 'remembered' ? t.change : t.choose}
              </Button>
              {row.state === 'remembered' && (
                <Button
                  size="xs"
                  variant="ghost"
                  onClick={() =>
                    void bridge.setRepo(row.repo, undefined).then(saved)
                  }
                >
                  {t.forget}
                </Button>
              )}
            </li>
          ))}
        </ul>
      )}
      {error && (
        <p role="alert" className="mt-2 text-meta text-status-failed">
          {error}
        </p>
      )}
    </div>
  )
}

function StateIcon({ state }: { state: RepoFolderRow['state'] }) {
  return state === 'remembered' ? (
    <CircleCheck className="size-3.5 shrink-0 text-status-succeeded" />
  ) : (
    <CircleDashed
      className={cn(
        'size-3.5 shrink-0',
        state === 'found' ? 'text-primary' : 'text-muted-foreground'
      )}
    />
  )
}
