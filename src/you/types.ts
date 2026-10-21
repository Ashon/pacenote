import type { WorkTool } from '../tasks/types.js'
import type { Switch } from '../tasks/own-ai.js'

/**
 * Your work identity: where you contribute (areas), how (roles), what is going
 * on in each (now) and what you did there lately, from your tasks and your
 * Claude Code and Codex sessions on this Mac (src/you/areas.ts). The areas and
 * your fixes to them are kept in you.json, which only the desktop app writes;
 * the rest is counted again from the tasks and sessions each time. Plain data,
 * so the screen and the MCP server read the same shapes.
 */

/** What an area is made of: a repository, a Slack channel, a user group */
export type AreaPartKind = 'repo' | 'channel' | 'group'

export interface AreaPart {
  kind: AreaPartKind
  /** repo: owner/name; channel: its Slack ID; group: its @handle */
  id: string
  /** As shown: "Ashon/payments", "#payments", "@infra-oncall" */
  label: string
}

/** An area as you.json keeps it */
export interface AreaRecord {
  id: string
  name: string
  /** You named it: parts that join later do not rename it */
  named?: boolean
  parts: AreaPart[]
  /** Parts you took out (partKey), not put back in by themselves */
  out?: string[]
  createdAt: string
  /** When you said it is not yours anymore: hidden, its parts stay with it */
  left?: string
}

export interface YouFile {
  version: 1
  areas: AreaRecord[]
  /** When you said the areas look right, or finished fixing them */
  confirmedAt?: string
  /**
   * Who you are on GitHub (gh's login) and in git (its global email), and
   * when they were looked up
   */
  accounts?: { checkedAt: string; github?: string; git?: string }
}

/**
 * How you contribute to an area, as your work there shows it: you build in
 * it (sessions in its repositories), answer for it (people ask you there),
 * review in it, or are on call for it (its user group asks you)
 */
export type AreaRole = 'build' | 'answer' | 'review' | 'on-call'

/** An area as the You screen and my_work show it */
export interface AreaView {
  id: string
  name: string
  parts: AreaPart[]
  /** resting: nothing in it for 4 weeks */
  state: 'active' | 'resting'
  /** Each with what shows it: "9 sessions in 30 days" */
  roles: { role: AreaRole; evidence: string }[]
  /** Its open tasks, newest first */
  now: { id: string; title: string; askedBy?: string; due?: string }[]
  /** A session in it active in the last 15 minutes */
  working?: { tool: WorkTool; at: string }
  /** Its tasks done or closed in the last 30 days, newest first */
  lately: { id: string; title: string; at: string; outcome?: string }[]
  /** How many more of those there are than lately shows */
  latelyMore: number
  /** Who asks you most there, most first */
  people: string[]
  /** Its tasks and sessions each week, the last 8 weeks, this week last */
  weeks: number[]
  lastActiveAt?: string
}

/** You, as the You screen shows you */
export interface YouView {
  /** Active ones first, by their last work, then resting ones */
  areas: AreaView[]
  /** The areas were found and you have not looked at them yet */
  firstLook: boolean
  accounts: {
    slack?: { name: string; team?: string }
    github?: string
    git?: string
  }
  /** When the areas were last counted */
  at: string
}

/**
 * How a task ended, or where it stands, before it is put in words
 * (src/tasks/context.ts): done-already is for the screens that count a task
 * dismissed as done already as your work
 */
export type Outcome =
  | { kind: 'done-in'; by: string; note?: string }
  | { kind: 'done'; tool?: WorkTool }
  | { kind: 'replied' | 'checked' | 'settled' | 'dismissed' | 'done-already' }
  | { kind: 'worked'; tool: WorkTool }

/** The area a task is in, for its row */
export interface TaskArea {
  id: string
  name: string
}

// Recaps (src/you/recap.ts)

export type RecapPeriod = 'day' | 'week' | 'month'

/** A run of Pace's you asked for: when, where, and the request's first line */
export interface RunLine {
  at: string
  /** Where it was asked: "#payments" */
  label: string
  request: string
}

/** One line of a recap */
export interface RecapItem {
  title: string
  at?: string
  /** What else to say: how it ended, who asked, the repository */
  note?: string
  /** The task it is, to open it */
  task?: string
  /** A request to Pace (a run), rather than a task or a commit */
  run?: true
  // What the title and note are worded from, so a prompt can word them in
  // English whatever the screen's language
  /** A run's request, its first line */
  request?: string
  /** A task done: how it ended */
  outcome?: Outcome
  /** An open task: who asked, and when it is due (the AI's words) */
  askedBy?: string
  due?: string
  area?: TaskArea
}

/** What a period has in one area, or in none (Elsewhere: no id) */
export interface RecapArea {
  id?: string
  name: string
  /** Its share of the period's work, 0 to 1 */
  share: number
  done: number
  commits: number
  /** Days with work in it: sessions, commits, tasks done */
  days: number
  /** New asks of you */
  asks: number
  runs: number
  /** What was done (tasks, then release and feature commits), newest first */
  items: RecapItem[]
  /** Commits not among the items */
  commitsMore: number
  /** The repositories its commits are in */
  repos: string[]
  /** Open tasks it ended with */
  carried: RecapItem[]
}

export interface RecapView {
  period: RecapPeriod
  key: string
  start: string
  end: string
  /** The period goes on now ("so far") */
  current: boolean
  /** The period before, and the one after (none for the current one) */
  prev: string
  next?: string
  totals: {
    done: number
    commits: number
    days: number
    asks: number
    runs: number
    carried: number
  }
  /** Most work first, Elsewhere last */
  areas: RecapArea[]
  /** A day, as a standup */
  day?: {
    /** Yesterday's done, on the morning of today */
    yesterday?: RecapItem[]
    done: RecapItem[]
    /** Today only: open tasks worked on today */
    doing: RecapItem[]
    /** Today only: open tasks, due ones first */
    next: RecapItem[]
  }
  /** A month: what changed, and who asked you most */
  month?: {
    /** Areas whose first work is in the month */
    started: string[]
    /** Areas whose last work is in the month */
    quiet: string[]
    people: string[]
  }
  /** The git emails your commits were found by */
  emails: string[]
  written?: Written
}

export interface Written {
  text: string
  at: string
  /** The CLI that wrote it: claude or codex */
  by: string
  /** The CLI chosen could not, so the other one wrote it */
  switched?: Switch
}
