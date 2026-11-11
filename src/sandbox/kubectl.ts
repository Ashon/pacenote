import type { KubectlResult } from './k8s-account.js'
import { ProcessExitError, runProcess } from './process.js'

/** Runs kubectl to its end; the fakes in the tests take its place */
export type Kubectl = (
  args: string[],
  options?: { input?: string; timeoutMs?: number }
) => Promise<KubectlResult>

/**
 * kubectl on this Mac, with env (a PATH that finds it, and the HOME of your
 * kubeconfig). A command that fails, is missing or runs past its time still
 * resolves, with a code other than 0.
 */
export function kubectlRunner(
  env: NodeJS.ProcessEnv,
  timeoutMs = 20_000
): Kubectl {
  return async (args, options = {}) => {
    try {
      const { stdout, stderr } = await runProcess('kubectl', args, {
        env,
        input: options.input,
        timeoutMs: options.timeoutMs ?? timeoutMs,
      })
      return { code: 0, stdout, stderr }
    } catch (err) {
      if (err instanceof ProcessExitError)
        return { code: err.code, stdout: err.stdout, stderr: err.stderr }
      if ((err as NodeJS.ErrnoException).code === 'ENOENT')
        return { code: null, stdout: '', stderr: '', missing: true }
      return { code: null, stdout: '', stderr: (err as Error).message }
    }
  }
}
