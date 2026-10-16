import type { TaskDecision, WorkTool } from '@src/tasks/types'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { useEffect } from 'react'

/** A task with what came before it and its work log, from the desktop app */
export const taskDetailQuery = (id: string) => ({
  queryKey: ['task', id],
  queryFn: async () => (await window.pacenoteDesktop?.tasks.detail(id)) ?? null,
})

/** Your tasks, from the desktop app (none on the dev server) */
export function useTasks() {
  const bridge = window.pacenoteDesktop?.tasks
  return useQuery({
    queryKey: ['tasks'],
    queryFn: async () => (await bridge?.list()) ?? null,
    enabled: Boolean(bridge),
    refetchInterval: 3_000,
  })
}

/** Your tasks over the last 14 days, for the Overview; null with Todo off */
export function useTaskTrend() {
  const bridge = window.pacenoteDesktop?.tasks
  return useQuery({
    queryKey: ['task-trend'],
    queryFn: async () => (await bridge?.trend()) ?? null,
    enabled: Boolean(bridge),
    refetchInterval: 10_000,
  })
}

/** What AI tools do with your tasks now (activity.ts); null with Todo off */
export function useTasksLive() {
  const bridge = window.pacenoteDesktop?.tasks
  return useQuery({
    queryKey: ['tasks-live'],
    queryFn: async () => (await bridge?.live()) ?? null,
    enabled: Boolean(bridge),
    // What was live goes stale with nothing written
    refetchInterval: 15_000,
  })
}

/**
 * Refreshes whatever shows your tasks the moment a task file changes on disk,
 * so an AI tool's work over MCP shows as it happens rather than at the next
 * refresh. Mounted once, by App.
 */
export function useTasksPush() {
  const client = useQueryClient()
  useEffect(
    () =>
      window.pacenoteDesktop?.tasks.onChanged(() => {
        for (const key of [
          'tasks',
          'task',
          'task-trend',
          'tasks-live',
          'tasks-you',
          'you',
        ])
          void client.invalidateQueries({ queryKey: [key] })
      }),
    [client]
  )
}

/**
 * A task that looks done from its quiet session: close it, not yet, or keep
 * a thing left after it as a task. Each refreshes the list and the task.
 */
export function useProposal(id: string) {
  const bridge = window.pacenoteDesktop?.tasks
  const client = useQueryClient()
  const refresh = async () => {
    await client.invalidateQueries({ queryKey: ['tasks'] })
    await client.invalidateQueries({ queryKey: ['task', id] })
  }
  return {
    answer: async (answer: 'close' | 'not-yet') => {
      const result = await bridge?.answerProposal(id, answer)
      await refresh()
      return result?.error
    },
    keep: async (text: string) => {
      const result = await bridge?.keepLeft(id, text)
      await refresh()
      return result?.error
    },
  }
}

/**
 * Whether a user group a Maybe was asked of means you; returns the error to
 * show, if any. Yes changes Settings, so the settings screen reloads too.
 */
export function useGroupAnswer() {
  const client = useQueryClient()
  return async (group: string, yours: boolean) => {
    const result = await window.pacenoteDesktop?.tasks.answerGroup(group, yours)
    await client.invalidateQueries({ queryKey: ['tasks'] })
    return result?.error
  }
}

/** Who you are in Slack, as Collect now last looked you up */
export function useSlackYou() {
  const bridge = window.pacenoteDesktop?.tasks
  return useQuery({
    queryKey: ['tasks-you'],
    queryFn: async () => (await bridge?.you()) ?? null,
    enabled: Boolean(bridge),
  })
}

/** Records a decision on a task (or takes it back) and refreshes the list */
export function useDecide() {
  const client = useQueryClient()
  return async (id: string, decision: Omit<TaskDecision, 'at'> | null) => {
    await window.pacenoteDesktop?.tasks.decide(id, decision)
    await client.invalidateQueries({ queryKey: ['tasks'] })
  }
}

/**
 * Collect now: starts a collection in the desktop app and refreshes the list
 * when it starts and when it ends (the list shows its progress meanwhile)
 */
export function useCollect() {
  const client = useQueryClient()
  const refresh = () => client.invalidateQueries({ queryKey: ['tasks'] })
  return {
    collect: async () => {
      const done = window.pacenoteDesktop?.tasks.collect()
      await refresh()
      await done
      await refresh()
    },
    stop: async () => {
      await window.pacenoteDesktop?.tasks.stopCollect()
      await refresh()
    },
  }
}

/** Each repository's folder on this Mac: a task in one opens there */
export function useRepoFolders() {
  const bridge = window.pacenoteDesktop?.tasks
  return useQuery({
    queryKey: ['task-repos'],
    queryFn: async () => (await bridge?.repos()) ?? {},
    enabled: Boolean(bridge),
  })
}

/** An open task's detail, refreshed as you work; none while it is closed */
export function useTaskDetail(id: string, enabled = true) {
  return useQuery({
    ...taskDetailQuery(id),
    enabled: enabled && Boolean(window.pacenoteDesktop?.tasks),
    refetchInterval: 4_000,
  })
}

/**
 * Continuing a task: in a terminal (Claude Code or Codex), with a reply
 * drafted to send yourself, or a session opened again. Each refreshes the task
 * and the list, and returns the error to show, if any.
 */
export function useTaskWork(id: string) {
  const bridge = window.pacenoteDesktop?.tasks
  const client = useQueryClient()
  const refresh = async () => {
    await client.invalidateQueries({ queryKey: ['task', id] })
    await client.invalidateQueries({ queryKey: ['tasks'] })
    await client.invalidateQueries({ queryKey: ['task-repos'] })
  }
  const after = async <T extends { error?: string } | undefined>(
    call: Promise<T> | undefined
  ): Promise<string | undefined> => {
    const result = await call
    await refresh()
    return result?.error
  }
  return {
    continueIn: (tool: WorkTool, folder: string) =>
      after(bridge?.continueIn(id, { tool, folder })),
    resume: (entryId: string) => after(bridge?.resume(entryId)),
    draft: () => after(bridge?.draft(id)),
    copyReply: (text: string) => after(bridge?.copyReply(id, text)),
    answer: async (entryId: string, yes: boolean) => {
      await bridge?.answerSuggestion(entryId, yes)
      await refresh()
    },
  }
}
