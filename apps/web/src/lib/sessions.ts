import type {
  CodexMode,
  MacSessions,
  NewSessionDraft,
  NewSessionStart,
  SessionMode,
  SessionsView,
  SessionTalk,
  SessionTools,
  SessionWrapDraft,
  SessionWrapUp,
} from '@src/sessions/types'
import type { SessionImage } from '@src/sessions/images'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { useEffect } from 'react'
import { remoteMac } from './desktop'
import { parseOtherId } from './session-rows'

/**
 * The sessions on this Mac (src/sessions), from the desktop app. The screen
 * asks every few seconds, so a session that starts working or stops shows
 * soon; Todo, every ten; the sidebar's count, every half minute. Only the
 * screen asks while it is off, for its card.
 */
const EVERY = { screen: 5_000, todo: 10_000, sidebar: 30_000 } as const
/** How long after a session Pacenote runs changes the list reads again */
const CHANGED_MS = 1_500
/** A session's page: while it works or is open elsewhere, and otherwise */
const TALK_BUSY_MS = 2_000
const TALK_MS = 5_000
/**
 * On a device of yours, while it works: the Mac tells a device nothing as it
 * writes (onLive), so the page asks again sooner for the answer as it comes
 */
const TALK_REMOTE_BUSY_MS = 1_000

export function useSessions(asker: keyof typeof EVERY = 'screen') {
  const bridge = window.pacenoteDesktop?.sessions
  const client = useQueryClient()
  // A session Pacenote runs works, stops or asks: the list soon after
  useEffect(() => {
    let timer: ReturnType<typeof setTimeout> | undefined
    const stop = bridge?.onChanged(() => {
      clearTimeout(timer)
      timer = setTimeout(
        () => void client.invalidateQueries({ queryKey: ['sessions'] }),
        CHANGED_MS
      )
    })
    return () => {
      clearTimeout(timer)
      stop?.()
    }
  }, [bridge, client])
  return useQuery({
    queryKey: ['sessions'],
    queryFn: async (): Promise<SessionsView | null> =>
      (await bridge?.view()) ?? null,
    enabled: Boolean(bridge),
    refetchInterval: (query) =>
      asker === 'screen' || query.state.data?.on ? EVERY[asker] : false,
  })
}

/**
 * The sessions on your other Macs linked to this one, each read there as you
 * look: on Sessions every few seconds, and beside a session's page less often.
 * None from a device of yours, which shows the Mac it is on.
 */
const OTHERS_EVERY = { screen: 5_000, nav: 10_000 } as const

export function useOtherSessions(asker: keyof typeof OTHERS_EVERY = 'screen') {
  const bridge = window.pacenoteDesktop?.sessions
  return useQuery({
    queryKey: ['sessions-others'],
    queryFn: async (): Promise<MacSessions[]> =>
      (await bridge?.others?.()) ?? [],
    enabled: Boolean(bridge?.others),
    refetchInterval: OTHERS_EVERY[asker],
  })
}

/** Turns Sessions on (Settings > Todo > Sessions on this Mac) */
export function useShowSessions() {
  const client = useQueryClient()
  return async () => {
    await window.pacenoteDesktop?.settings.save({ TASKS_LINK_SESSIONS: 'on' })
    await client.invalidateQueries({ queryKey: ['sessions'] })
  }
}

/** Your turn, beside Sessions in the sidebar: none while it is off */
export function useSessionsTurn(): number {
  const view = useSessions('sidebar').data
  return view?.on ? view.counts.turn : 0
}

/**
 * What a session's row does with tasks: link it to one, take it off, make
 * a task of it, or answer the task it looks like. Each says what went wrong,
 * or nothing, and refreshes the sessions and the tasks after.
 */
export function useSessionTasks() {
  const client = useQueryClient()
  const bridge = window.pacenoteDesktop
  const after = async <T extends { error?: string }>(
    done: Promise<T | undefined> | undefined
  ): Promise<T | Record<string, never>> => {
    const result = (await done) ?? {}
    await Promise.all(
      ['sessions', 'tasks', 'task'].map((key) =>
        client.invalidateQueries({ queryKey: [key] })
      )
    )
    return result
  }
  return {
    link: async (id: string, task: string) =>
      (await after(bridge?.sessions.link(id, task))).error,
    unlink: async (id: string) =>
      (await after(bridge?.sessions.unlink(id))).error,
    makeTask: (id: string) => after(bridge?.sessions.makeTask(id)),
    /** The task it looks like: it is that task's work, or it is not */
    answer: async (suggestion: string, yes: boolean) =>
      void (await after(
        bridge?.tasks.answerSuggestion(suggestion, yes).then(() => ({}))
      )),
  }
}

/**
 * A session's page (#/sessions/<id>): its conversation and how Pacenote runs
 * it, read again at once when Pacenote's run of it changes, and every few
 * seconds besides, sooner while it works; the answer it writes as it comes
 */
export function useSessionTalk(id: string) {
  const bridge = window.pacenoteDesktop?.sessions
  const client = useQueryClient()
  // On another of your Macs: read from there, which tells this one nothing
  // as it changes, so it is asked again as a device asks
  const other = parseOtherId(id)
  useEffect(() => {
    if (parseOtherId(id)) return
    const stopChanged = bridge?.onChanged((changed) => {
      if (changed === id)
        void client.invalidateQueries({ queryKey: ['session', id] })
    })
    // The answer it writes, as it comes: shown as it is, not read again
    const stopLive = bridge?.onLive((change) => {
      if (change.id !== id) return
      client.setQueryData<SessionTalk | null>(['session', id], (talk) =>
        talk ? { ...talk, live: change.live } : talk
      )
    })
    return () => {
      stopChanged?.()
      stopLive?.()
    }
  }, [bridge, client, id])
  return useQuery({
    queryKey: ['session', id],
    queryFn: async (): Promise<SessionTalk | null> =>
      (other
        ? await bridge?.otherTalk?.(other.mac, other.id)
        : await bridge?.talk(id)) ?? null,
    enabled: Boolean(other ? bridge?.otherTalk : bridge),
    refetchInterval: (query) => {
      const talk = query.state.data
      return talk?.live?.busy ||
        talk?.row.state === 'working' ||
        talk?.typeIn === 'elsewhere' ||
        talk?.typeIn === 'move'
        ? remoteMac() || other
          ? TALK_REMOTE_BUSY_MS
          : TALK_BUSY_MS
        : TALK_MS
    },
  })
}

/**
 * What its page does with a session: send it what you typed, continue it in a
 * copy, answer what it asks, stop its turn, end its run here, change how it
 * asks. Each says what went wrong, or nothing, and reads it again after.
 */
export function useSessionActions(id: string) {
  const client = useQueryClient()
  const bridge = window.pacenoteDesktop?.sessions
  const after = async <T extends { error?: string }>(
    done: Promise<T> | undefined
  ): Promise<T | Record<string, never>> => {
    const result = (await done) ?? {}
    await client.invalidateQueries({ queryKey: ['session', id] })
    void client.invalidateQueries({ queryKey: ['sessions'] })
    return result
  }
  return {
    /** What you typed, and the images attached to it (session-images.ts) */
    send: async (message: string, images: readonly SessionImage[] = []) =>
      (
        await after(
          bridge?.send(
            id,
            images.length
              ? {
                  text: message,
                  images: images.map(({ mediaType, data }) => ({
                    mediaType,
                    data,
                  })),
                }
              : message
          )
        )
      ).error,
    copy: (message: string) => after(bridge?.copy(id, message)),
    answer: async (
      ask: string,
      answer: 'allow' | 'always' | 'deny',
      message?: string
    ) => (await after(bridge?.answer(id, ask, answer, message))).error,
    stop: async () => (await after(bridge?.stop(id))).error,
    end: async () => (await after(bridge?.end(id))).error,
    /** Closed here: ended until it writes again; none on a device */
    close: bridge?.close
      ? async () => (await after(bridge.close!(id))).error
      : undefined,
    /** How its task's work ended, as your AI drafts it */
    wrapDraft: bridge?.wrapDraft
      ? async (): Promise<SessionWrapDraft> => bridge.wrapDraft!(id)
      : undefined,
    /** Its task closed with what was done, the things left kept as tasks */
    wrapUp: bridge?.wrapUp
      ? async (how: SessionWrapUp) => {
          const result = await after(bridge.wrapUp!(id, how))
          void client.invalidateQueries({ queryKey: ['tasks'] })
          return result.error
        }
      : undefined,
    mode: async (mode: SessionMode | CodexMode) =>
      (await after(bridge?.mode(id, mode))).error,
  }
}

/**
 * An image sent with a turn of a session, from its log (SessionItem's ref and
 * its place in the turn): a data: URL, kept while the page is open. Null on
 * a Mac or device that does not give them: the turn says how many it had.
 */
export function useSessionImage(id: string, ref: string, index: number) {
  const bridge = window.pacenoteDesktop?.sessions
  return useQuery({
    queryKey: ['session-image', id, ref, index],
    queryFn: async () => (await bridge?.image?.(id, ref, index)) ?? null,
    enabled: Boolean(bridge?.image),
    staleTime: Infinity,
    gcTime: 10 * 60_000,
  })
}

/**
 * A new session's draft (V5): for a task, its first message and folder,
 * asked once for the page (the marker in it stays the same); for none, empty
 */
export function useNewSessionDraft(task: string | undefined, group?: string) {
  const bridge = window.pacenoteDesktop?.tasks
  return useQuery({
    queryKey: ['session-draft', task ?? '', group ?? ''],
    queryFn: async (): Promise<NewSessionDraft | null> =>
      task
        ? ((await (group
            ? bridge?.newSession(task, group)
            : bridge?.newSession(task))) ?? null)
        : { prompt: '', marker: '' },
    enabled: Boolean(bridge),
    staleTime: Infinity,
    gcTime: 0,
  })
}

/**
 * Starts a new session Pacenote runs: its page's id, or what went wrong.
 * The sessions and the task read again after.
 */
/**
 * Whether Codex can run a session here (Z1), for the new session page: read
 * as it opens, and again a while later. None where the Mac does not say
 * (a device of yours), which starts Claude Code sessions.
 */
export function useSessionTools() {
  const bridge = window.pacenoteDesktop?.sessions
  return useQuery({
    queryKey: ['session-tools'],
    queryFn: async (): Promise<SessionTools | null> =>
      (await bridge?.tools?.()) ?? null,
    enabled: Boolean(bridge?.tools),
    staleTime: 30_000,
  })
}

export function useStartSession() {
  const client = useQueryClient()
  return async (how: NewSessionStart) => {
    const result = (await window.pacenoteDesktop?.sessions.start(how)) ?? {}
    await Promise.all(
      ['sessions', 'tasks', 'task'].map((key) =>
        client.invalidateQueries({ queryKey: [key] })
      )
    )
    return result
  }
}
