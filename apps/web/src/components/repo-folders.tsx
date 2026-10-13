import { FolderOpen } from 'lucide-react'
import { useEffect, useState } from 'react'
import { Button } from '@/components/ui/button'

/**
 * Settings > Todo: each repository's folder on this Mac, where its code tasks
 * open. Set the first time a task needs one; changed or forgotten here.
 */
export function RepoFolders() {
  const bridge = window.pacenoteDesktop?.tasks
  const [repos, setRepos] = useState<Record<string, string>>()
  const [error, setError] = useState<string>()
  useEffect(() => {
    void bridge?.repos().then(setRepos)
  }, [bridge])
  if (!bridge || !repos) return null
  const names = Object.keys(repos).sort((a, b) => a.localeCompare(b))

  const change = async (repo: string) => {
    setError(undefined)
    const check = await bridge.chooseFolder(repo)
    if (!check) return
    if (check.error || !check.matches) {
      setError(
        check.error ??
          `${check.path} is not a checkout of ${repo}${check.remote ? ` (its remote is ${check.remote})` : ''}.`
      )
      return
    }
    setRepos(await bridge.setRepo(repo, check.path))
  }

  return (
    <div className="px-4 pb-4">
      <p className="text-sm font-medium">Repository folders</p>
      <p className="mt-0.5 text-xs text-muted-foreground">
        Where each repository&apos;s code tasks open. Chosen the first time a
        task needs one; Pacenote checks that the folder&apos;s git remote
        matches.
      </p>
      {names.length === 0 ? (
        <p className="mt-2 text-xs text-muted-foreground">None yet.</p>
      ) : (
        <ul className="mt-2.5 divide-y divide-card overflow-hidden rounded-lg bg-well">
          {names.map((repo) => (
            <li key={repo} className="flex items-center gap-3 px-3 py-2">
              <span className="w-44 shrink-0 truncate font-mono text-[12.5px] font-semibold">
                {repo}
              </span>
              <span className="min-w-0 flex-1 truncate font-mono text-xs text-muted-foreground select-text">
                {repos[repo]}
              </span>
              <Button
                size="xs"
                variant="ghost"
                onClick={() => void change(repo)}
              >
                <FolderOpen />
                Change
              </Button>
              <Button
                size="xs"
                variant="ghost"
                onClick={() =>
                  void bridge.setRepo(repo, undefined).then(setRepos)
                }
              >
                Forget
              </Button>
            </li>
          ))}
        </ul>
      )}
      {error && (
        <p role="alert" className="mt-2 text-xs text-status-failed">
          {error}
        </p>
      )}
    </div>
  )
}
