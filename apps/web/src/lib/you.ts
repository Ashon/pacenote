import type { AreaRole, AreaView, YouView } from '@src/you/types'
import { localized } from '@src/i18n/locale'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { useEffect } from 'react'
import { text } from './you.text'

/**
 * You: where you contribute, from the desktop app (none on the dev server).
 * A new count may find new areas, so the task rows' areas follow it.
 */
export function useYou() {
  const bridge = window.pacenoteDesktop?.you
  const client = useQueryClient()
  const query = useQuery({
    queryKey: ['you'],
    queryFn: async () => (await bridge?.get()) ?? null,
    enabled: Boolean(bridge),
    refetchInterval: 30_000,
  })
  const at = query.data?.at
  useEffect(() => {
    if (at) void client.invalidateQueries({ queryKey: ['tasks'] })
  }, [at, client])
  return query
}

/**
 * Your fixes to your areas. Each shows you counted again with it, and the
 * task rows' areas follow.
 */
export function useFixYou() {
  const bridge = window.pacenoteDesktop?.you
  const client = useQueryClient()
  const after = async (call: Promise<YouView | null> | undefined) => {
    const view = await call
    if (view) client.setQueryData(['you'], view)
    await client.invalidateQueries({ queryKey: ['tasks'] })
  }
  return {
    confirm: () => after(bridge?.confirm()),
    rename: (id: string, name: string) => after(bridge?.rename(id, name)),
    takeOut: (id: string, part: string) => after(bridge?.takeOut(id, part)),
    merge: (id: string, into: string) => after(bridge?.merge(id, into)),
    leave: (id: string, left: boolean) => after(bridge?.leave(id, left)),
  }
}

/** A role as its chip says it: Builds */
export function roleLabel(role: AreaRole): string {
  return localized(text).roles[role]
}

/** How you contribute to an area, in a sentence: "You build and review" */
export function roleSentence(area: Pick<AreaView, 'roles'>): string {
  return localized(text).roleSentence(area.roles.map((role) => role.role))
}

/** Who Pacenote found you as: "ashon in Slack and Ashon on GitHub" */
export function accountsSentence(
  accounts: YouView['accounts']
): string | undefined {
  if (!accounts.slack && !accounts.github && !accounts.git) return undefined
  return localized(text).accounts({
    slack: accounts.slack?.name,
    github: accounts.github,
    git: accounts.git,
  })
}

/** An area's key on its row, as the You screen links to it */
export const areaHash = (id: string) => `#/you/${encodeURIComponent(id)}`

/** A part's key, as you.json keeps the parts taken out */
export const partKey = (part: { kind: string; id: string }) =>
  `${part.kind}:${part.id.toLowerCase()}`
