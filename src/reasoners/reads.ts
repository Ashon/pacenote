import { homedir } from 'node:os'
import path from 'node:path'
import { SANDBOX_PATHS, type Sandbox } from '../sandbox/runtime.js'
import type { ReasonerOptions } from './types.js'

/**
 * What a reasoner may read, with paths as the CLI sees them. A mention comes
 * from a public channel and its answer goes back there, so the CLI reads the
 * reference directory and nothing else.
 */
export interface ReadScope {
  /** The reference directory, if one is set and the CLI can read it */
  dir?: string
  /** Paths never read, even inside dir */
  denied: string[]
}

/** Never read inside the reference directory: dotenv files hold secrets */
export const DENIED_GLOBS = ['**/.env', '**/.env.*']

/**
 * Credential files and folders under the home folder, never read on this Mac
 * even when the reference directory holds them
 */
const CREDENTIALS = [
  '.ssh',
  '.aws',
  '.azure',
  '.gnupg',
  '.kube',
  '.docker',
  '.config/gh',
  '.config/gcloud',
  '.claude',
  '.claude.json',
  '.codex',
  '.netrc',
  '.git-credentials',
  '.npmrc',
  '.pypirc',
  'Library/Keychains',
]

/**
 * Paths a reasoner on this Mac never reads: Pacenote's own folders (settings,
 * run history) and the usual credentials
 */
export function hostDeniedReads(
  pacenoteDirs: readonly string[],
  home = homedir()
): string[] {
  return [
    ...new Set([
      ...pacenoteDirs.map((dir) => path.resolve(dir)),
      ...CREDENTIALS.map((name) => path.join(home, name)),
    ]),
  ]
}

/**
 * In the sandbox, /proc holds the CLI's environment, with its login, and the
 * secrets mount holds codex's auth.json
 */
const SANDBOX_DENIED = ['/proc', SANDBOX_PATHS.secrets]

export function readScope(
  sandbox: Sandbox,
  options: ReasonerOptions,
  readOnlyDir: string | undefined
): ReadScope {
  return {
    dir: readOnlyDir
      ? sandbox.isolated
        ? SANDBOX_PATHS.workspace
        : readOnlyDir
      : undefined,
    denied: sandbox.isolated ? SANDBOX_DENIED : (options.deniedReads ?? []),
  }
}
