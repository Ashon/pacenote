import type { HandedPart, HandedTask } from '@src/sessions/handed'
import {
  ChevronDown,
  ExternalLink,
  Layers,
  ListTodo,
  MessageSquare,
  ScrollText,
} from 'lucide-react'
import { useState } from 'react'
import { Markdown } from '@/components/markdown'
import { formatRelative } from '@/lib/format'
import { useText } from '@/lib/i18n'
import { cn } from '@/lib/utils'
import { text } from './handed-task.text'
import { PacenoteMonoMark } from './logo'
import { Pill } from './task-meta'
import { text as rowText } from './task-row.text'

/**
 * A task Pacenote handed a session, as the session's first message draws it
 * (src/sessions/handed.ts reads it): a card for each task, the group they are
 * in, and what Pacenote asks of the AI folded away, rather than the tags and
 * lines the AI reads. The New session page shows it the same way before it
 * is sent.
 */
export function HandedPartView({
  part,
  tool,
  count = 1,
}: {
  part: Exclude<HandedPart, { kind: 'text' }>
  /** Claude Code, Codex: who the brief is for */
  tool: string
  /** How many tasks the message hands over */
  count?: number
}) {
  const t = useText(text)
  switch (part.kind) {
    case 'handoff':
      return (
        <p className="flex items-center gap-1.5 text-meta text-muted-foreground">
          <PacenoteMonoMark className="size-3.5 text-primary" />
          {count > 1 ? t.handedOverMany(count) : t.handedOver}
        </p>
      )
    case 'task':
      return <TaskCard task={part.task} />
    case 'group':
      return (
        <div className="flex flex-col gap-0.5 px-1 pt-1">
          <p className="flex items-center gap-1.5 text-caption text-muted-foreground">
            <Layers aria-hidden="true" className="size-3.5" />
            {t.group}
          </p>
          <p className="text-section select-text">{part.title}</p>
          {part.summary && (
            <p className="text-copy text-foreground/85 select-text">
              {part.summary}
            </p>
          )}
          <p className="text-meta text-muted-foreground">
            {t.grouped(part.others)}
          </p>
        </div>
      )
    case 'brief':
      return <Brief lines={part.lines} tool={tool} />
  }
}

/** How many tasks a message's parts hand over */
export const tasksHanded = (parts: readonly { kind: string }[]) =>
  parts.filter((part) => part.kind === 'task').length

/** What you wrote, in a turn or with a task: Markdown, as the AI reads it */
export function Said({ text: said }: { text: string }) {
  return (
    <Markdown
      slack={false}
      className={cn(
        'text-body text-foreground/85 [--code-bg:var(--background)]',
        'prose-headings:mt-3 prose-headings:mb-1 prose-h1:text-section prose-h2:text-section prose-h3:text-section prose-h4:text-section',
        '[&>:first-child]:mt-0 [&>:last-child]:mb-0'
      )}
    >
      {said}
    </Markdown>
  )
}

function TaskCard({ task }: { task: HandedTask }) {
  const t = useText(text)
  const r = useText(rowText)
  const action = task.action && t.action[task.action]
  const who = task.promised
    ? r.promised
    : task.askedBy
      ? r.askedBy(task.askedBy)
      : undefined
  const meta = [who, task.where, task.at && formatRelative(task.at)].filter(
    Boolean
  )
  return (
    <article
      data-handed-task
      className="flex flex-col gap-1.5 rounded-[14px] bg-background px-3.5 py-3"
    >
      <p className="flex min-w-0 items-center gap-1.5 text-caption text-muted-foreground">
        <ListTodo aria-hidden="true" className="size-3.5 shrink-0" />
        <span>{t.task}</span>
        {action && (
          <>
            <span aria-hidden="true">·</span>
            <span>{action}</span>
          </>
        )}
        {task.repo && (
          <>
            <span aria-hidden="true">·</span>
            <span className="truncate font-mono">{task.repo}</span>
          </>
        )}
      </p>
      <a
        href={`#/tasks/${encodeURIComponent(task.id)}`}
        title={t.openTask}
        className="w-fit text-section text-foreground select-text hover:underline"
      >
        {task.title}
      </a>
      {(meta.length > 0 || task.due) && (
        <p className="flex flex-wrap items-center gap-x-2 gap-y-1 text-meta text-muted-foreground">
          {meta.join(' · ')}
          {task.due && <Pill tone="due">{r.due(task.due)}</Pill>}
        </p>
      )}
      {(task.summary ?? task.why) && (
        <Markdown
          slack={false}
          className={cn(
            'text-copy [--code-bg:var(--well)] [&>:first-child]:mt-0 [&>:last-child]:mb-0',
            !task.summary && 'text-muted-foreground'
          )}
        >
          {task.summary ?? task.why ?? ''}
        </Markdown>
      )}
      {(task.earlier.length > 0 || task.link) && <Earlier task={task} />}
    </article>
  )
}

/** What came before it, folded, and its message in Slack */
function Earlier({ task }: { task: HandedTask }) {
  const t = useText(text)
  const [open, setOpen] = useState(false)
  const slack = task.link && /^https:\/\/[^/]+\.slack\.com\//.test(task.link)
  return (
    <div className="flex flex-col gap-1.5">
      <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-meta">
        {task.earlier.length > 0 && (
          <button
            type="button"
            aria-expanded={open}
            onClick={() => setOpen(!open)}
            className="inline-flex items-center gap-1 font-medium text-muted-foreground hover:text-foreground"
          >
            <ChevronDown
              aria-hidden="true"
              className={cn('size-3.5', !open && '-rotate-90')}
            />
            {t.earlier(task.earlier.length)}
          </button>
        )}
        {task.link && /^https?:\/\//.test(task.link) && (
          <a
            href={task.link}
            target="_blank"
            rel="noreferrer"
            className="inline-flex items-center gap-1 font-medium text-primary hover:underline"
          >
            <ExternalLink aria-hidden="true" className="size-3.5" />
            {slack ? t.openSlack : t.openMessage}
          </a>
        )}
      </div>
      {open && (
        <ul className="flex flex-col gap-1.5 border-l-2 border-border pl-3">
          {task.earlier.map((before, index) => {
            const Icon = before.kind === 'pace' ? MessageSquare : ListTodo
            return (
              <li key={index} className="flex flex-col gap-0.5">
                <span className="flex items-center gap-1.5 text-caption text-muted-foreground">
                  <Icon aria-hidden="true" className="size-3.5" />
                  {before.kind === 'pace' ? t.earlierPace : t.earlierTask}
                </span>
                <span className="text-meta whitespace-pre-wrap text-foreground/80 select-text">
                  {before.text}
                </span>
              </li>
            )
          })}
        </ul>
      )}
    </div>
  )
}

/** What Pacenote asks of the AI, folded: how to start, close the task, talk */
function Brief({ lines, tool }: { lines: string[]; tool: string }) {
  const t = useText(text)
  const [open, setOpen] = useState(false)
  return (
    <div className="flex flex-col gap-1.5">
      <button
        type="button"
        aria-expanded={open}
        onClick={() => setOpen(!open)}
        className="inline-flex w-fit items-center gap-1.5 text-meta font-medium text-muted-foreground hover:text-foreground"
      >
        <ScrollText aria-hidden="true" className="size-3.5" />
        {t.brief(tool)}
        <ChevronDown
          aria-hidden="true"
          className={cn('size-3.5', open && 'rotate-180')}
        />
      </button>
      {open && (
        <ul className="flex list-disc flex-col gap-1 pl-5 text-meta text-muted-foreground marker:text-border select-text">
          {lines.map((line, index) => (
            <li key={index}>{line}</li>
          ))}
        </ul>
      )}
    </div>
  )
}
