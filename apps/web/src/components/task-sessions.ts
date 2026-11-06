import { localized } from '@src/i18n/locale'
import { CLI_NAMES } from '@src/tasks/own-ai'
import type { TaskDetail, WorkTool } from '@src/tasks/types'
import { text } from './task-row.text'

/**
 * A task's sessions in your AI tools, as its row tells them: which tool, how
 * a session continues, and how one you started yourself was found
 */

/** One of a task's sessions, with when it was last active */
export type Session = Extract<TaskDetail['work'][number], { kind: 'session' }>

/**
 * The AI tool that closed a task, or is at work on your tasks, by its MCP
 * client name ("claude-code")
 */
export function closedBy(client: string | undefined): string | undefined {
  if (!client) return undefined
  if (/claude/i.test(client)) return CLI_NAMES.claude
  if (/codex/i.test(client)) return CLI_NAMES.codex
  return client
}

/** A Codex session from the Codex app continues there; others in a terminal */
export const resumesInApp = (session: Session) =>
  !!session.app && session.tool === 'codex'

/** The command that continues a session in a terminal, to copy */
export const resumeCommand = (tool: WorkTool | undefined) =>
  tool === 'claude'
    ? 'claude --resume'
    : tool === 'opencode'
      ? 'opencode --session'
      : 'codex resume'

/** How a session you started yourself was known as the task's work */
export function foundHint(session: Session): string | undefined {
  if (!session.found) return undefined
  const t = localized(text)
  switch (session.foundBy) {
    case 'link':
      return t.foundLink
    case 'branch':
      return t.foundBranch(session.branch)
    case 'you':
      return t.foundYou
    default:
      return t.foundTools
  }
}

/** The session behind a log: the task's own, or an earlier task's */
export function sessionOf(
  detail: TaskDetail | null | undefined,
  entryId: string
): { entry: Session; title: string } | undefined {
  if (!detail) return undefined
  const own =
    detail.work.find(
      (item): item is Session => item.kind === 'session' && item.id === entryId
    ) ?? detail.suggested?.find((item) => item.id === entryId)
  if (own) return { entry: own, title: detail.task.title }
  const { thread, repo, person } = detail.context
  const earlier = [
    ...thread.tasks,
    ...(repo?.tasks ?? []),
    ...(person?.tasks ?? []),
  ].find((task) => task.session?.id === entryId)
  return earlier?.session
    ? { entry: earlier.session, title: earlier.title }
    : undefined
}
