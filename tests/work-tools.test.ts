import { describe, expect, it } from 'vitest'
import {
  WORK_TOOL_CLIENTS,
  WORK_TOOLS,
  workToolOf,
} from '../src/tasks/types.js'
import { reasonerOf } from '../src/reasoners/ids.js'

describe('the tools a task continues in', () => {
  it('takes each tool by its own name and no other', () => {
    for (const tool of WORK_TOOLS) expect(workToolOf(tool)).toBe(tool)
    // opencode was once taken for Claude Code by a two-way choice
    expect(workToolOf('opencode')).toBe('opencode')
    for (const value of ['', 'Claude', 'claude-code', undefined, 1, {}])
      expect(workToolOf(value)).toBeUndefined()
  })

  it('names every tool as its MCP client is named', () => {
    expect(WORK_TOOLS.map((tool) => WORK_TOOL_CLIENTS[tool])).toEqual([
      'claude-code',
      'codex',
      'opencode',
    ])
  })
})

describe('the reasoner a setting names', () => {
  it('is Codex only when it says codex, and Claude Code otherwise', () => {
    expect(reasonerOf('codex')).toBe('codex')
    for (const value of ['claude', '', 'Codex', undefined])
      expect(reasonerOf(value)).toBe('claude')
  })
})
