/**
 * The app's public face to the phone and iPad app (Ashon/pacenote-mobile),
 * which keeps this repository as its `pacenote` submodule and draws itself
 * from here: its vite config points `@` at this src and `@src` at the Mac's
 * own code, so `@/shared` is what it takes and nothing else. What is not
 * listed here the app leaves alone: the Mac may move, rename and redraw it,
 * and the app takes the next commit of the submodule as it is.
 *
 * A change here takes something the app uses: keep its name working here, or
 * bring the app's side along (a change both need goes to this repository
 * first, then to the submodule's commit). A screen or helper the app comes to
 * need: it joins the right section below, and the app imports it from here.
 */

// The Mac's own screens, which a phone and an iPad draw as the Mac does, each
// asking the Mac for what it shows (the app's bridge.ts answers the calls
// these make to window.pacenoteDesktop, with src/macs/asks.ts on the Mac)
export { BotPage } from './components/bot-page'
export { Overview } from './components/overview'
export { RecapPage } from './components/recap-page'
export { RunDetail } from './components/run-detail'
export { RunList } from './components/run-list'
export { SettingsPage } from './components/settings-page'
export { YouPage } from './components/you-page'
export { PacenoteMark } from './components/logo'

// The screens' words, in English and Korean, where the app's own screens say
// the same things; `localized` and `useText` below take them as they are
export { text as firstRunText } from './components/setup/first-run.text'
export { text as partsText } from './components/setup/parts.text'
export { text as recapPageText } from './components/recap-page.text'
export { text as runListText } from './components/run-list.text'
export { text as settingsPageText } from './components/settings-page.text'
export { text as sidebarText } from './components/sidebar.text'
export { text as taskRowText } from './components/task-row.text'
export { text as tasksPageText } from './components/tasks-page.text'
export { text as todayText } from './components/today.text'

// The primitives the Mac's screens are built with, so a control on the device
// is the control on the Mac; the motion ones are its one language for a
// screen giving way to the next, a row settling out, a pill sliding to the
// tab chosen (their patterns are in motion.css)
export { Button } from './components/ui/button'
export {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from './components/ui/collapsible'
export {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from './components/ui/dropdown-menu'
export { Input } from './components/ui/input'
export {
  Placeholder,
  Swap,
  motionItem,
  useIndicator,
  useListMotion,
  usePresence,
} from './components/ui/motion'
export type { ListEntry } from './components/ui/motion'
export { TooltipProvider } from './components/ui/tooltip'

// The app's own helpers: class names, the hash route, the Mac's dates and
// numbers, its Today lines, this device's theme, the language the screens
// speak, and Pace's state as the Mac tells it
export { LanguageProvider, useLanguage, useLocale, useText } from './lib/i18n'
export {
  daysAgo,
  formatClock,
  formatDayGroup,
  formatRelative,
} from './lib/format'
export { daysSince, todayLines } from './lib/today'
export type { TodayLine } from './lib/today'
export { recapText, type CopyFormat } from './lib/recap'
export { ThemeProvider, useTheme } from './lib/theme'
export type { ThemeMode } from './lib/theme'
export { useSupervisor } from './lib/desktop'
export { cn, go } from './lib/utils'

// The Mac's own code the device speaks with: what people asked and what they
// said they would do, as the Mac lists it (the same buildView the Mac's Todo
// runs), where a task stands, which area it falls in, the settings the Mac's
// Settings screen holds, and the device's side of the channel — these hold no
// file access, so they run on the device as they do on the Mac
export { buildView, viewOf } from '@src/tasks/view'
export { RECENT_SESSION_MS, cleanStages, stageOf } from '@src/tasks/stage'
export type { StageRecord, TaskStage } from '@src/tasks/stage'
export {
  ADDED_BY_YOU,
  LOCAL,
  SOURCES,
  sourceOf,
  sourceNames,
} from '@src/tasks/sources'
export type { MessageRef, Source } from '@src/tasks/sources'
export { CLI_NAMES, OWN_CLIS, isOwnCli } from '@src/tasks/own-ai'
export type { OwnCli } from '@src/tasks/own-ai'
export type {
  DismissReason,
  Task,
  TaskActivity,
  TaskDecision,
  TaskField,
  TaskKind,
  TaskSource,
  TaskStatus,
  TaskUpdate,
  TaskView,
  TasksFile,
  TasksView,
  WorkEntry,
  WorkTool,
} from '@src/tasks/types'
export { taskArea } from '@src/you/task-area'
// The run history's kinds and states, which the phone filters its run list by
export type { RunKind, RunStatus } from '@history/types'
export type {
  AreaView,
  RecapPeriod,
  RecapView,
  TaskArea,
  YouView,
} from '@src/you/types'
export {
  SETTING_FIELDS,
  SETTING_GROUPS,
  SETTING_SECTIONS,
  settingSections,
} from '@src/settings/fields'
export type { SettingField, SettingSection } from '@src/settings/fields'

// The channel as the Mac keeps it (src/macs/channel.ts on the wire): the asks
// a device may make, which are these and no others, and the answer it gets
export {
  API_ASK,
  DEVICE_ASKS,
  DEVICE_CHANGES,
  DEVICE_READS,
  argsFromDevice,
  isDeviceAsk,
  valueForDevice,
} from '@src/macs/asks'
export type { AskMessage, AnswerMessage, DeviceAsk } from '@src/macs/asks'

// Both languages, as the app follows the device's own
export {
  LOCALES,
  LOCALE_NAMES,
  LOCALE_TAGS,
  getLocale,
  isLocale,
  localized,
  pickLocale,
  setLocale,
} from '@src/i18n/locale'
export type { Locale } from '@src/i18n/locale'
export { josa } from '@src/i18n/korean'
