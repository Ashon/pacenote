import { describe, expect, it } from 'vitest'
import { runCommand } from '../apps/desktop/src/command.js'

const node = (script: string, timeoutMs = 10_000) =>
  runCommand(process.execPath, ['-e', script], { env: process.env, timeoutMs })

describe('running a command on this Mac', () => {
  it('gives what it printed, with code 0', async () => {
    expect(await node('process.stdout.write("hi")')).toMatchObject({
      code: 0,
      stdout: 'hi',
      missing: false,
    })
  })

  it('resolves with the exit code when it fails', async () => {
    const result = await node('console.error("no"); process.exit(3)')
    expect(result.code).toBe(3)
    expect(result.stderr).toContain('no')
  })

  it('says when the command is not on the PATH', async () => {
    const result = await runCommand('pacenote-no-such-command', [], {
      env: process.env,
      timeoutMs: 5_000,
    })
    expect(result).toMatchObject({ code: 1, missing: true })
  })

  it('stops one that runs past its time', async () => {
    const result = await node('setTimeout(() => {}, 10_000)', 200)
    expect(result.code).not.toBe(0)
  })

  it('runs in the folder it is given', async () => {
    const result = await runCommand(
      process.execPath,
      ['-e', 'process.stdout.write(process.cwd())'],
      { env: process.env, timeoutMs: 10_000, cwd: '/' }
    )
    expect(result.stdout).toBe('/')
  })
})
