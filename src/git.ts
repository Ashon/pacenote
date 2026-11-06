import { execFile } from 'node:child_process'
import { promisify } from 'node:util'

const run = promisify(execFile)

/**
 * What git prints for these arguments in a folder, or undefined when it fails
 * (not a repository, no git, too slow): a lookup that may come up empty
 */
export async function gitIn(
  folder: string,
  args: string[],
  { timeout = 5000, maxBuffer }: { timeout?: number; maxBuffer?: number } = {}
): Promise<string | undefined> {
  try {
    const { stdout } = await run('git', ['-C', folder, ...args], {
      timeout,
      maxBuffer,
    })
    return stdout
  } catch {
    return undefined
  }
}
