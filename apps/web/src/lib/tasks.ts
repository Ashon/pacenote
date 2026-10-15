import type { TaskDecision, WorkTool } from '@src/tasks/types'
import { useQuery, useQueryClient } from '@tanstack/react-query'

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
