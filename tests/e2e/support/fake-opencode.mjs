#!/usr/bin/env node
// Stands in for `opencode run` in end-to-end tests (OPENCODE_BIN), by the
// same rules as fake-claude.mjs ($FAKE_CLAUDE_DIR/script.json, a rule with
// cli "claude" or "codex" left to those fakes). It takes the message as its
// last argument, records each call in $FAKE_CLAUDE_DIR/calls.jsonl with cli
// "opencode", its config (OPENCODE_CONFIG) and folder (PWD), and answers in
// opencode run --format json events: a step, the answer as a text part, or
// an error event and exit 1 for a rule with "fail". `opencode --version`
// says 2.0.32, and `opencode session delete` is recorded and does nothing.
import { appendFileSync, readFileSync } from 'node:fs'
import path from 'node:path'
import process from 'node:process'
import { setTimeout } from 'node:timers/promises'

const args = process.argv.slice(2)
if (args[0] === '--version') {
  process.stdout.write('opencode v2.0.32\n')
  process.exit(0)
}
const dir = process.env.FAKE_CLAUDE_DIR
if (!dir) {
  process.stderr.write('FAKE_CLAUDE_DIR is not set\n')
  process.exit(2)
}
const record = (call) =>
  appendFileSync(
    path.join(dir, 'calls.jsonl'),
    `${JSON.stringify({
      cli: 'opencode',
      args,
      config: process.env.OPENCODE_CONFIG,
      cwd: process.env.PWD,
      system: '',
      request: '',
      images: 0,
      pid: process.pid,
      ...call,
    })}\n`
  )
if (args[0] === 'session') {
  record({ prompt: '' })
  process.exit(0)
}
if (args[0] !== 'run') {
  process.stderr.write(`fake opencode: unexpected ${args.join(' ')}\n`)
  process.exit(2)
}

const prompt = args.at(-1) ?? ''
record({ prompt })
const script = JSON.parse(readFileSync(path.join(dir, 'script.json'), 'utf8'))
const rule =
  (script.rules ?? []).find(
    (r) =>
      (!r.cli || r.cli === 'opencode') && new RegExp(r.match, 'i').test(prompt)
  ) ?? {}
if (rule.delayMs) await setTimeout(rule.delayMs)

const sessionID = `ses_fake${process.pid}`
const out = (event) =>
  process.stdout.write(
    `${JSON.stringify({ timestamp: Date.now(), sessionID, ...event })}\n`
  )
out({ type: 'step_start', part: { type: 'step-start' } })
if (rule.fail) {
  out({
    type: 'error',
    error: { type: 'provider.transport', message: rule.fail },
  })
  process.exit(1)
}
out({
  type: 'text',
  part: { type: 'text', text: rule.answer ?? script.answer ?? 'OK' },
})
