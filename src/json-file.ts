import { mkdirSync, readFileSync, renameSync, writeFileSync } from 'node:fs'
import path from 'node:path'

/** A JSON file's value, or fallback when it is missing or not JSON */
export function readJson<T>(file: string, fallback: T): T {
  try {
    return JSON.parse(readFileSync(file, 'utf8')) as T
  } catch {
    return fallback
  }
}

/** Writes through a temporary file, so no half-written file is left behind */
export function writeJson(file: string, value: unknown): void {
  write(file, `${JSON.stringify(value, null, 2)}\n`)
}

/**
 * writeJson, except a file that already says the same is left alone, so what
 * watches it does not wake for nothing
 */
export function writeJsonIfChanged(file: string, value: unknown): void {
  const text = `${JSON.stringify(value, null, 2)}\n`
  let was: string | undefined
  try {
    was = readFileSync(file, 'utf8')
  } catch {
    // Not written yet
  }
  if (was !== text) write(file, text)
}

function write(file: string, text: string): void {
  mkdirSync(path.dirname(file), { recursive: true })
  const tmp = `${file}.tmp`
  writeFileSync(tmp, text)
  renameSync(tmp, file)
}
