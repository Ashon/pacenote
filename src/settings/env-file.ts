import { existsSync, readFileSync } from 'node:fs'
import { parseEnv } from 'node:util'

/**
 * Reads the values of a .env, the file earlier versions kept settings in (now
 * moved into settings.json, settings-file.ts), with the same rules as node
 * --env-file.
 */
export function readEnvValues(text: string): Record<string, string> {
  return parseEnv(text) as Record<string, string>
}

export function readEnvFile(file: string): string {
  return existsSync(file) ? readFileSync(file, 'utf8') : ''
}

/**
 * Settings whose meaning changed, rewritten as Pace reads them now, each with
 * a line for the log: REASONER_SANDBOX=docker, the sandbox Pacenote had before
 * the built-in one, becomes vm; MENTION_ANYONE, from when Pace could answer a
 * whole workspace, goes, since it answers only you.
 */
export function migrateEnvValues(values: Record<string, string>): {
  values: Record<string, string>
  notes: string[]
} {
  const next = { ...values }
  const notes: string[] = []
  if (next.REASONER_SANDBOX === 'docker') {
    next.REASONER_SANDBOX = 'vm'
    notes.push('REASONER_SANDBOX=docker is now vm (the built-in sandbox)')
  }
  if ('MENTION_ANYONE' in next) {
    delete next.MENTION_ANYONE
    notes.push('MENTION_ANYONE is removed: Pace answers only you')
  }
  return { values: next, notes }
}
