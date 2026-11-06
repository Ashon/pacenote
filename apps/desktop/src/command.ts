import { execFile } from 'node:child_process'

/** How a command this Mac ran finished */
export interface CommandResult {
  code: number | null
  stdout: string
  stderr: string
  /** The command is not on the PATH */
  missing?: boolean
}

/** Runs a command; the fakes in the tests take its place */
export type RunCommand = (
  command: string,
  args: string[]
) => Promise<CommandResult>

/**
 * Runs a command to its end and says how it went; a command that fails, is
 * missing or runs past its time still resolves, with a code other than 0
 */
export function runCommand(
  command: string,
  args: string[],
  options: { env: NodeJS.ProcessEnv; timeoutMs: number; cwd?: string }
): Promise<CommandResult> {
  return new Promise((resolve) => {
    execFile(
      command,
      args,
      {
        env: options.env,
        cwd: options.cwd,
        timeout: options.timeoutMs,
        maxBuffer: 1 << 20,
      },
      (error, stdout, stderr) => {
        const code = (error as NodeJS.ErrnoException | null)?.code
        resolve({
          code: error ? (typeof code === 'number' ? code : 1) : 0,
          stdout,
          stderr,
          missing: code === 'ENOENT',
        })
      }
    )
  })
}
