import { execFile } from 'node:child_process'
import { randomUUID } from 'node:crypto'
import { promisify } from 'node:util'
import { remoteRepo } from '../../../src/tasks/folders.js'
import type {
  SessionSuggestion,
  TaskView,
  WorkEntry,
  WorkFile,
} from '../../../src/tasks/types.js'
import type { SessionSummary } from './session-index.js'

/**
 * Which of the sessions you started yourself were a task's work, from their
 * logs on this Mac (SessionIndex), with no model asked:
 * - tools: it named the task to Pacenote's task_context or close_task
 * - link: what you typed has the task's Slack message
 * - branch: it worked on a branch that the task's other sessions worked on,
 *   in the same repository (a session continued after /clear, or in a new
 *   terminal or worktree); a branch two tasks share links neither, and a
 *   session found this way lends the task no branch of its own
 * Sessions that only look like an open task's work, by the words they share
 * with it, are suggested for you to confirm, a couple per task at most: in
 * the task's repository when it has one, after the task was posted.
 */

type Session = Extract<WorkEntry, { kind: 'session' }>

/** A session folder's repository, as git tells it */
export interface RepoOf {
  /** Its git folder, the same for each of its worktrees */
  id: string
  /** owner/name, from its origin remote */
  name?: string
  /** The branch origin's HEAD points to */
  defaultBranch?: string
}

const run = promisify(execFile)

async function lookUp(cwd: string): Promise<RepoOf | undefined> {
  const git = (...args: string[]) =>
    run('git', ['-C', cwd, ...args], { timeout: 5_000 }).then(
      ({ stdout }) => stdout.trim() || undefined,
      () => undefined
    )
  const id = await git(
    'rev-parse',
    '--path-format=absolute',
    '--git-common-dir'
  )
  if (!id) return undefined
  const remote = await git('config', '--get', 'remote.origin.url')
  const head = await git('symbolic-ref', '--short', 'refs/remotes/origin/HEAD')
  return {
    id,
    name: remote ? remoteRepo(remote) : undefined,
    defaultBranch: head?.replace(/^origin\//, ''),
  }
}

/** Each session folder's repository, asked of git and kept a while */
export class RepoLookup {
  private readonly known = new Map<
    string,
    { at: number; repo: Promise<RepoOf | undefined> }
  >()

  get(cwd: string, now = Date.now()): Promise<RepoOf | undefined> {
    const kept = this.known.get(cwd)
    if (kept && now - kept.at < 10 * 60_000) return kept.repo
    const repo = lookUp(cwd)
    this.known.set(cwd, { at: now, repo })
    return repo
  }

  async all(
    folders: Iterable<string>
  ): Promise<Map<string, RepoOf | undefined>> {
    const repos = new Map<string, RepoOf | undefined>()
    for (const cwd of new Set(folders)) repos.set(cwd, await this.get(cwd))
    return repos
  }
}

/** Branches nobody does a task's work on alone */
const SHARED_BRANCHES = new Set([
  'main',
  'master',
  'develop',
  'development',
  'dev',
  'trunk',
  'HEAD',
])

export const isTaskBranch = (branch: string, repo?: RepoOf) =>
  !SHARED_BRANCHES.has(branch) && branch !== repo?.defaultBranch

/** How a task's message is written in a link to it */
function messageRefs(task: TaskView): string[] {
  const { conversation, message, permalink } = task.source
  return [
    `archives/${conversation}/p${message.replace('.', '')}`,
    ...(permalink ? [permalink.split('?')[0]!] : []),
  ]
}

const threadRef = (task: TaskView) =>
  task.source.thread
    ? `archives/${task.source.conversation}/p${task.source.thread.replace('.', '')}`
    : undefined

// ---------------------------------------------------------------------------
// The words a session shares with a task

const STOP_WORDS = new Set(
  (
    'the and for with from into about that this what when where which will ' +
    'would should could have been their there them they your yours ours ' +
    'review check look make sure need needs please answer reply send update ' +
    'write read help find give take keep move before after again also just ' +
    'more some other then than very team today tomorrow week asked asks ' +
    'someone something thing things done doing does work task tasks'
  ).split(' ')
)
const KOREAN_STOP_WORDS = new Set(
  '확인 검토 부탁 요청 관련 문의 답변 공유 진행 처리 작업 이번 다음 오늘 내일 해주세요'.split(
    ' '
  )
)
const PARTICLES = [
  '으로',
  '에서',
  '에게',
  '까지',
  '부터',
  '하고',
  '이랑',
  '처럼',
  '보다',
  '은',
  '는',
  '이',
  '가',
  '을',
  '를',
  '에',
  '의',
  '로',
  '와',
  '과',
  '도',
  '만',
  '랑',
]
const COMMON_HYPHENATED = new Set(
  (
    'follow-up check-in sign-off set-up re-run long-term up-to-date ' +
    'real-time built-in opt-in opt-out end-to-end one-off read-only ' +
    'self-hosted on-call'
  ).split(' ')
)

const escape = (text: string) => text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')

interface Clue {
  /** As shown: "#482", "retry_limit" */
  text: string
  weight: number
  test: RegExp
}

/**
 * What in a task is worth finding in a session: links to pull requests and
 * issues, issue keys, PR numbers, file names and code-like words from its
 * title, summary and reason, then its title's plain words
 */
export function cluesOf(task: TaskView): Clue[] {
  const text = [task.title, task.summary ?? '', task.reason].join('\n')
  const clues = new Map<string, Clue>()
  const add = (shown: string, weight: number, test: RegExp) => {
    const key = shown.toLowerCase()
    if (!clues.has(key)) clues.set(key, { text: shown, weight, test })
  }
  for (const [url] of text.matchAll(
    /https?:\/\/github\.com\/[\w.-]+\/[\w.-]+\/(?:pull|issues)\/\d+/gi
  ))
    add(url, 5, new RegExp(escape(url.replace(/^https?:\/\//, '')), 'i'))
  for (const [key] of text.matchAll(/\b[A-Z][A-Z0-9]{1,9}-\d+\b/g))
    add(key, 4, new RegExp(`\\b${escape(key)}\\b`))
  for (const [, number] of text.matchAll(/#(\d{2,})\b/g))
    add(
      `#${number}`,
      2,
      new RegExp(
        `(?:#|pull/|issues/|\\bpr\\s*#?|\\bpull(?: request)?\\s+#?)${number}\\b`,
        'i'
      )
    )
  for (const [file] of text.matchAll(
    /\b[\w-]+(?:\.[\w-]+)*\.(?:tsx?|jsx?|mjs|cjs|py|go|rs|java|kt|rb|swift|sql|ya?ml|json|toml|md|sh|tf)\b/g
  ))
    add(file, 3, new RegExp(`\\b${escape(file)}\\b`, 'i'))
  for (const [, code] of text.matchAll(/`([^`\n]{3,60})`/g))
    add(code!, 3, new RegExp(escape(code!), 'i'))
  for (const [word] of text.matchAll(
    /\b(?:[a-z]+[A-Z][A-Za-z0-9]*|[a-z0-9]+_[a-z0-9_]+|[a-z0-9]+(?:-[a-z0-9]+)+)\b/g
  )) {
    if (word.includes('-') && (word.length < 8 || COMMON_HYPHENATED.has(word)))
      continue
    add(word, 3, new RegExp(`\\b${escape(word)}\\b`, 'i'))
  }
  for (const [word] of task.title.matchAll(/[\p{L}\p{N}]+/gu)) {
    if (/\p{Script=Hangul}/u.test(word)) {
      const particle = PARTICLES.find(
        (p) => word.endsWith(p) && word.length - p.length >= 2
      )
      const stem = particle ? word.slice(0, -particle.length) : word
      if (stem.length < 2 || KOREAN_STOP_WORDS.has(stem)) continue
      add(stem, 1, new RegExp(escape(stem)))
      continue
    }
    const lower = word.toLowerCase()
    if (lower.length < 4 || /^\d+$/.test(lower) || STOP_WORDS.has(lower))
      continue
    // Its stem, so "payments" finds "payment" and "reviewing" "review"
    const stem = lower.length > 5 ? lower.slice(0, -2) : lower
    add(word, 1, new RegExp(`\\b${escape(stem)}`, 'i'))
  }
  return [...clues.values()]
}

/** What of a task's a session's text has: the score and what matched */
export function shared(
  clues: Clue[],
  text: string
): { score: number; strong: boolean; shares: string[] } {
  const matched = clues.filter((clue) => clue.test.test(text))
  return {
    score: matched.reduce((sum, clue) => sum + clue.weight, 0),
    strong: matched.some((clue) => clue.weight > 1),
    shares: matched
      .toSorted((a, b) => b.weight - a.weight)
      .slice(0, 3)
      .map((clue) => clue.text),
  }
}

/** Suggested per task at a time, at most */
const SUGGESTED_PER_TASK = 2
/** A session's typed text counts from a little before the task was posted */
const BEFORE_POSTED_MS = 10 * 60_000

// ---------------------------------------------------------------------------

export function linkSessions(input: {
  tasks: TaskView[]
  work: WorkFile
  /** Sessions in folders that are yours (not Pacenote's own, nor temporary) */
  sessions: SessionSummary[]
  /** Each session folder's repository, when it is in one */
  repos: Map<string, RepoOf | undefined>
}): {
  found: Session[]
  suggested: SessionSuggestion[]
  /** Sessions Pacenote opened, found by the marker in their first prompt */
  opened: { entry: string; session: string }[]
} {
  const { tasks, work, sessions, repos } = input
  const byId = new Map(tasks.map((task) => [task.id, task]))
  const byRef = new Map<string, TaskView>()
  for (const task of tasks) {
    byRef.set(task.id, task)
    if (task.source.permalink) byRef.set(task.source.permalink, task)
  }
  const linked = new Set(
    work.entries.flatMap((entry) =>
      entry.kind === 'session' && entry.session ? [entry.session] : []
    )
  )
  const notIt = new Set(
    (work.notIt ?? []).map((no) => `${no.task}\n${no.session}`)
  )
  const waiting = new Set((work.suggested ?? []).map((s) => s.session))
  const summaries = new Map(sessions.map((s) => [s.session, s]))
  const found: Session[] = []

  // A session Pacenote opened whose id it does not know yet (Codex's) is
  // its own entry's, by the marker in its first prompt.
  const opened: { entry: string; session: string }[] = []
  const unknown = work.entries.filter(
    (entry): entry is Session => entry.kind === 'session' && !entry.session
  )
  for (const summary of sessions) {
    if (linked.has(summary.session)) continue
    const first = summary.prompts[0]?.text ?? ''
    const entry = unknown.find((e) => first.includes(`[pacenote-task:${e.id}]`))
    if (!entry) continue
    linked.add(summary.session)
    opened.push({ entry: entry.id, session: summary.session })
  }

  const take = (
    summary: SessionSummary,
    task: TaskView,
    foundBy: Session['foundBy'],
    branch?: string
  ) => {
    if (notIt.has(`${task.id}\n${summary.session}`)) return
    linked.add(summary.session)
    found.push({
      kind: 'session',
      id: randomUUID(),
      task: task.id,
      tool: summary.tool,
      session: summary.session,
      cwd: summary.cwd,
      startedAt: summary.startedAt,
      found: true,
      foundBy,
      ...(branch ? { branch } : {}),
    })
  }
  const free = () => sessions.filter((s) => !linked.has(s.session))

  // It named the task to Pacenote's task tools.
  for (const summary of free()) {
    const task = summary.taskRefs.map((ref) => byRef.get(ref)).find(Boolean)
    if (task) take(summary, task, 'tools')
  }

  // What you typed has the task's message: the one it has first. A link to
  // a thread alone tells only when one task is in it.
  for (const summary of free()) {
    const typed = summary.prompts.map((prompt) => prompt.text).join('\n')
    let first: { task: TaskView; at: number } | undefined
    for (const task of tasks)
      for (const ref of messageRefs(task)) {
        const at = typed.indexOf(ref)
        if (at >= 0 && (!first || at < first.at)) first = { task, at }
      }
    if (first) {
      take(summary, first.task, 'link')
      continue
    }
    const inThread = tasks.filter((task) => {
      const ref = threadRef(task)
      return ref !== undefined && typed.includes(ref)
    })
    if (inThread.length === 1) take(summary, inThread[0]!, 'link')
  }

  // The branches each task's work is on, in its repository
  const owners = new Map<string, Set<string>>()
  const lending = [
    ...work.entries.filter(
      (entry): entry is Session =>
        entry.kind === 'session' && entry.foundBy !== 'branch'
    ),
    ...found,
  ]
  for (const entry of lending) {
    const summary = entry.session ? summaries.get(entry.session) : undefined
    const repo = summary ? repos.get(summary.cwd) : undefined
    if (!summary || !repo || !byId.has(entry.task)) continue
    for (const branch of summary.branches) {
      if (!isTaskBranch(branch, repo)) continue
      const key = `${repo.id}\n${branch}`
      owners.set(key, (owners.get(key) ?? new Set()).add(entry.task))
    }
  }
  for (const summary of free()) {
    const repo = repos.get(summary.cwd)
    if (!repo) continue
    const claims = new Map<string, string>()
    for (const branch of summary.branches)
      for (const task of owners.get(`${repo.id}\n${branch}`) ?? [])
        claims.set(task, claims.get(task) ?? branch)
    const [only] = claims
    if (claims.size !== 1 || !only) continue
    const task = byId.get(only[0])!
    if (Date.parse(summary.lastAt) > Date.parse(task.postedAt))
      take(summary, task, 'branch', only[1])
  }

  // Sessions that only look like an open task's work
  const open = tasks.filter((task) => task.status === 'open')
  const cluesFor = new Map(open.map((task) => [task.id, cluesOf(task)]))
  const candidates: (SessionSuggestion & { score: number })[] = []
  for (const summary of free()) {
    if (waiting.has(summary.session)) continue
    const repo = repos.get(summary.cwd)
    let best: { task: TaskView; score: number; shares: string[] } | undefined
    for (const task of open) {
      if (notIt.has(`${task.id}\n${summary.session}`)) continue
      const from = Date.parse(task.postedAt) - BEFORE_POSTED_MS
      if (Date.parse(summary.lastAt) < from) continue
      const sameRepo =
        !!task.repo && repo?.name?.toLowerCase() === task.repo.toLowerCase()
      if (task.repo && !sameRepo) continue
      const typed = summary.prompts
        .filter((prompt) => !prompt.at || Date.parse(prompt.at) >= from)
        .map((prompt) => prompt.text)
        .join('\n')
      if (!typed) continue
      const match = shared(cluesFor.get(task.id)!, typed)
      const enough = sameRepo
        ? match.score >= 3
        : match.strong && match.score >= 5
      if (!enough || (best && best.score >= match.score)) continue
      best = { task, score: match.score, shares: match.shares }
    }
    if (best)
      candidates.push({
        id: randomUUID(),
        kind: 'session',
        task: best.task.id,
        tool: summary.tool,
        session: summary.session,
        cwd: summary.cwd,
        startedAt: summary.startedAt,
        ...(summary.branch && isTaskBranch(summary.branch, repo)
          ? { branch: summary.branch }
          : {}),
        shares: best.shares,
        score: best.score,
      })
  }
  const perTask = new Map<string, number>()
  for (const s of work.suggested ?? [])
    perTask.set(s.task, (perTask.get(s.task) ?? 0) + 1)
  const suggested: SessionSuggestion[] = []
  for (const candidate of candidates.toSorted((a, b) => b.score - a.score)) {
    const count = perTask.get(candidate.task) ?? 0
    if (count >= SUGGESTED_PER_TASK) continue
    perTask.set(candidate.task, count + 1)
    const { score, ...suggestion } = candidate
    void score
    suggested.push(suggestion)
  }
  return { found, suggested, opened }
}
