import {
  mkdirSync,
  readFileSync,
  renameSync,
  rmSync,
  writeFileSync,
} from 'node:fs'
import path from 'node:path'

/** A JSON file's value, or fallback when it is missing or not JSON */
export function readJson<T>(file: string, fallback: T): T {
  try {
    return JSON.parse(readFileSync(file, 'utf8')) as T
  } catch {
    return fallback
  }
}

/**
 * Writes through a temporary file, so no half-written file is left behind;
 * with a mode (0o600 for a file holding secrets), the file gets it
 */
export function writeJson(file: string, value: unknown, mode?: number): void {
  write(file, `${JSON.stringify(value, null, 2)}\n`, mode)
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

function write(file: string, text: string, mode?: number): void {
  mkdirSync(path.dirname(file), { recursive: true })
  replaceFile(file, text, mode)
}

/**
 * Writes a file through a temporary one beside it, so a reader never sees it
 * half written. With a mode (0o600 for a file holding secrets), the file gets
 * it, whatever an earlier attempt left. Its folder must exist.
 */
export function replaceFile(file: string, text: string, mode?: number): void {
  const tmp = `${file}.tmp`
  rmSync(tmp, { force: true })
  writeFileSync(tmp, text, mode === undefined ? undefined : { mode })
  renameSync(tmp, file)
}
