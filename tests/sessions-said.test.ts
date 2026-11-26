import { describe, expect, it } from 'vitest'
import { saidParts, stepTarget, toolLabel } from '../src/sessions/said.js'

describe('saidParts: a turn of yours, as its page shows it', () => {
  it('keeps what you typed as it is', () => {
    expect(saidParts('  Make it 5\nand add a test  ')).toEqual([
      { kind: 'text', text: 'Make it 5\nand add a test' },
    ])
  })

  it('leaves out its reminders to the model', () => {
    expect(
      saidParts(
        'Fix the retry\n<system-reminder>\nThe date is 2026-11-17.\n</system-reminder>'
      )
    ).toEqual([{ kind: 'text', text: 'Fix the retry' }])
    // Cut short: what is left of it is still not shown
    expect(saidParts('<system-reminder>Tools changed')).toEqual([])
  })

  it('shows a slash command with what you typed after it, and what it printed', () => {
    expect(
      saidParts(
        '<command-name>/review</command-name>\n<command-message>review</command-message>\n<command-args>418</command-args>'
      )
    ).toEqual([{ kind: 'command', name: '/review', args: '418' }])
    expect(
      saidParts(
        '<local-command-stdout>\u001b[2mTotal cost: $0.12\u001b[22m</local-command-stdout>'
      )
    ).toEqual([{ kind: 'output', text: 'Total cost: $0.12' }])
    // Nothing printed: nothing to show
    expect(saidParts('<local-command-stdout></local-command-stdout>')).toEqual(
      []
    )
  })

  it('shows a shell command and its output, an error as one', () => {
    expect(
      saidParts(
        '<bash-input>git status</bash-input><bash-stdout>On branch main</bash-stdout><bash-stderr>warning: x</bash-stderr>'
      )
    ).toEqual([
      { kind: 'shell', command: 'git status' },
      { kind: 'output', text: 'On branch main' },
      { kind: 'output', text: 'warning: x', error: true },
    ])
  })

  it('says a turn was stopped, alone or after what you typed', () => {
    expect(saidParts('[Request interrupted by user]')).toEqual([
      { kind: 'stopped' },
    ])
    expect(saidParts('[Request interrupted by user for tool use]')).toEqual([
      { kind: 'stopped' },
    ])
  })

  it("tells a background task's notice and the file open in your editor", () => {
    expect(
      saidParts(
        '<task-notification>\n<task-id>b1</task-id>\n<status>completed</status>\n<summary>Background command "pnpm test" completed (exit code 0)</summary>\n</task-notification>'
      )
    ).toEqual([
      {
        kind: 'note',
        text: 'Background command "pnpm test" completed (exit code 0)',
      },
    ])
    expect(
      saidParts(
        '<ide_opened_file>The user opened the file /w/a.ts in the IDE.\nThis may or may not be related.</ide_opened_file>\nWhy does this fail?'
      )
    ).toEqual([
      { kind: 'note', text: 'The user opened the file /w/a.ts in the IDE.' },
      { kind: 'text', text: 'Why does this fail?' },
    ])
  })

  it('reads a task only in a message Pacenote handed over', () => {
    const tag = '<task id="t1" action="reply">\nAnswer mina\n</task>'
    // Pasted into a turn of yours: as you wrote it
    expect(saidParts(`Look at this:\n${tag}`)).toEqual([
      { kind: 'text', text: `Look at this:\n${tag}` },
    ])
    // Cut short, it is still the task as far as it goes
    expect(
      saidParts(
        'You are taking over a task from Pacenote [pacenote-task:m2].\n\n<task id="t1" action="reply">\nAnswer mina\nmina asked you · DM with mina · 2026-11-20 01:30\nWhy: Asked you by name\nand waits'
      )
    ).toEqual([
      { kind: 'handoff' },
      {
        kind: 'task',
        task: {
          id: 't1',
          action: 'reply',
          title: 'Answer mina',
          askedBy: 'mina',
          where: 'DM with mina',
          at: '2026-11-20T01:30:00.000Z',
          why: 'Asked you by name\nand waits',
          earlier: [],
        },
      },
    ])
  })

  it('keeps a tag it does not know as written', () => {
    expect(saidParts('Wrap it in <div> please')).toEqual([
      { kind: 'text', text: 'Wrap it in <div> please' },
    ])
  })
})

describe('how a step reads', () => {
  it('names an MCP tool by its server and its own name', () => {
    expect(toolLabel('mcp__pacenote__my_tasks')).toBe('pacenote · my_tasks')
    expect(toolLabel('Bash')).toBe('Bash')
  })

  it("reads a path in the session's folder from there", () => {
    expect(stepTarget('/w/pay/src/a.ts', '/w/pay')).toBe('src/a.ts')
    expect(stepTarget('/w/other/a.ts', '/w/pay')).toBe('/w/other/a.ts')
    expect(stepTarget('pnpm test', '/w/pay')).toBe('pnpm test')
  })
})
