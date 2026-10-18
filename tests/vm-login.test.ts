import {
  chmodSync,
  existsSync,
  mkdirSync,
  mkdtempSync,
  rmSync,
  writeFileSync,
} from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { afterAll, describe, expect, it } from 'vitest'
import {
  loginDir,
  parseLoginPrompt,
  signedIn,
  signOut,
  VmLogin,
  type LoginPrompt,
} from '../src/sandbox/vm-login.js'

const root = mkdtempSync(path.join(tmpdir(), 'pacenote-vm-login-'))
afterAll(() => rmSync(root, { recursive: true, force: true }))

/** What claude auth login printed in the VM (Claude Code 2.1.302) */
const CLAUDE_OUTPUT = `Opening browser to sign in…
If the browser didn't open, visit: https://claude.com/cai/oauth/authorize?code=true&client_id=9d1c250a&response_type=code&redirect_uri=https%3A%2F%2Fplatform.claude.com%2Foauth%2Fcode%2Fcallback&state=abc
Paste code here if prompted > `

/** What codex login --device-auth printed in the VM (codex 0.162.1) */
const CODEX_OUTPUT = `Welcome to Codex [v\x1b[90m0.162.1\x1b[0m]
Follow these steps to sign in with ChatGPT using device code authorization:
1. Open this link in your browser and sign in to your account
   \x1b[94mhttps://auth.openai.com/codex/device\x1b[0m
2. Enter this one-time code \x1b[90m(expires in 15 minutes)\x1b[0m
   \x1b[94m35HM-7RDQP\x1b[0m
`

describe('the sandbox sign-in', () => {
  it("reads the page and code from each CLI's login, once all of it is there", () => {
    expect(parseLoginPrompt('claude', CLAUDE_OUTPUT)).toEqual({
      url: expect.stringMatching(
        /^https:\/\/claude\.com\/cai\/oauth\/authorize\?code=true&.*state=abc$/
      ),
      paste: true,
    })
    expect(parseLoginPrompt('claude', 'Opening browser to sign in…\n')).toBe(
      undefined
    )
    expect(parseLoginPrompt('codex', CODEX_OUTPUT)).toEqual({
      url: 'https://auth.openai.com/codex/device',
      code: '35HM-7RDQP',
    })
    // The link without its code yet is not a prompt
    expect(
      parseLoginPrompt('codex', CODEX_OUTPUT.split('2. Enter')[0]!)
    ).toBeUndefined()
  })

  /**
   * A pacenote-vm that runs claude's login: it prints the page, reads the code
   * it is handed, and on the right one leaves the credentials file in the
   * folder mounted at /run/login, as claude does
   */
  function fakeVm(): string {
    const bin = path.join(root, 'pacenote-vm')
    writeFileSync(
      bin,
      `#!/usr/bin/env node
const args = process.argv.slice(2)
const mount = args[args.indexOf('--mount') + 1].split(':')
if (mount[1] !== '/run/login' || process.env.CLAUDE_CONFIG_DIR !== '/run/login') process.exit(3)
process.stdout.write(${JSON.stringify(CLAUDE_OUTPUT)})
process.stdin.once('data', (chunk) => {
  if (String(chunk).trim() !== 'right-code#state') {
    console.log('Login failed: Invalid code')
    process.exit(1)
  }
  require('fs').writeFileSync(mount[0] + '/.credentials.json', '{}')
  console.log('Login successful.')
  process.exit(0)
})
`
    )
    chmodSync(bin, 0o755)
    return bin
  }

  it('hands Claude the code its page shows, and is signed in once the CLI is', async () => {
    const vmRoot = path.join(root, 'vm')
    const login = new VmLogin({
      cli: 'claude',
      bin: fakeVm(),
      root: vmRoot,
      image: 'reasoner',
    })
    const prompts: LoginPrompt[] = []
    const result = await login.start((prompt) => {
      prompts.push(prompt)
      login.submit('  right-code#state\n')
    })
    expect(result).toEqual({ ok: true })
    expect(prompts).toEqual([expect.objectContaining({ paste: true })])
    expect(signedIn(vmRoot, 'claude')).toBe(true)

    signOut(vmRoot, 'claude')
    expect(existsSync(loginDir(vmRoot, 'claude'))).toBe(false)
  })

  it("says why, in the CLI's words, when it did not sign in", async () => {
    const vmRoot = path.join(root, 'vm-wrong')
    mkdirSync(vmRoot, { recursive: true })
    const login = new VmLogin({
      cli: 'claude',
      bin: fakeVm(),
      root: vmRoot,
      image: 'reasoner',
    })
    const result = await login.start(() => login.submit('wrong'))
    expect(result).toEqual({
      ok: false,
      error: 'The sign-in did not finish: Login failed: Invalid code',
    })
    expect(signedIn(vmRoot, 'claude')).toBe(false)
  })

  it('stops when cancelled', async () => {
    const login = new VmLogin({
      cli: 'claude',
      bin: fakeVm(),
      root: path.join(root, 'vm-cancel'),
      image: 'reasoner',
    })
    const result = await login.start(() => login.cancel())
    expect(result).toEqual({ ok: false, error: 'Cancelled.' })
  })
})
