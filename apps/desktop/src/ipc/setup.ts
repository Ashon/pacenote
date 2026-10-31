import { tmpdir } from 'node:os'
import { getLocale } from '../../../../src/i18n/locale.js'
import type { SetupFromMac } from '../../../../src/macs/setup.js'
import {
  checkCli,
  checkOpencode,
  type CliRunner,
} from '../../../../src/reasoners/host-check.js'
import { hostEnv } from '../../../../src/sandbox/host.js'
import { runProcess } from '../../../../src/sandbox/process.js'
import { vmUnsupported } from '../../../../src/sandbox/vm.js'
import { cliReadiness, type OwnAiView } from '../../../../src/tasks/own-ai.js'
import type { SetupClaim } from '../setup-claim.js'
import type { SetupStore } from '../setup.js'
import type { Desktop } from './context.js'
import type { Ipc } from './gate.js'

/**
 * The first-run wizard: where it got to, what this Mac has (the CLIs, each
 * checked as you would run it), Connect to your other Mac, and "@Pace it's
 * me" on your own Slack app (SetupClaim)
 */
export function registerSetupIpc(
  ipc: Ipc,
  desktop: Desktop,
  {
    setup,
    setupClaim,
    fromMac,
  }: {
    setup: SetupStore
    setupClaim: SetupClaim
    /** This Mac set up from another, when your Macs are on */
    fromMac: () => SetupFromMac | undefined
  }
): void {
  const { toolPath, cliBins, ownAi } = desktop
  ipc.handle('pacenote:setup:state', null, () => setup.view())
  ipc.handle('pacenote:setup:save', null, (patch) => setup.save(patch))
  /** Runs a CLI as you would: your PATH, outside any project */
  const hostRunner =
    (command: string): CliRunner =>
    (args) =>
      runProcess(command, args, {
        cwd: tmpdir(),
        input: '',
        timeoutMs: 20_000,
        env: { ...hostEnv(process.env), PATH: toolPath() },
      })
  // Each check starts the CLI a few times: asks that overlap share the one
  // under way.
  const checking = new Map<string, Promise<unknown>>()
  const shareCheck = <T>(key: string, check: () => Promise<T>): Promise<T> => {
    const running = checking.get(key) as Promise<T> | undefined
    if (running) return running
    const started = check().finally(() => {
      if (checking.get(key) === started) checking.delete(key)
    })
    checking.set(key, started)
    return started
  }
  /** Whether each CLI is on this Mac and signed in, as you would run it */
  const detectClis = async () => {
    const bins = cliBins()
    // What a check says is worded in the app's language
    const check = (cli: 'claude' | 'codex') =>
      shareCheck(`${getLocale()} ${cli} ${bins[cli]}`, () =>
        checkCli(cli, bins[cli], hostRunner(bins[cli]))
      )
    const [claude, codex] = await Promise.all([check('claude'), check('codex')])
    return { claude, codex }
  }
  /** opencode, for Pacenote's own work only */
  const detectOpencode = () => {
    const command = cliBins().opencode
    return shareCheck(`opencode ${command}`, () =>
      checkOpencode(hostRunner(command))
    )
  }
  // Connect to your other Mac: setup takes your Slack app from it
  ipc.handle('pacenote:setup:mac-state', null, () => fromMac()?.current ?? null)
  ipc.handle('pacenote:setup:mac-look', undefined, (mode) =>
    // What it takes this time: Pace's setup, Todo's first run, or Settings
    fromMac()?.look(mode === 'todo' || mode === 'join' ? mode : 'pace')
  )
  ipc.handle('pacenote:setup:mac-connect', undefined, (raw) => {
    const target = (raw ?? {}) as { instance?: unknown; address?: unknown }
    if (typeof target.instance === 'string')
      void fromMac()?.connect({ instance: target.instance })
    else if (typeof target.address === 'string')
      void fromMac()?.connect({ address: target.address })
  })
  ipc.handle('pacenote:setup:mac-cancel', undefined, () => fromMac()?.cancel())
  ipc.handle('pacenote:setup:detect', null, async () => ({
    cli: await detectClis(),
    sandbox: { unsupported: vmUnsupported() },
  }))
  // Which CLI does Pacenote's own work now, without checking them
  ipc.handle('pacenote:ai:now', null, () => ownAi.now())
  // Settings > Todo: the CLIs that do Pacenote's own work, each with whether
  // it is here and signed in, and what it last did
  ipc.handle('pacenote:ai:state', null, async (): Promise<OwnAiView> => {
    const [clis, opencode] = await Promise.all([detectClis(), detectOpencode()])
    return {
      ...ownAi.now(),
      clis: {
        claude: cliReadiness(clis.claude),
        codex: cliReadiness(clis.codex),
        opencode: cliReadiness(opencode),
      },
    }
  })
  // "@Pace it's me" on your own Slack app
  ipc.handleOrError('pacenote:setup:claim-start', () => setupClaim.start())
  ipc.handleOrError('pacenote:setup:claim-confirm', (raw) =>
    setupClaim.confirm(raw)
  )
  ipc.handle('pacenote:setup:claim-stop', undefined, () => setupClaim.leave())
}
