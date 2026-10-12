import { tmpdir } from 'node:os'
import { describe, expect, it, vi } from 'vitest'
import { isAlive } from '../src/runtime/status.js'
import { runProcess } from '../src/sandbox/process.js'

const options = { cwd: tmpdir(), input: '', timeoutMs: 60_000 }

describe('runProcess', () => {
  it('stops what the process started as well, and settles once it has exited', async () => {
    const stop = new AbortController()
    let started = 0
    const run = runProcess('sh', ['-c', 'sleep 30 & echo $!; wait'], {
      ...options,
      signal: stop.signal,
      onStdoutLine: (line) => {
        started = Number(line)
        stop.abort()
      },
    })
    await expect(run).rejects.toThrow('sh run was aborted.')
    expect(started).toBeGreaterThan(0)
    await vi.waitFor(() => expect(isAlive(started)).toBe(false))
  })

  it('does not start once aborted', async () => {
    const stop = new AbortController()
    stop.abort()
    let lines = 0
    await expect(
      runProcess('sh', ['-c', 'echo started'], {
        ...options,
        signal: stop.signal,
        onStdoutLine: () => (lines += 1),
      })
    ).rejects.toThrow('sh run was aborted.')
    expect(lines).toBe(0)
  })

  it('stops a process past its time', async () => {
    await expect(
      runProcess('sh', ['-c', 'sleep 30'], { ...options, timeoutMs: 100 })
    ).rejects.toThrow('sh timed out')
  })
})
