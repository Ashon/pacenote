#!/usr/bin/env node
// Stands in for `claude -p` in end-to-end tests (CLAUDE_BIN). It reads the
// prompt the way claude does (plain text, or stream-json with image blocks),
// records each call in $FAKE_CLAUDE_DIR/calls.jsonl, and answers by the first
// rule in $FAKE_CLAUDE_DIR/script.json whose pattern matches the request:
//   { "rules": [{ "match": "regex", "answer": "...", "delayMs": 0,
//                 "fail": "message",
//                 "tools": [{ "name": "mcp__ops__host_check", "input": {},
//                            "result": "..." }] }],
//     "answer": "default answer" }
// The bot's startup check (claude --version, claude auth status) is answered
// without a record: a fake that is installed and signed in.
// An interactive session the desktop app opens to continue a task
// (claude --session-id ID -n NAME PROMPT, or claude --resume ID) is recorded
// the same way, with its folder, and leaves a transcript where Claude Code
// keeps its own: $HOME/.claude/projects/<folder>/<ID>.jsonl.
import { appendFileSync, mkdirSync, readFileSync } from 'node:fs'
import path from 'node:path'
import process from 'node:process'
import { setTimeout } from 'node:timers/promises'

if (process.argv[2] === '--version') {
  process.stdout.write('2.1.0 (Claude Code)\n')
  process.exit(0)
}
if (process.argv[2] === 'auth') {
  process.stdout.write(`${JSON.stringify({ loggedIn: true })}\n`)
  process.exit(0)
}

const dir = process.env.FAKE_CLAUDE_DIR
if (!dir) {
  process.stderr.write('FAKE_CLAUDE_DIR is not set\n')
  process.exit(2)
}
const args = process.argv.slice(2)

const sessionAt = args.indexOf('--session-id')
const resumeAt = args.indexOf('--resume')
if (sessionAt >= 0 || resumeAt >= 0) {
  const id = args[(sessionAt >= 0 ? sessionAt : resumeAt) + 1]
  const prompt = sessionAt >= 0 ? args[args.length - 1] : ''
  appendFileSync(
    path.join(dir, 'calls.jsonl'),
    `${JSON.stringify({ args, system: '', prompt, request: '', images: 0, cwd: process.cwd(), pid: process.pid })}\n`
  )
  const project = path.join(
    process.env.HOME,
    '.claude',
    'projects',
    process.cwd().replace(/[/.]/g, '-')
  )
  mkdirSync(project, { recursive: true })
  const at = new Date().toISOString()
  const lines =
    sessionAt >= 0
      ? [
          {
            type: 'user',
            sessionId: id,
            cwd: process.cwd(),
            timestamp: at,
            message: { role: 'user', content: prompt },
          },
          {
            type: 'assistant',
            sessionId: id,
            cwd: process.cwd(),
            timestamp: at,
            message: {
              role: 'assistant',
              content: [
                {
                  type: 'text',
                  text: 'Here is the task as I understand it. Shall I start with step 1?',
                },
                {
                  type: 'tool_use',
                  name: 'mcp__pacenote__task_context',
                  input: { task: 'the task' },
                },
              ],
            },
          },
        ]
      : [
          {
            type: 'user',
            sessionId: id,
            cwd: process.cwd(),
            timestamp: at,
            message: { role: 'user', content: 'Continue where we left off.' },
          },
        ]
  appendFileSync(
    path.join(project, `${id}.jsonl`),
    lines.map((line) => `${JSON.stringify(line)}\n`).join('')
  )
  process.exit(0)
}

const stdin = readFileSync(0, 'utf8')

let prompt = stdin
let images = 0
if (args.includes('--input-format')) {
  const line = JSON.parse(stdin.trim().split('\n')[0])
  const blocks = line.message?.content ?? []
  prompt = blocks
    .filter((block) => block.type === 'text')
    .map((block) => block.text)
    .join('\n')
  images = blocks.filter((block) => block.type === 'image').length
}
const system = args[args.indexOf('--system-prompt') + 1] ?? ''
const request =
  /<request from="[^"]*">\n([\s\S]*?)\n<\/request>/.exec(prompt)?.[1] ?? ''
appendFileSync(
  path.join(dir, 'calls.jsonl'),
  `${JSON.stringify({ args, system, prompt, request, images, pid: process.pid })}\n`
)

const script = JSON.parse(readFileSync(path.join(dir, 'script.json'), 'utf8'))
// A mention's request, or the whole prompt (a reply drafted from a task)
const rule =
  (script.rules ?? []).find((r) =>
    new RegExp(r.match, 'i').test(request || prompt)
  ) ?? {}
if (rule.delayMs) await setTimeout(rule.delayMs)

const out = (event) => process.stdout.write(`${JSON.stringify(event)}\n`)
out({ type: 'system', subtype: 'init' })
for (const [i, tool] of (rule.tools ?? []).entries()) {
  const id = `toolu_${i + 1}`
  out({
    type: 'assistant',
    message: {
      content: [
        { type: 'tool_use', id, name: tool.name, input: tool.input ?? {} },
      ],
    },
  })
  out({
    type: 'user',
    message: {
      content: [
        { type: 'tool_result', tool_use_id: id, content: tool.result ?? '' },
      ],
    },
  })
}
if (rule.fail) {
  out({
    type: 'result',
    subtype: 'error_during_execution',
    is_error: true,
    result: rule.fail,
  })
  process.exit(1)
}
const answer = rule.answer ?? script.answer ?? 'OK'
out({
  type: 'assistant',
  message: { content: [{ type: 'text', text: answer }] },
})
out({
  type: 'result',
  subtype: 'success',
  is_error: false,
  result: answer,
  usage: { input_tokens: 100, output_tokens: 20 },
  total_cost_usd: 0.001,
})
