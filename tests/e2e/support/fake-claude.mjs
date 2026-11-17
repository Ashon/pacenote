#!/usr/bin/env node
// Stands in for `claude -p` in end-to-end tests (CLAUDE_BIN). It reads the
// prompt the way claude does (plain text, or stream-json with image blocks),
// records each call in $FAKE_CLAUDE_DIR/calls.jsonl, and answers by the first
// rule in $FAKE_CLAUDE_DIR/script.json whose pattern matches the request
// (a rule with cli "codex" is the fake codex's only):
//   { "rules": [{ "match": "regex", "answer": "...", "delayMs": 0,
//                 "fail": "message",
//                 "tools": [{ "name": "mcp__ops__host_check", "input": {},
//                            "result": "..." }] }],
//     "answer": "default answer" }
// With --output-format json, only the result comes back, as one object.
// The bot's startup check (claude --version, claude auth status) is answered
// without a record: a fake that is installed and signed in, and so is claude
// agents --json, from $FAKE_CLAUDE_DIR/agents.json.
// An interactive session the desktop app opens to continue a task
// (claude --session-id ID -n NAME PROMPT, or claude --resume ID) is recorded
// the same way, with its folder, and leaves a transcript where Claude Code
// keeps its own: $HOME/.claude/projects/<folder>/<ID>.jsonl, each line with
// the folder's git branch.
import { execFileSync } from 'node:child_process'
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

// claude agents --json: the sessions $FAKE_CLAUDE_DIR/agents.json says are
// open on this Mac, none without it
if (process.argv[2] === 'agents') {
  let list = '[]'
  try {
    list = readFileSync(
      path.join(process.env.FAKE_CLAUDE_DIR ?? '', 'agents.json'),
      'utf8'
    )
  } catch {
    // No sessions open
  }
  process.stdout.write(`${list.trim()}\n`)
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

// A session Pacenote runs from its page (claude -p --resume ID
// --input-format stream-json --permission-prompt-tool stdio): each message
// you send runs the tests, asking first unless allowed in the session, and
// answers; the conversation goes to the session's transcript as it goes.
// With --fork-session it is a copy, with an id of its own; with --session-id a
// new session (--name its title, --permission-mode how it asks), whose first
// message, a task's, it answers with its plan.
if (args.includes('--permission-prompt-tool')) {
  const { createInterface } = await import('node:readline')
  const { randomUUID } = await import('node:crypto')
  const session = args.includes('--fork-session')
    ? randomUUID()
    : args[(sessionAt >= 0 ? sessionAt : resumeAt) + 1]
  appendFileSync(
    path.join(dir, 'calls.jsonl'),
    `${JSON.stringify({ args, system: '', prompt: '', request: '', images: 0, cwd: process.cwd(), pid: process.pid })}\n`
  )
  const project = path.join(
    process.env.HOME,
    '.claude',
    'projects',
    process.cwd().replace(/[/.]/g, '-')
  )
  mkdirSync(project, { recursive: true })
  const transcript = path.join(project, `${session}.jsonl`)
  const log = (line) =>
    appendFileSync(
      transcript,
      `${JSON.stringify({ ...line, sessionId: session, cwd: process.cwd(), timestamp: new Date().toISOString() })}\n`
    )
  const out = (event) =>
    process.stdout.write(
      `${JSON.stringify({ ...event, session_id: session })}\n`
    )
  const nameAt = args.indexOf('--name')
  if (nameAt >= 0) log({ type: 'custom-title', customTitle: args[nameAt + 1] })
  const modeAt = args.indexOf('--permission-mode')
  let mode = modeAt >= 0 ? args[modeAt + 1] : 'default'
  let allowed = false
  let turns = 0
  /** The ask waiting for its answer */
  let pending
  let queue = Promise.resolve()
  const turn = async (said) => {
    turns++
    out({
      type: 'system',
      subtype: 'init',
      permissionMode: mode,
      cwd: process.cwd(),
    })
    log({ type: 'user', message: { role: 'user', content: said } })
    // A task handed over: its plan, then it waits for you
    if (said.startsWith('You are taking over a task from Pacenote')) {
      const title = /<task [^>]*>\n(.*)/.exec(said)?.[1] ?? 'the task'
      const content = [
        {
          type: 'text',
          text: `Here is my plan for "${title}": read the failing test, then fix the retry. Shall I start?`,
        },
      ]
      log({ type: 'assistant', message: { role: 'assistant', content } })
      out({ type: 'assistant', message: { content } })
      out({ type: 'result', subtype: 'success', is_error: false })
      return
    }
    // Asked to explain: it thinks a while, then writes its answer as it
    // goes (--include-partial-messages), in Markdown
    if (/^Explain/.test(said)) {
      const stream = (event) => out({ type: 'stream_event', event })
      stream({
        type: 'content_block_start',
        index: 0,
        content_block: { type: 'thinking', thinking: '' },
      })
      await setTimeout(1500)
      stream({ type: 'content_block_stop', index: 0 })
      stream({
        type: 'content_block_start',
        index: 1,
        content_block: { type: 'text', text: '' },
      })
      const reply = [
        '## How the backoff works\n\n',
        'Each retry waits twice as long as the one before, ',
        'from `BASE_DELAY_MS`:\n\n',
        '1. The first retry after **1s**\n',
        '2. The second after **2s**\n',
        '3. The third after **4s**\n\n',
        'With `maxAttempts` at 5 the last one waits 16s.',
      ]
      for (const text of reply) {
        stream({
          type: 'content_block_delta',
          index: 1,
          delta: { type: 'text_delta', text },
        })
        await setTimeout(300)
      }
      const content = [{ type: 'text', text: reply.join('') }]
      log({ type: 'assistant', message: { role: 'assistant', content } })
      out({ type: 'assistant', message: { content } })
      out({ type: 'result', subtype: 'success', is_error: false })
      return
    }
    const id = `toolu_${turns}`
    const input = { command: 'pnpm vitest run test/webhook-retry.test.ts' }
    const step = { type: 'tool_use', id, name: 'Bash', input }
    log({ type: 'assistant', message: { role: 'assistant', content: [step] } })
    out({ type: 'assistant', message: { content: [step] } })
    let answer = { behavior: 'allow' }
    if (!allowed && mode !== 'acceptEdits') {
      const request_id = `ask_${turns}`
      out({
        type: 'control_request',
        request_id,
        request: {
          subtype: 'can_use_tool',
          tool_name: 'Bash',
          display_name: 'Bash',
          input,
          permission_suggestions: [
            {
              type: 'addRules',
              rules: [{ toolName: 'Bash', ruleContent: 'pnpm vitest:*' }],
              behavior: 'allow',
              destination: 'localSettings',
            },
          ],
          tool_use_id: id,
        },
      })
      answer = await new Promise((resolve) => {
        pending = { request_id, resolve }
      })
      pending = undefined
      if (
        answer.updatedPermissions?.some(
          (rule) => rule.destination === 'session'
        )
      )
        allowed = true
    }
    const ran = answer.behavior === 'allow'
    const result = {
      type: 'tool_result',
      tool_use_id: id,
      content: ran ? '12 passed' : answer.message,
      is_error: !ran,
    }
    log({ type: 'user', message: { role: 'user', content: [result] } })
    out({ type: 'user', message: { content: [result] } })
    const reply = ran
      ? `Done: ${said}. The retry tests pass.`
      : `I did not run them: ${answer.message}`
    log({
      type: 'assistant',
      message: { role: 'assistant', content: [{ type: 'text', text: reply }] },
    })
    out({
      type: 'assistant',
      message: { content: [{ type: 'text', text: reply }] },
    })
    out({ type: 'result', subtype: 'success', is_error: false, result: reply })
  }
  const input = createInterface({ input: process.stdin })
  input.on('line', (line) => {
    const message = JSON.parse(line)
    if (message.type === 'user') {
      const said = message.message.content
      queue = queue.then(() => turn(said))
    } else if (
      message.type === 'control_response' &&
      pending?.request_id === message.response.request_id
    )
      pending.resolve(message.response.response)
    else if (message.type === 'control_request') {
      const request = message.request
      if (request.subtype === 'set_permission_mode') mode = request.mode
      out({
        type: 'control_response',
        response: {
          subtype: 'success',
          request_id: message.request_id,
          response:
            request.subtype === 'interrupt' ? { still_queued: [] } : { mode },
        },
      })
      if (request.subtype === 'interrupt')
        pending?.resolve({ behavior: 'deny', message: 'Interrupted' })
    }
  })
  input.on('close', () => void queue.then(() => process.exit(0)))
  await new Promise(() => {})
}

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
  // The branch the folder is on, as Claude Code logs it on each line
  let gitBranch
  try {
    gitBranch = execFileSync('git', ['symbolic-ref', '--short', 'HEAD'], {
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'ignore'],
    }).trim()
  } catch {
    // Not a repository
  }
  const lines = (
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
  ).map((line) => (gitBranch ? { ...line, gitBranch } : line))
  appendFileSync(
    path.join(project, `${id}.jsonl`),
    lines.map((line) => `${JSON.stringify(line)}\n`).join('')
  )
  process.exit(0)
}

const stdin = readFileSync(0, 'utf8')

// A prompt of an MCP server, given as -p /mcp__server__prompt with no stdin
let prompt = stdin.trim()
  ? stdin
  : (args.find((arg) => arg.startsWith('/mcp__')) ?? '')
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
  (script.rules ?? []).find(
    (r) =>
      (!r.cli || r.cli === 'claude') &&
      new RegExp(r.match, 'i').test(request || prompt)
  ) ?? {}
if (rule.delayMs) await setTimeout(rule.delayMs)

// --output-format json: the final result alone, as one object
if (args[args.indexOf('--output-format') + 1] === 'json') {
  process.stdout.write(
    `${JSON.stringify(
      rule.fail
        ? {
            type: 'result',
            subtype: 'error_during_execution',
            is_error: true,
            result: rule.fail,
          }
        : {
            type: 'result',
            subtype: 'success',
            is_error: false,
            result: rule.answer ?? script.answer ?? 'OK',
            usage: { input_tokens: 100, output_tokens: 20 },
          }
    )}\n`
  )
  process.exit(rule.fail ? 1 : 0)
}

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
