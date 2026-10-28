import { areaChoices, type AreaChoice, guessArea } from '@src/you/guess'
import type { AreaView } from '@src/you/types'
import { Check, ChevronDown, Folder } from 'lucide-react'
import { useState } from 'react'
import type * as React from 'react'
import { Button } from '@/components/ui/button'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { Input } from '@/components/ui/input'
import { useText } from '@/lib/i18n'
import { useAddTask } from '@/lib/tasks'
import { text } from './tasks-page.text'

/**
 * Todo's New task (Cmd-N): a task of your own, on This Mac, in the project
 * its words point to (src/you/guess.ts) or the one you pick. A task joins a
 * project by its repository, so only projects with one are offered. It
 * stays open for the next one; Esc closes it.
 */
export function NewTask({
  areas,
  onAdded,
  onClose,
}: {
  areas: readonly AreaView[] | undefined
  /** The task just added, to show it at once */
  onAdded: (id: string) => void
  onClose: () => void
}) {
  const t = useText(text)
  const add = useAddTask()
  const [title, setTitle] = useState('')
  // undefined: the guess; null: no project, as you picked
  const [picked, setPicked] = useState<AreaChoice | null>()
  const [error, setError] = useState<string>()
  const [busy, setBusy] = useState(false)
  const choices = areaChoices(areas ?? [])
  const guess = picked === undefined ? guessArea(title, areas ?? []) : undefined
  const project = picked === undefined ? guess : (picked ?? undefined)

  const submit = async (event: React.FormEvent) => {
    event.preventDefault()
    if (!title.trim() || busy) return
    setBusy(true)
    const result = await add(title, project?.repo)
    setBusy(false)
    setError(result.error)
    if (!result.id) return
    setTitle('')
    setPicked(undefined)
    onAdded(result.id)
  }

  return (
    <form aria-label={t.newTask} className="mt-5" onSubmit={submit}>
      <div className="flex items-center gap-2">
        <Input
          autoFocus
          aria-label={t.newTaskLabel}
          placeholder={t.newTaskPlaceholder}
          value={title}
          maxLength={120}
          className="h-9 flex-1"
          onChange={(event) => setTitle(event.target.value)}
          onKeyDown={(event) => {
            if (event.key !== 'Escape') return
            event.preventDefault()
            onClose()
          }}
        />
        {choices.length > 0 && (
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button
                type="button"
                size="sm"
                variant="outline"
                aria-label={`${t.project}: ${project?.name ?? t.noProject}`}
              >
                <Folder />
                {project?.name ?? t.noProject}
                <ChevronDown />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent className="min-w-64">
              {choices.map((choice) => (
                <DropdownMenuItem
                  key={choice.id}
                  className="h-auto py-1.5"
                  onSelect={() => setPicked(choice)}
                >
                  <Check
                    className={
                      project?.id === choice.id ? 'text-primary' : 'invisible'
                    }
                  />
                  <span className="flex min-w-0 flex-col">
                    <span className="truncate">{choice.name}</span>
                    <span className="truncate font-mono text-meta text-muted-foreground">
                      {choice.repo}
                      {guess?.id === choice.id && ` · ${t.guessed}`}
                    </span>
                  </span>
                </DropdownMenuItem>
              ))}
              <DropdownMenuSeparator />
              <DropdownMenuItem
                className="h-auto py-1.5"
                onSelect={() => setPicked(null)}
              >
                <Check className={project ? 'invisible' : 'text-primary'} />
                <span className="flex flex-col">
                  <span>{t.noProject}</span>
                  <span className="text-meta text-muted-foreground">
                    {t.keptHere}
                  </span>
                </span>
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        )}
        <Button type="submit" size="sm" disabled={!title.trim() || busy}>
          {t.add}
        </Button>
      </div>
      <p className="mt-1.5 text-meta text-muted-foreground">
        {[t.addHint, guess && t.guessedFrom(guess.word)]
          .filter(Boolean)
          .join(' · ')}
      </p>
      {error && (
        <p role="alert" className="mt-1.5 text-copy text-status-failed">
          {error}
        </p>
      )}
    </form>
  )
}
