import { defaultVmBin } from '../../../src/sandbox/vm.js'
import { VM_IMAGE } from '../../../src/sandbox/vm-images.js'
import {
  signOut,
  VmLogin,
  type LoginPrompt,
  type LoginResult,
} from '../../../src/sandbox/vm-login.js'
import { vmRootPath } from '../../../src/settings/paths.js'

const isCli = (value: unknown): value is 'claude' | 'codex' =>
  value === 'claude' || value === 'codex'

/**
 * Settings > Sandbox "Sign in to Claude" or "Codex": the CLI's own login, run
 * in a VM by the CLI itself (src/sandbox/vm-login.ts), one at a time. Its link
 * and code go to the screen; what the CLI keeps stays in its login folder and
 * never comes here.
 */
export class SandboxSignIn {
  private current?: VmLogin

  constructor(
    private readonly options: {
      env: NodeJS.ProcessEnv
      onPrompt: (prompt: LoginPrompt) => void
    }
  ) {}

  async run(cli: unknown): Promise<LoginResult> {
    if (!isCli(cli)) return { ok: false, error: 'Unknown CLI.' }
    if (this.current)
      return { ok: false, error: 'A sign-in is already under way.' }
    const { env } = this.options
    const login = new VmLogin({
      cli,
      bin: defaultVmBin(env),
      root: vmRootPath(env),
      image: VM_IMAGE,
    })
    this.current = login
    try {
      return await login.start(this.options.onPrompt)
    } catch (err) {
      return { ok: false, error: (err as Error).message }
    } finally {
      this.current = undefined
    }
  }

  /** Claude: the code its page showed */
  submit(code: unknown): void {
    if (typeof code === 'string' && code.trim()) this.current?.submit(code)
  }

  cancel(): void {
    this.current?.cancel()
  }

  signOut(cli: unknown): void {
    if (isCli(cli)) signOut(vmRootPath(this.options.env), cli)
  }
}
