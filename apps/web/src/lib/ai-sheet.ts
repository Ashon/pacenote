import { useSyncExternalStore } from 'react'
import { readStored } from './storage'

/**
 * Let your AI help: the sheet over the window that sets up the AI for
 * Pacenote's own work (components/setup/ai-sheet.tsx). Todo's start card, Find
 * tasks with AI and Recap's Set up AI open it where you are.
 */

/** Where it opens: at your AI, or at your other Mac's Todo */
export type AiSheetStart = 'ai' | 'mac'

/** What its first look added, for Todo to say once it closes */
export interface Found {
  /** The CLI that looked: "Claude Code" */
  by: string
  added: number
  maybe: number
}

interface AiSheetState {
  open?: AiSheetStart
  found?: Found
}

let state: AiSheetState = {}
const listeners = new Set<() => void>()

function set(next: AiSheetState) {
  state = next
  for (const listener of listeners) listener()
}

export const openAiSheet = (start: AiSheetStart = 'ai') =>
  set({ ...state, open: start })

/** Closed, with what its first look added when it got that far */
export const closeAiSheet = (found?: Found) =>
  set({ open: undefined, found: found ?? state.found })

/** Todo's notice of what the first look added, read */
export const clearFound = () => set({ ...state, found: undefined })

const subscribe = (listener: () => void) => {
  listeners.add(listener)
  return () => void listeners.delete(listener)
}

export function useAiSheet(): AiSheetState {
  return useSyncExternalStore(subscribe, () => state)
}

/**
 * The furthest of its steps reached, kept in this window, so it picks up where
 * it was when opened again (and the start card says Continue)
 */
export const REACHED_KEY = 'pacenote.first-run.reached'

/** Its steps: your AI, where your work is, a first look */
export const AI_STEPS = ['ai', 'sources', 'look'] as const

export function lastReached(): number {
  const reached = Number(readStored(REACHED_KEY))
  return reached > 0 && reached < AI_STEPS.length ? reached : 0
}
