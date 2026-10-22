import { tmpdir } from 'node:os'
import { PassThrough } from 'node:stream'
import { describe, expect, it, vi } from 'vitest'
import { isAlive } from '../src/runtime/status.js'
import { forwardLines, runProcess } from '../src/sandbox/process.js'

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

  it('keeps a character cut across two reads whole', async () => {
    // 가 (EA B0 80), its bytes written apart
    const script =
      'process.stdout.write(Buffer.from([0xea, 0xb0]));' +
      'setTimeout(() => process.stdout.write(Buffer.from([0x80, 0x0a])), 200)'
    const lines: string[] = []
    const result = await runProcess(process.execPath, ['-e', script], {
      ...options,
      onStdoutLine: (line) => lines.push(line),
    })
    expect(result.stdout).toBe('가\n')
    expect(lines).toEqual(['가'])
  })

  it('stops a process past its time', async () => {
    await expect(
      runProcess('sh', ['-c', 'sleep 30'], { ...options, timeoutMs: 100 })
    ).rejects.toThrow('sh timed out')
  })
})

describe('forwardLines', () => {
  it('passes lines on whole across reads, skips blank ones and ends with the rest', async () => {
    const stream = new PassThrough()
    const lines: string[] = []
    forwardLines(stream, (line) => lines.push(line))
    const ended = new Promise((resolve) => stream.on('end', resolve))
    stream.write('{"tool":"ssh_')
    stream.write(Buffer.from('exec"}\n\n  \n\xea\xb0', 'latin1'))
    stream.write(Buffer.from([0x80, 0x0a]))
    stream.end('last')
    await ended
    expect(lines).toEqual(['{"tool":"ssh_exec"}', '가', 'last'])
  })
})
