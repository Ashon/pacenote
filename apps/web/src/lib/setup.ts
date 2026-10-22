import type { SettingsView } from '@src/settings/fields'
import {
  SETUP_STEPS,
  type CliCheck,
  type SetupStep,
  type SetupView,
} from '@src/settings/setup'
import {
  mergeProgress,
  vmSetupProgress,
  type VmSetupProgress,
} from '@src/sandbox/vm-progress'
import { useCallback, useEffect, useRef, useState } from 'react'
import { desktopValue, useDesktopValue, useSandbox } from './desktop'
import type { FromMacState } from '@src/macs/types'
import { localized } from '@src/i18n/locale'
import { text } from './setup.text'

export { SETUP_STEPS, type SetupStep }

/** What a step is called, in the list and in "Change ..." */
export const stepLabel = (step: SetupStep) => localized(text).steps[step]

/** "Next: ..." on the resume card, for the step it stopped before */
export const stepNext = (step: SetupStep) => localized(text).next[step]

export const stepIndex = (step: SetupStep) => SETUP_STEPS.indexOf(step)

/** The Slack member IDs in MENTION_ALLOWED_USERS */
export const allowedIds = (value: string | undefined) =>
  (value ?? '').split(/[\s,]+/).filter(Boolean)

/** The setup record, and saving changes to it. undefined outside the app */
export function useSetup() {
  const bridge = window.pacenoteDesktop?.setup
  const [view, setView] = useState<SetupView>()
  useEffect(() => {
    void bridge?.state().then((value) => value && setView(value))
  }, [bridge])
  const save = useCallback(
    async (patch: Parameters<NonNullable<typeof bridge>['save']>[0]) => {
      const next = await bridge?.save(patch)
      if (next) setView(next)
      return next ?? undefined
    },
    [bridge]
  )
  return { view, save }
}

export interface Detected {
  cli: Record<'claude' | 'codex', CliCheck>
  sandbox: { unsupported?: string }
}

/** What this Mac has for Pace: the CLIs, and the built-in sandbox */
export function useDetect() {
  const bridge = window.pacenoteDesktop?.setup
  const [detected, setDetected] = useState<Detected>()
  const [checking, setChecking] = useState(false)
  const check = useCallback(() => {
    if (!bridge) return
    setChecking(true)
    void bridge
      .detect()
      .then((value) => value && setDetected(value))
      .finally(() => setChecking(false))
  }, [bridge])
  useEffect(check, [check])
  return { detected, checking, check }
}

/** The settings file as the app shows it, read again after each save */
export function useSettingsView() {
  const bridge = window.pacenoteDesktop?.settings
  const [view, setView] = useState<SettingsView>()
  const refresh = useCallback(() => {
    void bridge?.get().then((value) => value && setView(value))
  }, [bridge])
  useEffect(refresh, [refresh])
  return { view, refresh }
}

/**
 * The built-in sandbox's setup job and how far it has come, kept from going
 * back as its output scrolls (mergeProgress)
 */
export function useSandboxSetup(options: { renderer: boolean }) {
  const sandbox = useSandbox()
  const job = sandbox.job?.kind === 'vm' ? sandbox.job : undefined
  const last = useRef<{ startedAt: string; progress: VmSetupProgress }>(
    undefined
  )
  let progress: VmSetupProgress | undefined
  if (job) {
    const now = vmSetupProgress(job, options)
    progress =
      last.current?.startedAt === job.startedAt
        ? mergeProgress(last.current.progress, now)
        : now
  }
  useEffect(() => {
    if (job && progress) last.current = { startedAt: job.startedAt, progress }
  })
  const vm = sandbox.status?.vm
  /** Ready to answer: the reasoner's image built from this Pacenote's recipe */
  const ready = Boolean(
    vm && !vm.unsupported && vm.kernel && vm.image && !vm.outdated?.length
  )
  return {
    ...sandbox,
    job,
    progress,
    ready,
    preparing: job?.state === 'running',
  }
}

const fromMac = desktopValue(() => {
  const bridge = window.pacenoteDesktop?.setup
  return (
    bridge && { read: () => bridge.macState(), onChange: bridge.onMacChanged }
  )
})

/**
 * Connect to your other Mac (setup's Slack step): finding it, the number to
 * compare, and what came from it, as the desktop app tells
 */
export function useFromMac() {
  const bridge = window.pacenoteDesktop?.setup
  const state: FromMacState = useDesktopValue(fromMac) ?? { step: 'idle' }
  return {
    state,
    look: () => void bridge?.macLook(),
    connect: (target: { instance: string } | { address: string }) =>
      void bridge?.macConnect(target),
    cancel: () => void bridge?.macCancel(),
  }
}
