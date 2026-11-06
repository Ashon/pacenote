import { app } from 'electron'
import { existsSync } from 'node:fs'
import path from 'node:path'
import { splitList } from '../../../src/settings/list.js'
import {
  WORK_TOOLS,
  workToolOf,
  type WorkTool,
} from '../../../src/tasks/types.js'
import type { OpenIn } from './handoff.js'
import type { Desktop } from './ipc/context.js'

/**
 * Todo as Settings > Todo sets it, read afresh each time, and whether the
 * Claude app and the Codex app are on this Mac: sessions can open in them
 * (Open sessions in); tests list them in PACENOTE_HANDOFF_APPS.
 */
export type TodoSettings = ReturnType<typeof todoSettings>

export function todoSettings(
  desktop: Pick<Desktop, 'settings' | 'toolPath' | 'cliBins'>
) {
  const { settings, toolPath, cliBins } = desktop
  /** Whether a command is on the PATH Pacenote runs the CLIs with */
  const onPath = (bin: string) =>
    bin.includes('/')
      ? existsSync(bin)
      : toolPath()
          .split(':')
          .some((dir) => dir && existsSync(path.join(dir, bin)))
  const hasApp = (tool: WorkTool) =>
    process.env.PACENOTE_HANDOFF_APPS === undefined
      ? Boolean(app.getApplicationNameForProtocol(`${tool}://`))
      : splitList(process.env.PACENOTE_HANDOFF_APPS).includes(tool)
  const current = () => {
    const env = settings.effectiveEnv()
    const inApp = env.TASKS_OPEN_IN === 'app'
    return {
      on: env.TASKS === 'on',
      dms: env.TASKS_DMS === 'on',
      exclude: splitList(env.TASKS_EXCLUDE_CHANNELS),
      names: splitList(env.TASKS_NAMES),
      groups: splitList(env.TASKS_GROUPS),
      /** Where code tasks continue */
      cli: workToolOf(env.TASKS_CLI) ?? 'claude',
      /** The tools a code task can continue in here */
      tools: WORK_TOOLS.filter(
        (tool) => tool !== 'opencode' || onPath(cliBins().opencode)
      ),
      /** Where each tool's new sessions open: its app, when on this Mac */
      opensIn: {
        claude: inApp && hasApp('claude') ? 'app' : 'terminal',
        codex: inApp && hasApp('codex') ? 'app' : 'terminal',
        // opencode has no app to write the task into
        opencode: 'terminal',
      } satisfies Record<WorkTool, OpenIn>,
    }
  }
  return { current, hasApp }
}
