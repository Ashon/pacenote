import { useQueryClient } from '@tanstack/react-query'
import { FolderOpen } from 'lucide-react'
import { useState } from 'react'
import { Button } from '@/components/ui/button'
import { useText } from '@/lib/i18n'
import { REPO_FOLDERS_KEY, useRepoFolders } from '@/lib/tasks'
import { text } from './repo-folders.text'

/**
 * Settings > Todo: each repository's folder on this Mac, where its code tasks
 * open. Set the first time a task needs one; changed or forgotten here.
 */
export function RepoFolders() {
  const t = useText(text)
  const bridge = window.pacenoteDesktop?.tasks
  const client = useQueryClient()
  const repos = useRepoFolders().data
  const [error, setError] = useState<string>()
  if (!bridge || !repos) return null
  // Shared with the task rows, which open code tasks there
  const setRepos = (next: Record<string, string>) =>
    client.setQueryData(REPO_FOLDERS_KEY, next)
  const names = Object.keys(repos).sort((a, b) => a.localeCompare(b))

  const change = async (repo: string) => {
    setError(undefined)
    const check = await bridge.chooseFolder(repo)
    if (!check) return
    if (check.error || !check.matches) {
      setError(check.error ?? t.notCheckout(check.path, repo, check.remote))
      return
    }
    setRepos(await bridge.setRepo(repo, check.path))
  }

  return (
    <div className="px-4 pb-4">
      <p className="text-row">{t.title}</p>
      <p className="mt-0.5 text-meta text-muted-foreground">{t.help}</p>
      {names.length === 0 ? (
        <p className="mt-2 text-meta text-muted-foreground">{t.none}</p>
      ) : (
        <ul className="mt-2.5 divide-y divide-card overflow-hidden rounded-lg bg-well">
          {names.map((repo) => (
            <li key={repo} className="flex items-center gap-3 px-3 py-2">
              <span className="w-44 shrink-0 truncate font-mono text-meta font-semibold">
                {repo}
              </span>
              <span className="min-w-0 flex-1 truncate font-mono text-meta text-muted-foreground select-text">
                {repos[repo]}
              </span>
              <Button
                size="xs"
                variant="ghost"
                onClick={() => void change(repo)}
              >
                <FolderOpen />
                {t.change}
              </Button>
              <Button
                size="xs"
                variant="ghost"
                onClick={() =>
                  void bridge.setRepo(repo, undefined).then(setRepos)
                }
              >
                {t.forget}
              </Button>
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
