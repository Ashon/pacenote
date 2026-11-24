import { modelLabel } from '@src/sessions/live'
import { CLI_NAMES } from '@src/tasks/own-ai'
import { cn } from '@/lib/utils'
import { PacenoteMark } from './logo'
import { PaceSpinner } from './pace-spinner'
import { hasMark, ToolMark } from './tool-mark'

/**
 * Pace's mark where Pace does the work, with a small circle at its foot for
 * the tool it does it with (Claude Code, Codex, opencode), named with its model
 * on hover. A tool with no mark here gets no circle.
 */
export function PaceAvatar({
  engine,
  model,
  working,
  label,
  className,
}: {
  /** The tool: claude, codex, opencode */
  engine?: string
  /** Its model, as the tool names it */
  model?: string
  /**
   * The mark looks around while this is true and eases back into the logo
   * when it turns false (PaceSpinner); without it, the logo stays still
   */
  working?: boolean
  /** Names the tool to a screen reader, where nothing near it does */
  label?: boolean
  className?: string
}) {
  const tool = hasMark(engine) ? engine : undefined
  const name = tool
    ? [CLI_NAMES[tool], model && modelLabel(model)].filter(Boolean).join(' · ')
    : undefined
  return (
    <span
      className={cn('relative inline-flex size-7 shrink-0', className)}
      title={name}
    >
      {working === undefined ? (
        <PacenoteMark className="size-7" />
      ) : (
        <PaceSpinner active={working} />
      )}
      {tool && (
        <span
          data-engine={tool}
          {...(label ? { role: 'img', 'aria-label': name } : {})}
          className="absolute -right-1 -bottom-1 grid size-4 place-items-center rounded-full bg-foreground text-background ring-2 ring-card"
        >
          <ToolMark tool={tool} className="size-2.5" />
        </span>
      )}
    </span>
  )
}
