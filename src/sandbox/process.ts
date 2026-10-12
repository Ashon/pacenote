import { spawn } from 'node:child_process'

export interface RunOptions {
  cwd: string
  input: string
  timeoutMs: number
  signal?: AbortSignal
  /**
   * Environment variables for the child process. Defaults to the current
   * process environment
   */
  env?: NodeJS.ProcessEnv
  /** Receives stdout line by line. (for JSONL event streams) */
  onStdoutLine?: (line: string) => void
}

export interface RunResult {
  stdout: string
  stderr: string
}

const MAX_OUTPUT_BYTES = 20 * 1024 * 1024
/** How long a process gets to exit on SIGTERM before SIGKILL */
const KILL_GRACE_MS = 5_000

/**
 * Non-zero exit code. Carries the output so callers can interpret the cause for
 * their output format.
 */
export class ProcessExitError extends Error {
  constructor(
    message: string,
    readonly code: number | null,
    readonly stdout: string,
    readonly stderr: string
  ) {
    super(message)
  }
}

/**
 * Runs a CLI and passes input through stdin. On timeout or abort, stops the
 * process and whatever it started (its process group), and settles once it has
 * exited.
 */
export function runProcess(
  command: string,
  args: string[],
  options: RunOptions
): Promise<RunResult> {
  return new Promise((resolve, reject) => {
    const aborted = () => new Error(`${command} run was aborted.`)
    if (options.signal?.aborted) {
      reject(aborted())
      return
    }
    // Its own process group, so stopping it also stops the tools and servers
    // it started.
    const child = spawn(command, args, {
      cwd: options.cwd,
      env: options.env ?? process.env,
      stdio: ['pipe', 'pipe', 'pipe'],
      detached: process.platform !== 'win32',
    })

    let stdout = ''
    let stderr = ''
    let pending = ''
    let settled = false
    /** Why it is being stopped, once it is */
    let stopping: Error | undefined
    const finish = (err?: Error) => {
      if (settled) return
      settled = true
      clearTimeout(timer)
      options.signal?.removeEventListener('abort', onAbort)
      if (err) reject(err)
      else resolve({ stdout, stderr })
    }
    const signal = (name: NodeJS.Signals) => {
      try {
        if (child.pid && process.platform !== 'win32')
          process.kill(-child.pid, name)
        else child.kill(name)
      } catch {
        // Already gone
      }
    }
    const kill = (reason: string) => {
      if (stopping) return
      stopping = new Error(reason)
      signal('SIGTERM')
      // Settles even if the process never exits.
      setTimeout(() => {
        signal('SIGKILL')
        setTimeout(() => finish(stopping), 1_000).unref()
      }, KILL_GRACE_MS).unref()
    }

    const timer = setTimeout(
      () =>
        kill(`${command} timed out (${Math.round(options.timeoutMs / 1000)}s)`),
      options.timeoutMs
    )
    const onAbort = () => kill(aborted().message)
    options.signal?.addEventListener('abort', onAbort, { once: true })

    child.stdout.on('data', (chunk: Buffer) => {
      stdout += chunk.toString('utf8')
      if (options.onStdoutLine) {
        pending += chunk.toString('utf8')
        const lines = pending.split('\n')
        pending = lines.pop() ?? ''
        for (const line of lines) if (line.trim()) options.onStdoutLine(line)
      }
      if (stdout.length > MAX_OUTPUT_BYTES)
        kill(`${command} output is too large.`)
    })
    child.stderr.on('data', (chunk: Buffer) => {
      stderr = (stderr + chunk.toString('utf8')).slice(-64 * 1024)
    })
    child.on('error', (err) => {
      const hint =
        (err as NodeJS.ErrnoException).code === 'ENOENT'
          ? `${command} executable not found. Check PATH or the *_BIN setting.`
          : err.message
      finish(new Error(hint))
    })
    // Something it started may still hold its output open, so a stopped process
    // settles when it exits, not when its output closes.
    child.on('exit', () => {
      if (stopping) finish(stopping)
    })
    child.on('close', (code) => {
      if (stopping) {
        finish(stopping)
        return
      }
      if (options.onStdoutLine && pending.trim()) options.onStdoutLine(pending)
      if (code === 0) {
        finish()
        return
      }
      // claude -p writes failure details to stdout (JSON), so stdout is used
      // when stderr is empty.
      const tail = (stderr.trim() || stdout.trim())
        .split('\n')
        .slice(-5)
        .join('\n')
        .slice(-500)
      finish(
        new ProcessExitError(
          `${command} exited with code ${code}${tail ? `: ${tail}` : ''}`,
          code,
          stdout,
          stderr
        )
      )
    })

    child.stdin.on('error', () => {
      // The process exited before reading all input. Handled in the close
      // event.
    })
    child.stdin.end(options.input)
  })
}
