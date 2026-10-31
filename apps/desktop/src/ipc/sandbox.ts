import { localized } from '../../../../src/i18n/locale.js'
import { signedIn } from '../../../../src/sandbox/vm-login.js'
import { vmRootPath } from '../../../../src/settings/paths.js'
import { dropClaudeToken } from '../../../../src/settings/settings-file.js'
import type { BotSupervisor } from '../bot.js'
import { text } from '../main.text.js'
import type { SandboxSignIn } from '../sandbox-login.js'
import type { SandboxService } from '../sandbox.js'
import type { Desktop } from './context.js'
import type { Ipc } from './gate.js'

/**
 * Settings > Sandbox: the VM sandbox's status, its jobs, the domains it
 * reaches, and the CLIs signed in inside it
 */
export function registerSandboxIpc(
  ipc: Ipc,
  desktop: Desktop,
  {
    sandbox,
    sandboxSignIn,
    supervisor,
    settingsFile,
  }: {
    sandbox: SandboxService
    sandboxSignIn: SandboxSignIn
    supervisor: BotSupervisor | undefined
    settingsFile: string
  }
): void {
  const { log, window } = desktop
  ipc.handle('pacenote:sandbox:status', null, () => sandbox.status())
  ipc.handle('pacenote:sandbox:job', null, () => sandbox.job ?? null)
  // A job and a sign-in run on this Mac: the window's alone
  ipc.windowOnly(
    'pacenote:sandbox:run',
    () => ({ error: localized(text).denied }),
    (kind) => sandbox.run(kind)
  )
  ipc.handle('pacenote:sandbox:save-allowlist', [], (domains) =>
    sandbox.saveAllowlist(domains)
  )
  ipc.windowOnly(
    'pacenote:sandbox:login',
    () => ({ ok: false, error: localized(text).notAllowed }),
    async (cli) => {
      const result = await sandboxSignIn.run(cli)
      // Signed in to Claude: a claude token set by hand goes unused, so it
      // goes.
      if (result.ok && cli === 'claude')
        for (const note of dropClaudeToken(
          settingsFile,
          signedIn(vmRootPath(process.env), 'claude')
        ))
          log.info(`Settings: ${note}`)
      return result
    }
  )
  ipc.handle('pacenote:sandbox:login-code', undefined, (code) => {
    sandboxSignIn.submit(code)
  })
  ipc.handle('pacenote:sandbox:login-cancel', undefined, () => {
    sandboxSignIn.cancel()
  })
  ipc.handle('pacenote:sandbox:sign-out', undefined, (cli) => {
    sandboxSignIn.signOut(cli)
  })
  sandbox.on('job', (job) => {
    window.send('pacenote:sandbox:job-changed', job)
    // A finished job may have started or stopped the proxy or the broker; the
    // bot checks the sandbox again.
    if (job.state !== 'running') supervisor?.recheckSandbox()
  })
}
