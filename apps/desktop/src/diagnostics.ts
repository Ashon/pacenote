import { closeSync, fstatSync, openSync, readSync } from 'node:fs'
import { redactLogLine } from '../../../src/logger.js'
import type {
  BotStatusView,
  SupervisorState,
} from '../../../src/runtime/types.js'
import { isSecretKey } from '../../../src/settings/fields.js'

/** What a bug report needs to know, as the app gathers it */
interface DiagnosticsInput {
  app: {
    version: string
    packaged: boolean
    electron: string
    node: string
    os: string
    arch: string
  }
  supervisor?: SupervisorState
  bot: BotStatusView
  /** The settings file's values */
  settings: Record<string, string>
  /** Secret values to take out wherever they show up */
  secrets: readonly string[]
  logs: { name: string; lines: string[] }[]
}

/**
 * Diagnostics to paste into a bug report: versions, Pace's state and status,
 * the settings without their secrets, and the latest logs. Secret settings are
 * only said to be set, and secret values and token formats are taken out of
 * everything else.
 */
export function diagnosticsText(
  input: DiagnosticsInput,
  now = new Date()
): string {
  const clean = (text: string) => {
    let out = text
    for (const secret of input.secrets)
      if (secret.length >= 8) out = out.split(secret).join('[REDACTED SECRET]')
    return redactLogLine(out)
  }
  const { app, supervisor, bot } = input
  const settings = Object.entries(input.settings)
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([key, value]) =>
      isSecretKey(key) ? `${key}=(set)` : `${key}=${clean(value)}`
    )
  const sections: [string, string[]][] = [
    [
      'App',
      [
        `Pacenote ${app.version}${app.packaged ? '' : ' (from the repository)'}`,
        `Electron ${app.electron}, Node ${app.node}, ${app.os} (${app.arch})`,
      ],
    ],
    [
      'Pace in the app',
      supervisor
        ? [
            JSON.stringify({ ...supervisor, output: undefined }, null, 2),
            ...(supervisor.output.length
              ? ['Last output:', ...supervisor.output.slice(-40)]
              : []),
          ]
        : ['Not managed by this app'],
    ],
    [
      'Pace status (bot.json)',
      [
        bot.status
          ? `${bot.alive ? 'Running' : 'Not running'}\n${JSON.stringify(bot.status, null, 2)}`
          : 'No status: Pace is not running',
      ],
    ],
    ['Settings file', settings.length ? settings : ['Empty or missing']],
    ...input.logs.map(({ name, lines }): [string, string[]] => [
      name,
      lines.length ? lines : ['Empty'],
    ]),
  ]
  return clean(
    [
      `Pacenote diagnostics, ${now.toISOString()}`,
      ...sections.map(([title, lines]) => `\n## ${title}\n${lines.join('\n')}`),
    ].join('\n')
  )
}

/** The last lines of a file, reading no more than its last maxBytes */
export function tailFile(
  file: string,
  lines: number,
  maxBytes = 256 * 1024
): string[] {
  let fd: number | undefined
  try {
    fd = openSync(file, 'r')
    const { size } = fstatSync(fd)
    const length = Math.min(size, maxBytes)
    const buffer = Buffer.alloc(length)
    readSync(fd, buffer, 0, length, size - length)
    const all = buffer.toString('utf8').split('\n')
    // The first line may start partway through.
    if (length < size) all.shift()
    return all.filter((line) => line.trim()).slice(-lines)
  } catch {
    return []
  } finally {
    if (fd !== undefined) closeSync(fd)
  }
}
