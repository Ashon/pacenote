import { mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import { loadConfig } from '../src/config.js'
import { setLocale } from '../src/i18n/locale.js'
import { userLocale } from '../src/i18n/user.js'
import {
  donePrompt,
  recapPromptFor,
  taskPrompt,
  taskRules,
} from '../src/tasks/mcp.js'

/**
 * What an AI writes for the user follows the user's language, the app's:
 * task titles and summaries, wrap-ups, recaps and the sessions Pacenote
 * starts. A reply for the user to send stays in its thread's language.
 */
describe("the user's language", () => {
  const dirs: string[] = []
  afterEach(() => {
    setLocale('en')
    for (const dir of dirs.splice(0)) rmSync(dir, { recursive: true })
  })
  const dataDir = (prefs?: object) => {
    const dir = mkdtempSync(path.join(tmpdir(), 'pacenote-lang-'))
    dirs.push(dir)
    if (prefs)
      writeFileSync(path.join(dir, 'desktop.json'), JSON.stringify(prefs))
    return dir
  }

  it("is the app's: told to Pace, kept in the data folder for the MCP server, else the terminal's", () => {
    expect(userLocale(dataDir(), { PACENOTE_LOCALE: 'ko' })).toBe('ko')
    expect(userLocale(dataDir({ locale: 'ko' }), { LANG: 'en_US.UTF-8' })).toBe(
      'ko'
    )
    expect(userLocale(dataDir(), { LANG: 'ko_KR.UTF-8' })).toBe('ko')
    expect(userLocale(dataDir(), {})).toBe('en')
  })

  it('is what task titles, summaries and session prompts ask for', () => {
    expect(taskRules('ko')).toContain(
      'in Korean, the language the user reads Pacenote in, whatever language the messages are in'
    )
    expect(taskRules('en')).toContain('in English, the language the user reads')
    expect(taskPrompt('T-1', 'ko')).toContain('Talk to the user in Korean')
    expect(donePrompt('ko')).toContain('Talk to the user in Korean')
    expect(donePrompt('ko')).toContain('in the language of its thread')
    expect(recapPromptFor('week', 'ko')).toContain('in Korean, the language')
  })

  it("makes Pace's own notes the app's language unless one is chosen", () => {
    const env = {
      SLACK_APP_TOKEN: 'xapp-1-A0TEST-1-abc',
      SLACK_BOT_TOKEN: 'xoxb-test',
      MENTION_ALLOWED_USERS: 'U0OWNER',
      REASONER_SANDBOX: 'none',
      PACENOTE_DATA_DIR: dataDir(),
      PACENOTE_HOME: dataDir(),
    }
    setLocale('ko')
    expect(loadConfig(env).notesLocale).toBe('ko')
    expect(loadConfig({ ...env, NOTES_LANGUAGE: 'en' }).notesLocale).toBe('en')
    setLocale('en')
    expect(loadConfig(env).notesLocale).toBe('en')
  })
})
