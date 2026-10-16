import type { WorkTool } from '../tasks/types.js'

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

/** The area a task is in, for its row */
export interface TaskArea {
  id: string
  name: string
}
