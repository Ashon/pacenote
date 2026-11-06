/** How much the bot and the hub log (LOG_LEVEL), least severe first */
export const LOG_LEVELS = ['debug', 'info', 'warn', 'error'] as const
export type LogLevel = (typeof LOG_LEVELS)[number]

/** A level as a log line writes it */
export type LogLineLevel = Uppercase<LogLevel>

/** The level a request names, in either case, as a log line writes it */
export function lineLevelOf(
  value: string | null | undefined
): LogLineLevel | undefined {
  const level = LOG_LEVELS.find((name) => name === value?.toLowerCase())
  return level && (level.toUpperCase() as LogLineLevel)
}
