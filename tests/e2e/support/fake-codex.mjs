#!/usr/bin/env node
// Stands in for `codex exec` in end-to-end tests (CODEX_BIN), by the same
// rules as fake-claude.mjs ($FAKE_CLAUDE_DIR/script.json). It reads the prompt
// from stdin as codex does (the instructions prepended to it), takes images
// as --image=PATH files, records each call in $FAKE_CLAUDE_DIR/calls.jsonl
// with cli "codex", and answers in codex's --json events: a tool call per
// rule tool (mcp__server__tool as server and tool), the answer as an
// agent_message, and the tokens on turn.completed. A rule with "image" leaves
// a generated PNG where codex keeps them ($CODEX_HOME or ~/.codex), and one
// with "fail" ends the turn failed.
// The bot's startup check (codex --version, codex login status) is answered
// without a record: a fake that is new enough and signed in.
import { randomUUID } from 'node:crypto'
import { appendFileSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import path from 'node:path'
import process from 'node:process'
import { setTimeout } from 'node:timers/promises'

const args = process.argv.slice(2)
if (args[0] === '--version') {
  process.stdout.write('codex-cli 0.150.0\n')
  process.exit(0)
}
if (args[0] === 'login' && args[1] === 'status') {
  process.stdout.write('Logged in using ChatGPT\n')
  process.exit(0)
}

const dir = process.env.FAKE_CLAUDE_DIR
if (!dir) {
  process.stderr.write('FAKE_CLAUDE_DIR is not set\n')
  process.exit(2)
}
if (args[0] !== 'exec') {
  process.stderr.write(`fake codex: unexpected ${args.join(' ')}\n`)
  process.exit(2)
}

const input = readFileSync(0, 'utf8')
const system =
  /^<instructions>\n([\s\S]*?)\n<\/instructions>/.exec(input)?.[1] ?? ''
const prompt = input.replace(
  /^<instructions>\n[\s\S]*?\n<\/instructions>\n\n/,
  ''
)
const request =
  /<request from="[^"]*">\n([\s\S]*?)\n<\/request>/.exec(prompt)?.[1] ?? ''
const images = args.filter((arg) => arg.startsWith('--image=')).length
appendFileSync(
  path.join(dir, 'calls.jsonl'),
  `${JSON.stringify({ cli: 'codex', args, system, prompt, request, images, pid: process.pid })}\n`
)

const script = JSON.parse(readFileSync(path.join(dir, 'script.json'), 'utf8'))
const rule =
  (script.rules ?? []).find((r) =>
    new RegExp(r.match, 'i').test(request || prompt)
  ) ?? {}
if (rule.delayMs) await setTimeout(rule.delayMs)

const out = (event) => process.stdout.write(`${JSON.stringify(event)}\n`)
const session = randomUUID()
out({ type: 'thread.started', thread_id: session })
out({ type: 'turn.started' })
for (const [i, tool] of (rule.tools ?? []).entries()) {
  const [, server = 'tools', name = tool.name] =
    /^mcp__(.+?)__(.+)$/.exec(tool.name) ?? []
  const item = {
    id: `item_${i}`,
    type: 'mcp_tool_call',
    server,
    tool: name,
    arguments: tool.input ?? {},
  }
  out({ type: 'item.started', item: { ...item, status: 'in_progress' } })
  out({
    type: 'item.completed',
    item: {
      ...item,
      status: 'completed',
      result: { content: [{ type: 'text', text: tool.result ?? '' }] },
    },
  })
}
if (rule.fail) {
  out({ type: 'error', message: rule.fail })
  out({ type: 'turn.failed', error: { message: rule.fail } })
  process.exit(1)
}
if (rule.image) {
  const generated = path.join(
    process.env.CODEX_HOME ?? path.join(process.env.HOME, '.codex'),
    'generated_images',
    session
  )
  mkdirSync(generated, { recursive: true })
  writeFileSync(
    path.join(generated, 'image_1.png'),
    Buffer.from(
      '89504e470d0a1a0a0000000d49484452000000010000000108060000001f15c4890000000d4944415478da63f8cfc0f01f0005000201a1a3c5a40000000049454e44ae426082',
      'hex'
    )
  )
}
const answer = rule.answer ?? script.answer ?? 'OK'
out({
  type: 'item.completed',
  item: { id: 'item_answer', type: 'agent_message', text: answer },
})
out({
  type: 'turn.completed',
  usage: { input_tokens: 120, cached_input_tokens: 80, output_tokens: 20 },
})
