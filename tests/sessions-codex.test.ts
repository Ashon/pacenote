import { mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { afterAll, describe, expect, it } from 'vitest'
import {
  readSessionImage,
  readSessionTalk,
} from '../apps/desktop/src/handoff.js'
import {
  codexAnswer,
  codexAskOf,
  codexContext,
  codexInput,
  codexLogSteps,
  codexPolicy,
  codexSaid,
  codexSpend,
  codexStep,
  execSteps,
  patchFiles,
  shellCommand,
} from '../src/sessions/codex.js'

const dir = mkdtempSync(path.join(tmpdir(), 'pacenote-codex-'))
afterAll(() => rmSync(dir, { recursive: true, force: true }))

describe('what Pacenote says to codex app-server', () => {
  it('runs each mode as Codex has it, at a thread start and for a turn after', () => {
    expect(codexPolicy('read-only')).toMatchObject({
      approvalPolicy: 'on-request',
      sandbox: 'read-only',
      sandboxPolicy: { type: 'readOnly' },
    })
    expect(codexPolicy('workspace')).toMatchObject({
      approvalPolicy: 'on-request',
      sandbox: 'workspace-write',
      sandboxPolicy: { type: 'workspaceWrite', networkAccess: false },
    })
    expect(codexPolicy('full-access')).toEqual({
      approvalPolicy: 'never',
      sandbox: 'danger-full-access',
      sandboxPolicy: { type: 'dangerFullAccess' },
    })
  })

  it('sends the images first, then what you typed, and reads it back', () => {
    const input = codexInput('Why is this red?', [
      { mediaType: 'image/png', data: 'iVBORw0KGgo=' },
    ])
    expect(input).toEqual([
      { type: 'image', url: 'data:image/png;base64,iVBORw0KGgo=' },
      { type: 'text', text: 'Why is this red?', text_elements: [] },
    ])
    expect(codexSaid(input)).toBe('Why is this red?')
    expect(codexInput('', [])).toEqual([])
    expect(codexSaid('nope')).toBe('')
  })

  it('answers an ask: go ahead, for the session, or no', () => {
    const command = 'item/commandExecution/requestApproval'
    expect(codexAnswer(command, {}, 'allow')).toEqual({ decision: 'accept' })
    expect(codexAnswer(command, {}, 'always')).toEqual({
      decision: 'acceptForSession',
    })
    expect(codexAnswer(command, {}, 'deny')).toEqual({ decision: 'decline' })
    const permissions = 'item/permissions/requestApproval'
    const asked = { permissions: { network: { enabled: true } } }
    expect(codexAnswer(permissions, asked, 'allow')).toEqual({
      permissions: { network: { enabled: true } },
      scope: 'turn',
    })
    expect(codexAnswer(permissions, asked, 'always')).toMatchObject({
      scope: 'session',
    })
    expect(codexAnswer(permissions, asked, 'deny')).toEqual({
      permissions: {},
      scope: 'turn',
    })
  })
})

describe('what Codex says back', () => {
  it('reads a command as you would type it, out of the shell Codex runs it in', () => {
    expect(shellCommand("/bin/zsh -lc 'pnpm test'")).toBe('pnpm test')
    expect(shellCommand(`bash -lc "git log -3"`)).toBe('git log -3')
    expect(shellCommand("/bin/zsh -lc 'echo '\\''hi'\\'''")).toBe("echo 'hi'")
    expect(shellCommand(['/bin/zsh', '-lc', 'cat note.txt'])).toBe(
      'cat note.txt'
    )
    expect(shellCommand(['ls', '-la'])).toBe('ls -la')
    expect(shellCommand(undefined)).toBe('')
  })

  it('names the files a patch changes', () => {
    expect(
      patchFiles(
        [
          '*** Begin Patch',
          '*** Update File: src/retry.ts',
          '@@',
          '-a',
          '+b',
          '*** Add File: tests/retry.test.ts',
          '*** Update File: src/old.ts',
          '*** Move to: src/new.ts',
          '*** Update File: src/retry.ts',
          '*** End Patch',
        ].join('\n')
      )
    ).toEqual([
      'src/retry.ts',
      'tests/retry.test.ts',
      'src/old.ts',
      'src/new.ts',
    ])
  })

  it('shows its items as steps: Shell, Edit, an MCP tool, a web search', () => {
    expect(
      codexStep({ type: 'commandExecution', command: "zsh -lc 'pnpm lint'" })
    ).toEqual({ name: 'Shell', text: 'pnpm lint' })
    expect(
      codexStep(
        {
          type: 'fileChange',
          changes: [
            { path: '/work/payments/src/a.ts' },
            { path: '/work/payments/src/b.ts' },
            { path: '/work/payments/src/c.ts' },
            { path: '/elsewhere/d.ts' },
          ],
        },
        '/work/payments'
      )
    ).toEqual({ name: 'Edit', text: 'src/a.ts, src/b.ts, src/c.ts +1' })
    expect(
      codexStep({ type: 'mcpToolCall', server: 'linear', tool: 'get_issue' })
    ).toEqual({ name: 'mcp__linear__get_issue', text: '' })
    expect(
      codexStep({ type: 'webSearch', query: 'vitest fake timers' })
    ).toEqual({ name: 'WebSearch', text: 'vitest fake timers' })
    expect(codexStep({ type: 'reasoning' })).toBeUndefined()
  })

  it('asks as the session page shows it, with why, secrets kept out', () => {
    const at = '2026-11-24T01:00:00.000Z'
    expect(
      codexAskOf(
        '3',
        'item/commandExecution/requestApproval',
        {
          command: `/bin/zsh -lc 'curl -H "Authorization: Bearer sk-ant-api03-${'x'.repeat(40)}" https://api.example.com/v1/really/long/path/that/goes/on'`,
          reason: 'It needs the network.',
        },
        at
      )
    ).toMatchObject({
      id: '3',
      kind: 'command',
      tool: 'Shell',
      what: expect.not.stringContaining('sk-ant-api03'),
      rule: expect.stringMatching(/^curl .{50,}…$/),
      why: 'It needs the network.',
      at,
    })
    expect(
      codexAskOf(
        '4',
        'item/fileChange/requestApproval',
        { grantRoot: '/work/other' },
        at
      )
    ).toMatchObject({ kind: 'edit', what: '/work/other', always: true })
    expect(
      codexAskOf(
        '5',
        'item/permissions/requestApproval',
        { permissions: { network: { enabled: true } } },
        at
      )
    ).toMatchObject({ kind: 'web', what: 'network', always: true })
    expect(
      codexAskOf(
        '6',
        'item/permissions/requestApproval',
        { permissions: { fileSystem: { write: ['/work/shared'] } } },
        at
      )
    ).toMatchObject({ kind: 'edit', what: 'write: /work/shared' })
    expect(
      codexAskOf('7', 'mcpServer/elicitation/request', {}, at)
    ).toBeUndefined()
  })

  it('counts the context of its last request, and what each spent', () => {
    expect(
      codexContext({
        last: { totalTokens: 40_000 },
        modelContextWindow: 200_000,
      })
    ).toEqual({ used: 40_000, window: 200_000 })
    expect(codexContext({ last: { totalTokens: 5 } })).toBeUndefined()
    expect(
      codexSpend({
        inputTokens: 10_000,
        cachedInputTokens: 9_000,
        outputTokens: 300,
      })
    ).toEqual({ input: 1_000, cacheRead: 9_000, cacheWrite: 0, output: 300 })
    expect(codexSpend(undefined)).toEqual({
      input: 0,
      cacheRead: 0,
      cacheWrite: 0,
      output: 0,
    })
  })
})

describe("a Codex session's own log", () => {
  it('reads the commands and patches of a code-mode exec as Shell and Edit steps', () => {
    expect(
      execSteps(
        [
          'const a = await tools.exec_command({cmd: "pnpm vitest run", yield_time_ms: 1000})',
          "await tools.exec_command({ workdir: '/w', cmd: 'git status --short' })",
          'await tools.apply_patch(`*** Begin Patch',
          '*** Update File: /work/payments/src/retry.ts',
          '*** End Patch`)',
          'await tools.view_image({path: "a.png"})',
        ].join('\n'),
        '/work/payments'
      )
    ).toEqual([
      { name: 'Shell', text: 'pnpm vitest run' },
      { name: 'Shell', text: 'git status --short' },
      { name: 'Edit', text: 'src/retry.ts' },
      { name: 'view_image', text: '' },
    ])
    expect(
      codexLogSteps({
        type: 'custom_tool_call',
        name: 'exec',
        input: 'console.log(1)\nmore',
      })
    ).toEqual([{ name: 'exec', text: 'console.log(1)' }])
    expect(
      codexLogSteps({
        type: 'function_call',
        name: 'exec_command',
        arguments: JSON.stringify({ cmd: 'ls' }),
      })
    ).toEqual([{ name: 'Shell', text: 'ls' }])
    expect(
      codexLogSteps({
        type: 'local_shell_call',
        action: { command: ['bash', '-lc', 'pwd'] },
      })
    ).toEqual([{ name: 'Shell', text: 'pwd' }])
    expect(
      codexLogSteps({
        type: 'custom_tool_call',
        name: 'apply_patch',
        input: '*** Begin Patch\n*** Add File: notes.md\n*** End Patch',
      })
    ).toEqual([{ name: 'Edit', text: 'notes.md' }])
    expect(codexLogSteps({ type: 'reasoning' })).toBeUndefined()
  })

  it('reads its turns with the images you sent, and gives each image back', () => {
    const png =
      'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR4nGNgYGD4DwABBAEAwS2OUAAAAABJRU5ErkJggg=='
    const file = path.join(dir, 'rollout.jsonl')
    writeFileSync(
      file,
      [
        {
          timestamp: '2026-11-24T01:00:00.000Z',
          type: 'session_meta',
          payload: { id: 't1', cwd: '/work/payments', originator: 'pacenote' },
        },
        {
          timestamp: '2026-11-24T01:00:01.000Z',
          ordinal: 3,
          type: 'response_item',
          payload: {
            type: 'message',
            role: 'user',
            content: [
              {
                type: 'input_image',
                image_url: `data:image/png;base64,${png}`,
              },
              { type: 'input_text', text: 'Why is this red?' },
            ],
          },
        },
        {
          timestamp: '2026-11-24T01:00:02.000Z',
          type: 'response_item',
          payload: {
            type: 'custom_tool_call',
            name: 'exec',
            input: 'await tools.exec_command({cmd: "pnpm test"})',
          },
        },
        {
          timestamp: '2026-11-24T01:00:03.000Z',
          type: 'response_item',
          payload: {
            type: 'message',
            role: 'assistant',
            content: [{ type: 'output_text', text: 'A failing test.' }],
          },
        },
      ]
        .map((line) => JSON.stringify(line))
        .join('\n')
    )
    const talk = readSessionTalk(file, 'codex')
    expect(talk.items).toMatchObject([
      { role: 'user', text: 'Why is this red?', images: 1, ref: '3' },
      { role: 'tool', name: 'Shell', text: 'pnpm test' },
      { role: 'assistant', text: 'A failing test.' },
    ])
    expect(readSessionImage(file, '3', 0, 'codex')).toBe(
      `data:image/png;base64,${png}`
    )
    expect(readSessionImage(file, '3', 1, 'codex')).toBeUndefined()
    expect(readSessionImage(file, '4', 0, 'codex')).toBeUndefined()
  })
})
