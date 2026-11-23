import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { afterAll, describe, expect, it } from 'vitest'
import { readSessionTalk } from '../apps/desktop/src/handoff.js'
import { MadeReader } from '../src/sessions/made.js'

/**
 * What a session made, as its page shows it (A1, A2): read from logs shaped
 * as Claude Code 2.1.325 and Codex write them, with the results' fields as
 * the Artifact tool and the Claude Docs connector give them.
 */

const root = mkdtempSync(path.join(tmpdir(), 'pacenote-made-'))
afterAll(() => rmSync(root, { recursive: true, force: true }))

const BOARD = 'https://claude.ai/artifact/SCpW1bK961hvQpa5yAWgST'
const DESIGN = 'https://claude.ai/artifact/QKN21svewxgyPb6SYRqWnd'
const DOC = 'https://claude.ai/artifact/Ud33E7zZFMwphmQo9Gq9KK'

const AT = (minute: number) =>
  `2026-11-23T02:${String(minute).padStart(2, '0')}:00.000Z`
const said = (
  role: 'user' | 'assistant',
  content: unknown,
  minute: number
) => ({
  type: role,
  timestamp: AT(minute),
  message: { role, content },
})
const call = (id: string, name: string, input: unknown, minute: number) =>
  said('assistant', [{ type: 'tool_use', id, name, input }], minute)
const back = (
  id: string,
  toolUseResult: unknown,
  minute: number,
  content: unknown = 'ok',
  is_error = false
) => ({
  ...said(
    'user',
    [{ type: 'tool_result', tool_use_id: id, content, is_error }],
    minute
  ),
  toolUseResult,
})
const log = (name: string, lines: unknown[]) => {
  const file = path.join(root, name)
  writeFileSync(file, lines.map((line) => JSON.stringify(line)).join('\n'))
  return file
}

describe('what a Claude Code session made', () => {
  const file = log('claude.jsonl', [
    said('user', 'Draw the retry settings, and write the decision up', 0),
    // Read and quickstart: not made here; the read tells the type's name
    call('r1', 'Artifact', { action: 'read', url: BOARD }, 1),
    back(
      'r1',
      {
        file_read: {
          url: BOARD,
          title: 'Pacenote Task-first',
          type: { url: DESIGN, title: 'Design' },
        },
      },
      1
    ),
    call('q1', 'Artifact', { action: 'quickstart', intent: 'design' }, 2),
    back('q1', { type: { url: DESIGN } }, 2),
    // Made from the type, then its files published twice
    call(
      'p1',
      'Artifact',
      { type_url: DESIGN, title: 'Webhook retry storyboard' },
      3
    ),
    back(
      'p1',
      {
        created_from_type: true,
        url: BOARD,
        title: 'Webhook retry storyboard',
        version: 'v1',
      },
      3
    ),
    call(
      'p2',
      'Artifact',
      { url: BOARD, file_path: '/tmp/s/project/canvas.json' },
      4
    ),
    back(
      'p2',
      {
        url: BOARD,
        title: 'Webhook retry storyboard',
        type: { url: DESIGN, release: 'x', latest: true },
        audience: 'owner',
        seq: 2,
        updated: true,
      },
      4
    ),
    // An asset upload and a publish that failed are not made
    call(
      'a1',
      'Artifact',
      { url: BOARD, file_path: '/tmp/a.css', asset: true },
      5
    ),
    back('a1', { written: { url: BOARD }, asset_upload: { id: 'x' } }, 5),
    call('f1', 'Artifact', { url: BOARD, file_path: '/tmp/s/x.ts' }, 6),
    back('f1', 'nothing was published', 6, 'nothing was published', true),
    call(
      'p3',
      'Artifact',
      { url: BOARD, file_path: '/tmp/s/project/canvas.json' },
      7
    ),
    back(
      'p3',
      {
        url: BOARD,
        title: 'Webhook retry storyboard',
        type: { url: DESIGN, release: 'x', latest: true },
        audience: 'owner',
        seq: 3,
        updated: true,
      },
      7
    ),
    // Logged twice: counted once
    back('p3', null, 7),
    // A plain page, private to you
    call('p4', 'Artifact', { file_path: '/tmp/s/retry-log.html' }, 8),
    back(
      'p4',
      {
        url: 'https://claude.ai/artifact/RCe3dmqGUHX1VaBCxemjVZ',
        audience: 'owner',
        seq: 1,
        title: 'Retry log',
      },
      8
    ),
    // A doc made with the connector; a comment on it is not a doc
    call(
      'd1',
      'mcp__claude_ai_Claude_Docs__batch',
      {
        container: {
          kind: 'project',
          create: { name: 'Webhook retries: why five attempts' },
        },
        batch: [],
      },
      9
    ),
    back('d1', null, 9, [
      {
        type: 'text',
        text: `{"verdict":"allow","acks":[],"created":{"verdict":"allow","minted":"dfaec696","bound":true},"frame":{"slug":"dfaec696","url":"${DOC}","artifactUrl":"${DOC}"}}\n\nThe doc's viewer is at ${DOC}`,
      },
    ]),
    call(
      'c1',
      'mcp__claude_ai_Claude_Docs__create',
      { object: 'utterance', payload: { value: { body: 'A question' } } },
      10
    ),
    back('c1', null, 10, [
      {
        type: 'text',
        text: `{"verdict":"allow","minted":"43c30a3b","frame":{"url":"${DOC}","artifactUrl":"${DOC}"}}`,
      },
    ]),
    said(
      'assistant',
      [{ type: 'text', text: `Done: [the board](${BOARD}).` }],
      11
    ),
  ])

  it('makes one of each, as published last, in the order first made', () => {
    const { made } = readSessionTalk(file, 'claude')
    expect(made).toEqual([
      {
        key: BOARD,
        kind: 'typed',
        title: 'Webhook retry storyboard',
        url: BOARD,
        typeName: 'Design',
        version: 3,
        times: 3,
        onlyYou: true,
        at: AT(7),
      },
      {
        key: 'https://claude.ai/artifact/RCe3dmqGUHX1VaBCxemjVZ',
        kind: 'page',
        title: 'Retry log',
        url: 'https://claude.ai/artifact/RCe3dmqGUHX1VaBCxemjVZ',
        version: 1,
        times: 1,
        onlyYou: true,
        at: AT(8),
      },
      {
        key: DOC,
        kind: 'doc',
        title: 'Webhook retries: why five attempts',
        url: DOC,
        times: 1,
        at: AT(9),
      },
    ])
  })

  it('names each on the step that published it last, the steps before as they were', () => {
    const { items } = readSessionTalk(file, 'claude')
    const steps = items.filter((item) => item.role === 'tool')
    expect(steps.map((step) => step.made)).toEqual([
      undefined, // read
      undefined, // quickstart
      undefined, // made from the type: published again since
      undefined,
      undefined, // the asset
      undefined, // failed
      [BOARD],
      ['https://claude.ai/artifact/RCe3dmqGUHX1VaBCxemjVZ'],
      [DOC],
      undefined, // the comment
    ])
  })
})

describe('what a Codex session made', () => {
  const cwd = path.join(root, 'payments')
  mkdirSync(path.join(cwd, 'out'), { recursive: true })
  writeFileSync(path.join(cwd, 'out/failed-webhooks.html'), '<p>41</p>')
  writeFileSync(path.join(cwd, 'out/failures by day.png'), '')
  writeFileSync(path.join(cwd, 'src.ts'), '')
  const outside = path.join(root, 'elsewhere.html')
  writeFileSync(outside, '')
  const answer = (text: string) => ({
    type: 'response_item',
    timestamp: AT(30),
    payload: {
      type: 'message',
      role: 'assistant',
      content: [{ type: 'output_text', text }],
    },
  })
  const file = log('codex.jsonl', [
    answer(
      [
        `The report is at [failed-webhooks.html](${cwd}/out/failed-webhooks.html),`,
        `with the chart in [the chart](${encodeURI(`${cwd}/out/failures by day.png`)}).`,
        // Code, a line in it, one outside the folder, one not there, a link
        `See [src.ts](${cwd}/src.ts), [line 3](${cwd}/out/failed-webhooks.html:3),`,
        `[that](${outside}), [gone](${cwd}/out/gone.pdf), [docs](https://example.com/a.html).`,
      ].join(' ')
    ),
    answer(`Again: [the report](${cwd}/out/failed-webhooks.html)`),
  ])

  it('makes a card of each file in its folder an answer links, on the last answer', () => {
    const { items, made } = readSessionTalk(file, 'codex', 2000, cwd)
    const report = path.join(cwd, 'out/failed-webhooks.html')
    const chart = path.join(cwd, 'out/failures by day.png')
    expect(made).toEqual([
      {
        key: report,
        kind: 'file',
        title: 'failed-webhooks.html',
        path: report,
        file: 'html',
        times: 3,
        at: AT(30),
      },
      {
        key: chart,
        kind: 'file',
        title: 'failures by day.png',
        path: chart,
        file: 'image',
        times: 1,
        at: AT(30),
      },
    ])
    expect(items.map((item) => item.made)).toEqual([[chart], [report]])
    // Without its folder, nothing
    expect(readSessionTalk(file, 'codex').made).toBeUndefined()
  })

  it('asks the caller whether a file is there', () => {
    const reader = new MadeReader('/w/pay', (file) => file.endsWith('a.md'))
    expect(
      reader.said('[a](/w/pay/a.md) [b](/w/pay/b.md) [up](../x.md)')
    ).toEqual(['/w/pay/a.md'])
  })
})
