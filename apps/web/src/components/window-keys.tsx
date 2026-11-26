import { askNewTask } from '@/lib/new-task'
import { KEYS, useKeysWatch, useShortcut } from '@/lib/shortcuts'
import { useTasks } from '@/lib/tasks'

/**
 * The window's own shortcuts, from any screen (the sections' are the
 * sidebar's): back and forward through the screens you went to, New task and
 * New session. It renders nothing, so what it reads (your tasks) does not
 * render the window again.
 */
export function WindowKeys({
  onTasks,
  go,
}: {
  /** Todo is the screen shown */
  onTasks: boolean
  go: (hash: string) => void
}) {
  useKeysWatch()
  const todoOn = Boolean(useTasks().data?.settings.on)
  useShortcut(KEYS.back, () => window.history.back())
  useShortcut(KEYS.forward, () => window.history.forward())
  useShortcut(
    KEYS.newTask,
    () => {
      askNewTask()
      if (!onTasks) go('#/tasks')
    },
    { when: todoOn }
  )
  useShortcut(KEYS.newSession, () => go('#/sessions/new'), {
    when: Boolean(window.pacenoteDesktop?.sessions),
  })
  return null
}
