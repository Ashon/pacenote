import type { SupervisorState } from '@runtime/types'
import type { K8sConnected, K8sContextCheck } from '@src/sandbox/k8s-account'
import { DEFAULT_K8S_ACCOUNT } from '@src/sandbox/k8s-account'
import type { FoundOnMac } from '@src/settings/found'
import {
  cleanup,
  fireEvent,
  screen,
  waitFor,
  within,
} from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import type { useSandbox } from '@/lib/desktop'
import { renderScreen, stubDesktop, unstubDesktop } from '@/testing'
import { K8sSteps } from './k8s-steps'

afterEach(() => {
  cleanup()
  unstubDesktop()
})

const checks: K8sContextCheck[] = [
  { context: 'prod', state: 'ready' },
  { context: 'dev', state: 'missing', canCreate: true, user: 'alice' },
  { context: 'shared', state: 'forbidden', canCreate: false, user: 'alice' },
]

/**
 * The steps for these contexts, with this Mac's kubectl answering as given;
 * Pace running unless said
 */
function steps({
  contexts = ['prod', 'dev', 'shared'],
  pending = false,
  connected = { contexts: [] } as K8sConnected,
  found = { names: {}, gaps: [] } as FoundOnMac,
  pace = 'running' as SupervisorState['phase'],
} = {}) {
  const k8s = {
    check: vi.fn(async () => checks),
    create: vi.fn(async (context: string): Promise<K8sContextCheck> => ({
      context,
      state: 'ready',
    })),
    connected: vi.fn(async () => connected),
  }
  const restart = vi.fn(async () => undefined)
  stubDesktop({
    settings: { found: async () => found, k8s },
    bot: {
      state: async () => ({ phase: pace }) as SupervisorState,
      restart,
    },
  })
  const run = vi.fn()
  renderScreen(
    <K8sSteps
      contexts={contexts}
      account={DEFAULT_K8S_ACCOUNT}
      pending={pending}
      ready
      workFolder=""
      sandbox={
        { available: true, run } as unknown as ReturnType<typeof useSandbox>
      }
    />
  )
  return { k8s, restart, run }
}

const line = async (context: string) =>
  within(
    (
      await screen.findByText(context, {
        selector: '[data-k8s-account] span',
      })
    ).closest<HTMLElement>('[data-k8s-account]')!
  )

describe("Kubernetes' steps", () => {
  it("says of each cluster whether Pace's account is there", async () => {
    const { k8s } = steps()
    expect(await (await line('prod')).findByText('Account ready')).toBeTruthy()
    const dev = await line('dev')
    expect(dev.getByText('No account yet')).toBeTruthy()
    expect(dev.getByRole('button', { name: 'Make it here' })).toBeTruthy()
    const shared = await line('shared')
    expect(shared.getByText("You can't see the account here")).toBeTruthy()
    expect(shared.queryByRole('button', { name: 'Make it here' })).toBeNull()
    expect(
      shared.getByText(
        "You can't make one here, so the cluster's admin makes it."
      )
    ).toBeTruthy()
    expect(k8s.check).toHaveBeenCalledWith(
      ['prod', 'dev', 'shared'],
      DEFAULT_K8S_ACCOUNT
    )
  })

  it('makes an account only once you say so, then shows it ready', async () => {
    const { k8s } = steps()
    const dev = await line('dev')
    fireEvent.click(await dev.findByRole('button', { name: 'Make it here' }))
    expect(
      dev.getByText(/^Make pacenote\/pacenote-ro in dev, with your kubeconfig/)
    ).toBeTruthy()
    expect(k8s.create).not.toHaveBeenCalled()
    fireEvent.click(dev.getByRole('button', { name: 'Make' }))
    await waitFor(() => expect(dev.getByText('Account ready')).toBeTruthy())
    expect(k8s.create).toHaveBeenCalledWith('dev', DEFAULT_K8S_ACCOUNT)
  })

  it("copies the account for the cluster's admin, letting you read its token", async () => {
    steps()
    const shared = await line('shared')
    fireEvent.click(
      await shared.findByRole('button', { name: 'For your admin' })
    )
    expect(
      shared.getByText(/It also lets alice read the account's token/)
    ).toBeTruthy()
    const yaml = shared.getByText(/kind: RoleBinding/)
    expect(yaml.textContent).toContain('name: "alice"')
  })

  it('asks for kubectl when this Mac has none', async () => {
    steps({ found: { names: {}, gaps: ['noKubectl'] } })
    expect(await screen.findByText('brew install kubectl')).toBeTruthy()
    // No cluster to ask about without it
    await waitFor(() =>
      expect(document.querySelector('[data-k8s-account]')).toBeNull()
    )
  })

  it('says saving connects Pace, while the settings are not saved', async () => {
    const { k8s } = steps({ pending: true })
    expect(
      await screen.findByText(
        'Save, and Pace starts again with these accounts.'
      )
    ).toBeTruthy()
    expect(k8s.connected).not.toHaveBeenCalled()
  })

  it('shows that Pace reads each cluster, with no secrets and no changes', async () => {
    const { restart } = steps({
      contexts: ['prod', 'dev'],
      connected: {
        build: {
          contexts: ['prod', 'dev'],
          serviceAccount: 'pacenote-ro',
          namespace: 'pacenote',
          built: ['prod'],
          failed: [{ context: 'dev', state: 'missing' }],
          at: '2026-11-11T00:00:00Z',
        },
        contexts: [
          { context: 'prod', reads: true, secrets: false, changes: false },
        ],
      },
    })
    const prod = within(
      (
        await screen.findByText('prod', {
          selector: '[data-k8s-connected] span',
        })
      ).closest<HTMLElement>('[data-k8s-connected]')!
    )
    expect(prod.getByText('Reads')).toBeTruthy()
    expect(prod.getByText('No secrets')).toBeTruthy()
    expect(prod.getByText('No changes')).toBeTruthy()
    // dev was left out with no account; made now, it joins on Connect again
    expect(screen.getByText('Left out · No account yet')).toBeTruthy()
    const dev = await line('dev')
    fireEvent.click(await dev.findByRole('button', { name: 'Make it here' }))
    fireEvent.click(dev.getByRole('button', { name: 'Make' }))
    const again = await screen.findByRole('button', { name: 'Connect again' })
    fireEvent.click(again)
    await waitFor(() => expect(restart).toHaveBeenCalled())
  })

  it('warns when an account can do more than read', async () => {
    steps({
      contexts: ['prod'],
      connected: {
        build: {
          contexts: ['prod'],
          serviceAccount: 'pacenote-ro',
          namespace: 'pacenote',
          built: ['prod'],
          failed: [],
          at: '2026-11-11T00:00:00Z',
        },
        contexts: [
          { context: 'prod', reads: true, secrets: true, changes: true },
        ],
      },
    })
    expect(await screen.findByText('Reads secrets')).toBeTruthy()
    expect(screen.getByText('Can change things')).toBeTruthy()
    expect(screen.getByText(/^This account can do more than read/)).toBeTruthy()
  })
})
