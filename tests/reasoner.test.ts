import { describe, expect, it } from 'vitest'
import {
  claudeAdapter,
  claudeArgs,
  parseClaudeOutput,
} from '../src/reasoners/claude.js'
import { codexArgs, codexProfile } from '../src/reasoners/codex.js'
import { VmSandbox } from '../src/sandbox/vm.js'

describe('claudeArgs', () => {
  it('by default has no tools and does not read user settings or MCP config', () => {
    const args = claudeArgs({ system: 'sys', model: 'claude-opus-5-5' })
    expect(args).toEqual(expect.arrayContaining(['-p', '--strict-mcp-config']))
    expect(args[args.indexOf('--setting-sources') + 1]).toBe('')
    expect(args[args.indexOf('--tools') + 1]).toBe('')
    expect(args[args.indexOf('--model') + 1]).toBe('claude-opus-5-5')
    // Output is always stream-json so progress steps can be recorded.
    expect(args[args.indexOf('--output-format') + 1]).toBe('stream-json')
    expect(args).toContain('--verbose')
    expect(args).not.toContain('--input-format')
  })

  it('reads only the reference directory, never secrets in it, and denies the rest automatically', () => {
    const args = claudeArgs({
      system: 'sys',
      reads: {
        dir: '/Users/me/docs',
        denied: ['/Users/me/.pacenote', '/Users/me/.ssh'],
      },
    })
    expect(args[args.indexOf('--tools') + 1]).toBe('Read,Grep,Glob')
    // A bare Read rule would allow any path on disk.
    expect(between(args, '--allowedTools', '--disallowedTools')).toEqual([
      'Read(//Users/me/docs/**)',
    ])
    expect(between(args, '--disallowedTools', '--permission-mode')).toEqual([
      'Read(**/.env)',
      'Read(**/.env.*)',
      'Read(//Users/me/.pacenote)',
      'Read(//Users/me/.pacenote/**)',
      'Read(//Users/me/.ssh)',
      'Read(//Users/me/.ssh/**)',
    ])
    expect(args[args.indexOf('--permission-mode') + 1]).toBe('dontAsk')
    expect(args).not.toContain('--model')
  })

  it('in the sandbox reads the mounted directory, never /proc or the secrets', async () => {
    const box = new VmSandbox({
      bin: '/bin/pacenote-vm',
      root: '/vm',
      image: 'reasoner',
      memoryMiB: 2048,
      cpus: 2,
      allowlistFile: '/allowed-domains.txt',
    })
    const { args } = await claudeAdapter.invocation(
      { system: 's', prompt: 'p' },
      {
        sandbox: box,
        options: {
          backend: 'claude',
          timeoutMs: 1000,
          deniedReads: ['/Users/me/.ssh'],
        },
        readOnlyDir: '/Users/me/docs',
      }
    )
    expect(between(args, '--allowedTools', '--disallowedTools')).toEqual([
      'Read(//workspace/**)',
    ])
    expect(args).toEqual(
      expect.arrayContaining(['Read(//proc/**)', 'Read(//run/secrets/**)'])
    )
    expect(args).not.toContain('Read(//Users/me/.ssh/**)')
  })
})

/** The values after a flag, up to the next one */
function between(args: string[], from: string, to: string): string[] {
  return args.slice(args.indexOf(from) + 1, args.indexOf(to))
}

describe('MCP server connection', () => {
  const ops = [{ name: 'ops', url: 'http://ops-broker:8080/mcp' }]

  it('claude attaches servers with --mcp-config and allows only their tools', () => {
    const args = claudeArgs({ system: 's', mcpServers: ops })
    expect(args[args.indexOf('--tools') + 1]).toBe('')
    expect(args[args.indexOf('--allowedTools') + 1]).toBe('mcp__ops')
    expect(args[args.indexOf('--permission-mode') + 1]).toBe('dontAsk')
    expect(JSON.parse(args[args.indexOf('--mcp-config') + 1]!)).toEqual({
      mcpServers: { ops: { type: 'http', url: 'http://ops-broker:8080/mcp' } },
    })
  })

  it('claude can allow read-only tools and MCP tools together', () => {
    const args = claudeArgs({
      system: 's',
      reads: { dir: '/workspace', denied: [] },
      mcpServers: ops,
    })
    expect(between(args, '--allowedTools', '--disallowedTools')).toEqual([
      'Read(//workspace/**)',
      'mcp__ops',
    ])
  })

  it('codex attaches servers with -c mcp_servers.<name>.url', () => {
    const args = codexArgs({ mcpServers: ops })
    expect(args).toContain('mcp_servers.ops.url="http://ops-broker:8080/mcp"')
    expect(args).toContain(
      'mcp_servers.ops.default_tools_approval_mode="approve"'
    )
    expect(args.at(-1)).toBe('-')
  })
})

describe('codexArgs', () => {
  it('runs with the read-only sandbox, no approval requests, an ephemeral session, and the prompt on stdin', () => {
    const args = codexArgs({})
    expect(args[0]).toBe('exec')
    expect(args[args.indexOf('--sandbox') + 1]).toBe('read-only')
    expect(args).toContain('approval_policy="never"')
    expect(args).toContain('--ephemeral')
    expect(args).toContain('--json')
    expect(args[args.indexOf('--disable') + 1]).toBe('apps')
    expect(args).not.toContain('--model')
    expect(args.at(-1)).toBe('-')
  })

  it('can pass the model and reasoning effort', () => {
    const args = codexArgs({ model: 'm1', reasoningEffort: 'medium' })
    expect(args[args.indexOf('--model') + 1]).toBe('m1')
    expect(args).toContain('model_reasoning_effort="medium"')
  })

  it("on this Mac runs its shell under a profile that reads only the reference directory, without the user's config", () => {
    const args = codexArgs({
      reads: { dir: '/Users/me/docs', denied: ['/Users/me/.pacenote'] },
    })
    expect(args).not.toContain('--sandbox')
    expect(args).toEqual(
      expect.arrayContaining([
        '--ignore-user-config',
        '--ignore-rules',
        'default_permissions="pacenote"',
      ])
    )
    expect(args).toContain(
      'permissions.pacenote.filesystem={":minimal"="read","/Users/me/docs"={"."="read","**/.env"="deny","**/.env.*"="deny"},"/Users/me/.pacenote"="deny"}'
    )
    expect(args).toContain('approval_policy="never"')
    expect(args.at(-1)).toBe('-')
  })

  it('without a reference directory, its shell reads only the basics', () => {
    expect(codexProfile({ denied: [] })).toBe(
      'permissions.pacenote.filesystem={":minimal"="read"}'
    )
  })
})

describe('parseClaudeOutput', () => {
  it('returns text only for successful results', () => {
    expect(
      parseClaudeOutput(
        JSON.stringify({
          type: 'result',
          subtype: 'success',
          is_error: false,
          result: ' yes \n',
        })
      )
    ).toBe('yes')
    expect(() =>
      parseClaudeOutput(
        JSON.stringify({ subtype: 'success', is_error: true, result: 'boom' })
      )
    ).toThrow(/boom/)
    expect(() => parseClaudeOutput('not json')).toThrow(/JSON/)
  })
})
