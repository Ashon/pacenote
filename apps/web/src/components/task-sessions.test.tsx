import type { RelatedTask, TaskDetail, TaskView } from '@src/tasks/types'
import { describe, expect, it } from 'vitest'
import {
  closedBy,
  foundHint,
  resumeCommand,
  resumesInApp,
  sessionOf,
  type Session,
} from './task-sessions'

const session = (id: string, extra: Partial<Session> = {}): Session => ({
  kind: 'session',
  id,
  task: 't1',
  tool: 'claude',
  session: `${id}-tool-id`,
  cwd: '/Users/me/code/pay',
  startedAt: '2026-11-01T09:00:00Z',
  ...extra,
})

const view: TaskView = {
  id: 't1',
  source: { conversation: 'C1', label: '#payments', message: '1' },
  title: 'Review the retry PR',
  kind: 'asked',
  confidence: 'sure',
  reason: 'asked by name',
  postedAt: '2026-11-01T09:00:00Z',
  foundAt: '2026-11-01T09:05:00Z',
  status: 'open',
  faded: false,
}

const earlier = (id: string, extra: Partial<RelatedTask> = {}) => ({
  id,
  title: `Earlier ${id}`,
  where: '#payments',
  postedAt: '2026-10-20T09:00:00Z',
  status: 'done' as const,
  ...extra,
})

describe("a task's sessions", () => {
  it('names the AI tool by its MCP client name', () => {
    expect(closedBy(undefined)).toBeUndefined()
    expect(closedBy('claude-code')).toBe('Claude Code')
    expect(closedBy('Codex-MCP')).toBe('Codex')
    expect(closedBy('cursor')).toBe('cursor')
  })

  it('continues a Codex app session in the app, others in a terminal', () => {
    expect(resumesInApp(session('s1', { tool: 'codex', app: true }))).toBe(true)
    expect(resumesInApp(session('s1', { tool: 'codex' }))).toBe(false)
    expect(resumesInApp(session('s1', { tool: 'claude', app: true }))).toBe(
      false
    )
  })

  it("gives each tool's command to continue a session", () => {
    expect(resumeCommand('claude')).toBe('claude --resume')
    expect(resumeCommand('opencode')).toBe('opencode --session')
    expect(resumeCommand('codex')).toBe('codex resume')
    expect(resumeCommand(undefined)).toBe('codex resume')
  })

  it('says how a session you started yourself was found', () => {
    expect(foundHint(session('s1'))).toBeUndefined()
    expect(foundHint(session('s1', { found: true }))).toBe(
      "Found: it used Pacenote's task tools for this task"
    )
    expect(foundHint(session('s1', { found: true, foundBy: 'link' }))).toBe(
      "Found: what you typed has this task's Slack message"
    )
    expect(
      foundHint(
        session('s1', { found: true, foundBy: 'branch', branch: 'fix/retry' })
      )
    ).toBe("Found: it worked on fix/retry, where this task's work is")
    expect(foundHint(session('s1', { found: true, foundBy: 'you' }))).toBe(
      'You said it is this task’s work'
    )
  })

  it("finds the session behind a log: the task's own, or an earlier one's", () => {
    const detail: TaskDetail = {
      task: view,
      cli: 'claude',
      work: [session('own')],
      suggested: [{ ...session('maybe'), shares: ['#482'] }],
      context: {
        thread: { runs: [], tasks: [earlier('e1')] },
        repo: {
          name: 'acme/pay',
          tasks: [earlier('e2', { session: session('theirs') })],
        },
      },
    }
    expect(sessionOf(undefined, 'own')).toBeUndefined()
    expect(sessionOf(detail, 'own')).toEqual({
      entry: detail.work[0],
      title: 'Review the retry PR',
    })
    expect(sessionOf(detail, 'maybe')?.title).toBe('Review the retry PR')
    expect(sessionOf(detail, 'theirs')).toEqual({
      entry: session('theirs'),
      title: 'Earlier e2',
    })
    expect(sessionOf(detail, 'nowhere')).toBeUndefined()
  })
})
