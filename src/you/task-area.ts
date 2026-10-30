import type { TaskView } from '../tasks/types.js'
import type { AreaPart, AreaRecord, TaskArea } from './types.js'

/**
 * Which of your areas a task is in, with nothing read from disk: the desktop
 * app's (areas.ts finds the areas) and the phone and iPad app's, from what
 * your Mac sends it.
 */

export const partKey = (part: Pick<AreaPart, 'kind' | 'id'>) =>
  `${part.kind}:${part.id.toLowerCase()}`

/** The parts of an area a task belongs to: its repository, channel, group */
export function taskParts(task: TaskView): AreaPart[] {
  const parts: AreaPart[] = []
  if (task.repo && /^[^/\s]+\/[^/\s]+$/.test(task.repo))
    parts.push({ kind: 'repo', id: task.repo.toLowerCase(), label: task.repo })
  if (task.source.app !== 'local' && task.source.label.startsWith('#'))
    parts.push({
      kind: 'channel',
      id: task.source.conversation,
      label: task.source.label,
    })
  if (task.group)
    parts.push({
      kind: 'group',
      id: task.group.toLowerCase(),
      label: task.group,
    })
  return parts
}

/** The area a task is in: by its repository, else its channel, else group */
export function taskArea(
  records: readonly AreaRecord[],
  task: Pick<TaskView, 'repo' | 'source' | 'group'>
): TaskArea | undefined {
  const keys = taskParts(task as TaskView).map(partKey)
  for (const key of keys) {
    const area = records.find(
      (record) => !record.left && record.parts.some((p) => partKey(p) === key)
    )
    if (area) return { id: area.id, name: area.name }
  }
  return undefined
}
