import type { MessengerId } from '../messengers/ids.js'
import { systemTimeZone } from '../messengers/text.js'

/**
 * Settings handled by the settings screen, each kept at its place in the
 * settings file (settings.json, ~/.pacenote outside the repository; see
 * settings-file.ts). Shared by the desktop app (save, validation) and the
 * screen (input form). Defaults must match the bot config (src/config.ts
 * EnvSchema) or the broker config (src/sandbox/env.ts).
 * (tests/settings.test.ts) Entries not listed here are hidden from the screen
 * and kept as is on save.
 */
/**
 * Settings screen sections, in navigation order. Each holds a few groups
 * (cards) of fields. The desktop app's own preferences (theme, autostart) are
 * not in the settings file and have a "general" section of their own on the
 * screen.
 */
export type SettingSection =
  'messengers' | 'answers' | 'sandbox' | 'ops' | 'tasks' | 'logs'

export const SETTING_SECTIONS: {
  id: SettingSection
  label: string
  help: string
}[] = [
  {
    id: 'messengers',
    label: 'Messengers',
    help: 'The chat apps Pace answers in, and who can ask there. Changes apply when Pace restarts.',
  },
  {
    id: 'answers',
    label: 'Answers',
    help: 'The CLI that writes answers and how requests are handled. Changes apply when Pace restarts.',
  },
  {
    id: 'sandbox',
    label: 'Sandbox',
    help: 'Where the reasoner CLI runs for each request. Allowed domains apply at once; everything else when Pace restarts.',
  },
  {
    id: 'ops',
    label: 'Ops tools',
    help: "Tools the reasoner can call through ops-broker. SSH keys, kubeconfig, and tokens stay in the broker's VM, never in the reasoner's. Changes apply when Pace restarts.",
  },
  {
    id: 'tasks',
    label: 'Todo',
    help: 'Your own tasks, gathered from Slack by your AI tools. Changes apply at once.',
  },
  {
    id: 'logs',
    label: 'History & logs',
    help: 'What Pace keeps after answering. Changes apply when Pace restarts.',
  },
]

export type SettingGroup =
  | 'slack'
  | 'access'
  | 'reasoner'
  | 'requests'
  | 'diagrams'
  | 'environment'
  | 'credentials'
  | 'ops'
  | 'files'
  | 'github'
  | 'jira'
  | 'k8s'
  | 'ssh'
  | 'tasks'
  | 'work'
  | 'history'
  | 'logs'

export interface SettingField {
  /**
   * The name Pace reads it by, as an environment variable that also overrides
   * the file. Never shown on the screen.
   */
  key: string
  /** Where it is kept in settings.json, dotted: "slack.botToken" */
  path: string
  /** Kept as a list in the file; a comma-separated value on the screen */
  list?: boolean
  group: SettingGroup
  label: string
  help?: string
  /** toggle is an on/off value. */
  type: 'secret' | 'text' | 'number' | 'select' | 'toggle'
  /**
   * Options with help are shown as a choice of cards instead of a drop-down.
   */
  options?: { value: string; label: string; help?: string }[]
  /** Value used when left empty. No default if absent */
  default?: string
  placeholder?: string
  /** Advanced fields are shown collapsed. */
  advanced?: boolean
  /** Value that cannot be empty */
  required?: boolean
  /**
   * What must be applied again after a change. Defaults to restarting the bot;
   * app: nothing, the value is read where it is used.
   */
  applies?: 'app'
  /**
   * Shown only while another field has this value, or one of these values
   * (e.g. sandbox limits only for the sandboxes). Hidden values stay in the
   * file.
   */
  shownWhen?: { key: string; equals: string | readonly string[] }
  /**
   * Saved and validated like any field but never shown as a row; the screen
   * sets it some other way (e.g. hub pairing)
   */
  internal?: boolean
}

export interface SettingGroupInfo {
  id: SettingGroup
  section: SettingSection
  /**
   * In the Messengers section: the chat app the group belongs to, shown under
   * that app's heading
   */
  messenger?: MessengerId
  label: string
  help: string
  /**
   * For an optional integration: the fields that must all be set for it to turn
   * on
   */
  requires?: string[]
}

export const SETTING_GROUPS: SettingGroupInfo[] = [
  {
    id: 'slack',
    section: 'messengers',
    messenger: 'slack',
    label: 'Connection',
    help: "How this desktop reaches Slack: through your team's hub, or a Slack app of your own.",
  },
  {
    id: 'access',
    section: 'messengers',
    messenger: 'slack',
    label: 'Who can ask',
    help: 'Only you. Pace runs on this Mac with your login, so anyone else who mentions it gets a note that only they see. With the team hub, each teammate pairs a Pace of their own.',
  },
  {
    id: 'reasoner',
    section: 'answers',
    label: 'Reasoner',
    help: 'The local CLI that writes answers.',
  },
  {
    id: 'requests',
    section: 'answers',
    label: 'Requests',
    help: 'How many mentions are answered at once and the context each one gets.',
  },
  {
    id: 'diagrams',
    section: 'answers',
    label: 'Diagrams and images',
    help: 'How diagrams and generated images in answers are uploaded.',
  },
  {
    id: 'environment',
    section: 'sandbox',
    label: 'Run environment',
    help: 'Where the reasoner CLI runs for each request.',
  },
  {
    id: 'credentials',
    section: 'sandbox',
    label: 'Reasoner login',
    help: 'Passed into the sandbox for the selected reasoner CLI. Your own CLI login on this Mac is not used there.',
  },
  {
    id: 'ops',
    section: 'ops',
    label: 'Ops tools',
    help: 'Turning them on or off applies when Pace restarts.',
  },
  {
    id: 'files',
    section: 'ops',
    label: 'Files',
    help: 'File tools read the work directory, and pull requests are made from repositories in it.',
    requires: ['OPS_FS_ROOT'],
  },
  {
    id: 'github',
    section: 'ops',
    label: 'GitHub and pull requests',
    help: 'GitHub queries and pull requests, limited to the orgs below. Pull requests also need the work directory.',
    requires: ['OPS_GIT_ALLOWED_OWNERS'],
  },
  {
    id: 'jira',
    section: 'ops',
    label: 'Jira',
    help: 'Issue queries, new issues, and comments in the allowed projects.',
    requires: [
      'OPS_JIRA_URL',
      'OPS_JIRA_EMAIL',
      'OPS_JIRA_TOKEN',
      'OPS_JIRA_PROJECTS',
    ],
  },
  {
    id: 'k8s',
    section: 'ops',
    label: 'Kubernetes',
    help: 'Read-only queries through a kubeconfig built for a read-only ServiceAccount.',
    requires: ['OPS_K8S_CONTEXTS'],
  },
  {
    id: 'ssh',
    section: 'ops',
    label: 'SSH hosts',
    help: 'Read-only checks on hosts in the allowed range.',
    requires: ['OPS_SSH_USER', 'OPS_SSH_ALLOWED_CIDR', 'OPS_SSH_KEY'],
  },
  {
    id: 'tasks',
    section: 'tasks',
    label: 'Gathering tasks',
    help: 'Collect now on the Todo screen has Claude Code read Slack with its own Slack connector, read only, and keeps what people asked of you and what you said you would do. Pacenote holds no Slack token for this.',
  },
  {
    id: 'work',
    section: 'tasks',
    label: 'Continuing work',
    help: 'A code task continues in Claude Code or Codex, opened in a terminal in its repository with the task and what came before it. The session runs as you, with your own permissions.',
  },
  {
    id: 'history',
    section: 'logs',
    label: 'Run history',
    help: 'Each request is recorded with its tool calls, replies, and outputs.',
  },
  {
    id: 'logs',
    section: 'logs',
    label: 'Logs',
    help: 'What Pace writes to its log.',
  },
]

/**
 * Settings route for a bot waiting for setup: the section of its first issue,
 * or Messengers when there is none (the Slack tokens are missing or Slack
 * rejected them).
 */
export function setupSettingsRoute(
  issues: readonly { key?: string }[] = []
): string {
  const section = issues
    .map((issue) => settingSectionOf(issue.key))
    .find(Boolean)
  return `#/settings/${section ?? 'messengers'}`
}

/** Section that holds a field, for jumping to a validation issue. */
export function settingSectionOf(
  key: string | undefined
): SettingSection | undefined {
  const group = SETTING_FIELDS.find((field) => field.key === key)?.group
  return SETTING_GROUPS.find((info) => info.id === group)?.section
}

export const SETTING_FIELDS: SettingField[] = [
  {
    key: 'SLACK_CONNECTION',
    path: 'slack.connection',
    group: 'slack',
    label: 'Connection',
    type: 'select',
    options: [
      {
        value: 'hub',
        label: 'Team hub',
        help: "Your team's hub server holds the Slack app. This desktop answers your own mentions through it, and keeps no Slack token.",
      },
      {
        value: 'app',
        label: 'Your own Slack app',
        help: 'Socket Mode with the app token and bot token of a Slack app you created. For using Pacenote on your own.',
      },
    ],
    default: 'app',
  },
  {
    key: 'HUB_URL',
    path: 'slack.hub.url',
    group: 'slack',
    label: 'Hub URL',
    help: "The address your team's hub admin gave you.",
    type: 'text',
    placeholder: 'https://pacenote-hub.example.com',
    shownWhen: { key: 'SLACK_CONNECTION', equals: 'hub' },
  },
  {
    key: 'HUB_TOKEN',
    path: 'slack.hub.token',
    group: 'slack',
    label: 'Hub token',
    help: 'Stored by pairing with the hub. The hub keeps only its hash.',
    type: 'secret',
    internal: true,
  },
  {
    key: 'SLACK_APP_TOKEN',
    path: 'slack.appToken',
    group: 'slack',
    label: 'App token',
    help: 'Basic Information > App-Level Tokens (connections:write). Used for the Socket Mode connection.',
    type: 'secret',
    placeholder: 'xapp-...',
    shownWhen: { key: 'SLACK_CONNECTION', equals: 'app' },
  },
  {
    key: 'SLACK_BOT_TOKEN',
    path: 'slack.botToken',
    group: 'slack',
    label: 'Bot token',
    help: 'OAuth & Permissions > Bot User OAuth Token',
    type: 'secret',
    placeholder: 'xoxb-...',
    shownWhen: { key: 'SLACK_CONNECTION', equals: 'app' },
  },
  {
    key: 'SOCKET_CLIENT_PING_TIMEOUT_MS',
    path: 'slack.clientPingTimeoutMs',
    group: 'slack',
    label: 'Client ping timeout (ms)',
    help: 'Reconnects if a ping sent by Pace gets no reply within this time. (1000 to 60000)',
    type: 'number',
    default: '5000',
    advanced: true,
    shownWhen: { key: 'SLACK_CONNECTION', equals: 'app' },
  },
  {
    key: 'SOCKET_SERVER_PING_TIMEOUT_MS',
    path: 'slack.serverPingTimeoutMs',
    group: 'slack',
    label: 'Server ping timeout (ms)',
    help: 'Reconnects if no ping arrives from Slack within this time. (5000 to 300000)',
    type: 'number',
    default: '30000',
    advanced: true,
    shownWhen: { key: 'SLACK_CONNECTION', equals: 'app' },
  },
  {
    key: 'MENTION_ALLOWED_USERS',
    path: 'slack.memberId',
    group: 'access',
    label: 'Your Slack member ID',
    help: 'Pace answers only you: it runs on this Mac with your login. In Slack, open your profile, click ⋮ and Copy member ID; setup fills it in when you say "@Pace it\'s me". Teammates each run their own Pace through your team\'s hub.',
    type: 'text',
    placeholder: 'U0123ABCD',
    shownWhen: { key: 'SLACK_CONNECTION', equals: 'app' },
  },
  {
    key: 'REASONER',
    path: 'answers.reasoner',
    group: 'reasoner',
    label: 'Reasoner CLI',
    type: 'select',
    options: [
      { value: 'claude', label: 'claude' },
      { value: 'codex', label: 'codex' },
    ],
    default: 'claude',
  },
  {
    key: 'REASONER_MODEL',
    path: 'answers.model',
    group: 'reasoner',
    label: 'Model',
    help: 'Leave empty to use claude-opus-5-5 for claude and the model in ~/.codex/config.toml for codex.',
    type: 'text',
  },
  {
    key: 'REASONER_TIMEOUT_SEC',
    path: 'answers.timeoutSec',
    group: 'reasoner',
    label: 'Timeout (seconds)',
    type: 'number',
    default: '900',
  },
  {
    key: 'MENTION_CONCURRENCY',
    path: 'answers.concurrency',
    group: 'requests',
    label: 'Concurrent requests',
    type: 'number',
    default: '2',
  },
  {
    key: 'TIMEZONE',
    path: 'answers.timeZone',
    group: 'requests',
    label: 'Time zone',
    help: "Used to show times in thread context. Left empty, it is this Mac's time zone.",
    type: 'text',
    default: systemTimeZone(),
  },
  {
    key: 'MENTION_WORKSPACE',
    path: 'answers.referenceDir',
    group: 'requests',
    label: 'Reference directory',
    help: 'Absolute path consulted read-only when answering. Used only in run environments that can read files.',
    type: 'text',
    advanced: true,
  },
  {
    key: 'RENDER_DIAGRAMS',
    path: 'answers.diagrams',
    group: 'diagrams',
    label: 'Render diagrams',
    help: 'Renders mermaid, dot, vega-lite, and svg blocks in answers as PNG and uploads them, in a VM of the built-in sandbox (set it up in Settings > Sandbox, even with Pace on this Mac). Until it is set up, they stay as text.',
    type: 'toggle',
    default: 'on',
  },
  {
    key: 'GENERATED_IMAGE_MAX_PX',
    path: 'answers.imageMaxPx',
    group: 'diagrams',
    label: 'Generated image max size (px)',
    help: 'Shrinks the long side to this size before uploading. 0 keeps the original size.',
    type: 'number',
    default: '512',
  },
  {
    key: 'REASONER_SANDBOX',
    path: 'sandbox.runIn',
    group: 'environment',
    label: 'Run environment',
    type: 'select',
    options: [
      {
        value: 'none',
        label: 'On this Mac',
        help: 'The CLI runs directly with your own login. Quick to set up, but nothing isolates it from this Mac.',
      },
      {
        value: 'vm',
        label: 'Built-in sandbox',
        help: 'A lightweight Linux VM for each request, built into Pacenote: nothing else to install. It has only the login set below, and its only way out leads to the allowed domains. Needs Apple silicon and macOS 15 or later.',
      },
    ],
    default: 'none',
  },
  {
    key: 'SANDBOX_MEMORY',
    path: 'sandbox.memory',
    group: 'environment',
    label: 'Memory limit',
    help: 'For each request, such as 2g or 1536m',
    type: 'text',
    default: '2g',
    shownWhen: { key: 'REASONER_SANDBOX', equals: 'vm' },
  },
  {
    key: 'SANDBOX_CPUS',
    path: 'sandbox.cpus',
    group: 'environment',
    label: 'CPU limit',
    type: 'text',
    default: '2',
    shownWhen: { key: 'REASONER_SANDBOX', equals: 'vm' },
  },
  {
    key: 'SANDBOX_CLAUDE_OAUTH_TOKEN',
    path: 'sandbox.claudeToken',
    group: 'credentials',
    label: 'claude token',
    help: 'Required to use claude in the sandbox. (claude setup-token)',
    type: 'secret',
    shownWhen: { key: 'REASONER', equals: 'claude' },
  },
  {
    key: 'SANDBOX_ANTHROPIC_API_KEY',
    path: 'sandbox.anthropicApiKey',
    group: 'credentials',
    label: 'Anthropic API key',
    help: 'For using an API key instead of the claude token',
    type: 'secret',
    advanced: true,
    shownWhen: { key: 'REASONER', equals: 'claude' },
  },
  {
    key: 'SANDBOX_CODEX_AUTH_FILE',
    path: 'sandbox.codexLoginFile',
    group: 'credentials',
    label: 'codex login file',
    help: 'Copied into the VM when using codex in the sandbox.',
    type: 'text',
    default: '~/.codex/auth.json',
    shownWhen: { key: 'REASONER', equals: 'codex' },
  },
  {
    key: 'OPS_TOOLS',
    path: 'ops.enabled',
    group: 'ops',
    label: 'Enable ops tools',
    help: 'Offers the integrations below to the reasoner. Each one stays off until its fields are filled in.',
    type: 'toggle',
    default: 'off',
  },
  {
    key: 'OPS_FS_ROOT',
    path: 'ops.workDir',
    group: 'files',
    label: 'Work directory',
    help: 'Work directory to mount read-only (absolute path). Leave empty to turn off the file and PR tools.',
    type: 'text',
    placeholder: '/Users/me/workspaces',
  },
  {
    key: 'OPS_GIT_ALLOWED_OWNERS',
    path: 'ops.github.owners',
    list: true,
    group: 'github',
    label: 'Allowed GitHub orgs',
    help: 'Limits PR creation and GitHub queries to repositories of these orgs (or users). Comma-separated. Leave empty to turn off the GitHub tools.',
    type: 'text',
    placeholder: 'my-org, my-user',
  },
  {
    key: 'OPS_GIT_AUTHOR_NAME',
    path: 'ops.github.authorName',
    group: 'github',
    label: 'PR commit author name',
    help: "Author of commits the sandbox makes. Leave empty to use the global git config (git config --global user.name). Separate from this repository's git config.",
    type: 'text',
  },
  {
    key: 'OPS_GIT_AUTHOR_EMAIL',
    path: 'ops.github.authorEmail',
    group: 'github',
    label: 'PR commit author email',
    help: 'Leave empty to use the global git config (git config --global user.email).',
    type: 'text',
  },
  {
    key: 'OPS_JIRA_URL',
    path: 'ops.jira.url',
    group: 'jira',
    label: 'Jira URL',
    help: 'Jira Cloud site URL. The Jira tools turn on only when the URL, email, token, and projects are all set.',
    type: 'text',
    placeholder: 'https://your-site.atlassian.net',
  },
  {
    key: 'OPS_JIRA_EMAIL',
    path: 'ops.jira.email',
    group: 'jira',
    label: 'Jira account email',
    help: 'Atlassian account that owns the API token. Issues and comments are posted as this account.',
    type: 'text',
  },
  {
    key: 'OPS_JIRA_TOKEN',
    path: 'ops.jira.token',
    group: 'jira',
    label: 'Jira API token',
    help: "Create it under Security > API tokens at id.atlassian.com. Passed only to the broker's VM.",
    type: 'secret',
  },
  {
    key: 'OPS_JIRA_PROJECTS',
    path: 'ops.jira.projects',
    list: true,
    group: 'jira',
    label: 'Allowed Jira projects',
    help: 'Limits queries, creation, and comments to these projects. Comma-separated project keys',
    type: 'text',
    placeholder: 'PROJ, OPS',
  },
  {
    key: 'OPS_K8S_CONTEXTS',
    path: 'ops.kubernetes.contexts',
    list: true,
    group: 'k8s',
    label: 'k8s contexts',
    help: 'Local kubeconfig contexts to build the read-only kubeconfig from. Comma-separated. Rebuild the kubeconfig after changing them.',
    type: 'text',
  },
  {
    key: 'OPS_K8S_SA',
    path: 'ops.kubernetes.serviceAccount',
    group: 'k8s',
    label: 'k8s read-only account',
    help: 'Read-only ServiceAccount in each cluster (sandbox/k8s/pacenote-ro.yaml)',
    type: 'text',
    default: 'pacenote-ro',
    advanced: true,
  },
  {
    key: 'OPS_K8S_SA_NAMESPACE',
    path: 'ops.kubernetes.namespace',
    group: 'k8s',
    label: 'k8s read-only account namespace',
    type: 'text',
    default: 'pacenote',
    advanced: true,
  },
  {
    key: 'OPS_SSH_USER',
    path: 'ops.ssh.user',
    group: 'ssh',
    label: 'SSH user',
    help: 'Account used for host checks. Host checks turn on only when the user, allowed range, and key are all set.',
    type: 'text',
  },
  {
    key: 'OPS_SSH_ALLOWED_CIDR',
    path: 'ops.ssh.allowedRange',
    group: 'ssh',
    label: 'Allowed SSH range',
    help: 'Only hosts in this range are checked over SSH.',
    type: 'text',
    placeholder: '192.168.10.0/24',
  },
  {
    key: 'OPS_SSH_KEY',
    path: 'ops.ssh.key',
    group: 'ssh',
    label: 'SSH key path',
    help: "Absolute path. The key is shared only into the broker's VM.",
    type: 'text',
    placeholder: '/Users/me/.ssh/id_ed25519',
  },
  {
    key: 'OPS_SSH_KNOWN_HOSTS',
    path: 'ops.ssh.knownHosts',
    group: 'ssh',
    label: 'SSH known_hosts path',
    help: 'Absolute path. Leave empty to remember host keys from the first connection only inside the broker.',
    type: 'text',
    advanced: true,
  },
  {
    key: 'OPS_SSH_INVENTORY_DIR',
    path: 'ops.ssh.inventoryDir',
    group: 'ssh',
    label: 'Inventory directory',
    help: 'Location of the ansible project used to build the host list. Relative paths are relative to this repository. Leave empty to write ~/.pacenote/ops-broker/hosts.json directly.',
    type: 'text',
    advanced: true,
  },
  {
    key: 'OPS_SSH_INVENTORY',
    path: 'ops.ssh.inventory',
    group: 'ssh',
    label: 'Inventory file',
    help: 'Relative path inside the inventory directory',
    type: 'text',
    placeholder: 'inventory.ini',
    advanced: true,
  },
  {
    key: 'HISTORY',
    path: 'history.enabled',
    group: 'history',
    label: 'Record runs',
    type: 'toggle',
    default: 'on',
  },
  {
    key: 'HISTORY_RETENTION_DAYS',
    path: 'history.retentionDays',
    group: 'history',
    label: 'History retention (days)',
    help: 'Set to 0 to never delete.',
    type: 'number',
    default: '30',
  },
  {
    key: 'HISTORY_SHARE',
    path: 'history.shareWithAiTools',
    group: 'history',
    label: 'Share with AI tools',
    help: "Lets AI tools on this Mac, such as Claude Code or Codex, read the run history through Pacenote's MCP server, read-only. Applies right away.",
    type: 'toggle',
    default: 'off',
    applies: 'app',
  },
  {
    key: 'TASKS',
    path: 'tasks.enabled',
    group: 'tasks',
    label: 'Gather my tasks from Slack',
    help: "Off by default. Turns on Collect now on the Todo screen, and the task tools of Pacenote's MCP server for the AI tools you add it to below, whether or not the run history is shared.",
    type: 'toggle',
    default: 'off',
    applies: 'app',
  },
  {
    key: 'TASKS_DMS',
    path: 'tasks.dms',
    group: 'tasks',
    label: 'Count DMs and group DMs',
    help: 'Off: AI tools are told to leave DMs out, and tasks from them are not added.',
    type: 'toggle',
    default: 'off',
    applies: 'app',
    shownWhen: { key: 'TASKS', equals: 'on' },
  },
  {
    key: 'TASKS_EXCLUDE_CHANNELS',
    path: 'tasks.leaveOutChannels',
    list: true,
    group: 'tasks',
    label: 'Leave out channels',
    help: 'Comma-separated channel names or IDs.',
    type: 'text',
    placeholder: '#random, #social',
    applies: 'app',
    shownWhen: { key: 'TASKS', equals: 'on' },
  },
  {
    key: 'TASKS_NAMES',
    path: 'tasks.yourNames',
    list: true,
    group: 'tasks',
    label: 'Other names people call you',
    help: 'Besides your Slack names: a nickname, or your name in another language. A request that calls you by one is yours, @mention or not.',
    type: 'text',
    placeholder: 'Ash, Ashy',
    applies: 'app',
    shownWhen: { key: 'TASKS', equals: 'on' },
  },
  {
    key: 'TASKS_GROUPS',
    path: 'tasks.yourGroups',
    list: true,
    group: 'tasks',
    label: 'Groups that mean you',
    help: 'Slack user groups whose mention asks you, such as an on-call group. The first time a Maybe comes from another group, Todo asks whether it means you.',
    type: 'text',
    placeholder: '@infra-oncall',
    applies: 'app',
    shownWhen: { key: 'TASKS', equals: 'on' },
  },
  {
    key: 'TASKS_CLI',
    path: 'tasks.openIn',
    group: 'work',
    label: 'Open code tasks in',
    help: 'The button on a code task opens a session here, with the task.',
    type: 'select',
    options: [
      { value: 'claude', label: 'Claude Code' },
      { value: 'codex', label: 'Codex' },
    ],
    default: 'claude',
    applies: 'app',
    shownWhen: { key: 'TASKS', equals: 'on' },
  },
  {
    key: 'TASKS_TERMINAL',
    path: 'tasks.terminal',
    group: 'work',
    label: 'Terminal',
    help: 'Where the session opens. Automatic picks the terminal you have open, else the one you used last.',
    type: 'select',
    options: [
      { value: 'auto', label: 'Automatic' },
      { value: 'terminal', label: 'Terminal' },
      { value: 'iterm', label: 'iTerm2' },
      { value: 'ghostty', label: 'Ghostty' },
    ],
    default: 'auto',
    applies: 'app',
    shownWhen: { key: 'TASKS', equals: 'on' },
  },
  {
    key: 'TASKS_PLAN_FIRST',
    path: 'tasks.planFirst',
    group: 'work',
    label: 'Start with a plan',
    help: 'The session sums up the task and its plan, then waits for you before it changes anything.',
    type: 'toggle',
    default: 'on',
    applies: 'app',
    shownWhen: { key: 'TASKS', equals: 'on' },
  },
  {
    key: 'TASKS_LINK_SESSIONS',
    path: 'tasks.linkSessions',
    group: 'work',
    label: 'Show sessions you start yourself',
    help: "Adds the Claude Code and Codex sessions you start yourself to a task's work log: ones that used Pacenote's task tools for it, had its Slack link in what you typed, or worked on its branch. Ones that only look related are suggested for you to link. Their logs are read on this Mac, and nothing from them leaves it.",
    type: 'toggle',
    default: 'off',
    applies: 'app',
    shownWhen: { key: 'TASKS', equals: 'on' },
  },
  {
    key: 'TASKS_SUGGEST_DONE',
    path: 'tasks.suggestDone',
    group: 'work',
    label: 'Say when a task looks done',
    help: "When a task's latest session has been quiet for 10 minutes, Claude Code reads its last turns, with no tools, and the state of its pull request, and says on the task whether it looks done, how it ended and what is left. You close it or not. It uses your Claude Code login.",
    type: 'toggle',
    default: 'off',
    applies: 'app',
    shownWhen: { key: 'TASKS', equals: 'on' },
  },
  {
    key: 'LOG_LEVEL',
    path: 'logs.level',
    group: 'logs',
    label: 'Log level',
    help: 'At debug, detailed Socket Mode client logs are also written.',
    type: 'select',
    options: ['debug', 'info', 'warn', 'error'].map((value) => ({
      value,
      label: value,
    })),
    default: 'info',
  },
  {
    key: 'SOCKET_PING_PONG_LOG',
    path: 'logs.pingPong',
    group: 'logs',
    label: 'Ping/pong log',
    help: 'Logs keepalive signals. Visible when the log level is debug.',
    type: 'toggle',
    default: 'off',
    advanced: true,
  },
]

/** null clears the value in the file so the default applies again. */
export type SettingsChanges = Record<string, string | null>

export interface SettingsView {
  /** The settings file */
  file: string
  exists: boolean
  /** Why the file could not be read, when it could not */
  problem?: string
  dataDir: string
  /** Current values of non-secret fields (empty string if not in the file) */
  values: Record<string, string>
  /** For secrets, only whether they are set and the last 4 characters */
  secrets: Record<string, { set: boolean; hint?: string }>
  /**
   * Fields set in the app's environment variables, which take precedence over
   * the file
   */
  overridden: string[]
}

export interface SettingsIssue {
  key?: string
  message: string
}

/**
 * The CLIs' own login variables, which may be in the environment Pacenote runs
 * in
 */
const CLI_SECRETS = [
  'ANTHROPIC_API_KEY',
  'CLAUDE_CODE_OAUTH_TOKEN',
  'OPENAI_API_KEY',
  'CODEX_API_KEY',
]

/** Pacenote's secret settings (Slack and hub tokens, logins, Jira token) */
export const SECRET_SETTINGS = SETTING_FIELDS.filter(
  (field) => field.type === 'secret'
).map((field) => field.key)

/** Whether a setting holds a secret: Pacenote's own, or a CLI's login */
export function isSecretKey(key: string): boolean {
  return SECRET_SETTINGS.includes(key) || CLI_SECRETS.includes(key)
}

/**
 * The secret values in an environment: Pacenote's secret settings and the CLIs'
 * login variables. Answers are redacted of them before they are posted.
 */
export function secretValues(
  env: Record<string, string | undefined>
): string[] {
  return [...SECRET_SETTINGS, ...CLI_SECRETS].flatMap((key) => {
    const value = env[key]?.trim()
    return value ? [value] : []
  })
}

export function maskSecret(value: string): string {
  const prefix =
    /^(xox[a-z]-|xapp-|sk-ant-[a-z0-9]+-|sk-)/i.exec(value)?.[0] ?? ''
  return `${prefix}...${value.slice(-4)}`
}

/** Whether a field's shownWhen holds for this value of the field it names */
export function shownFor(
  shownWhen: NonNullable<SettingField['shownWhen']>,
  value: string
): boolean {
  return typeof shownWhen.equals === 'string'
    ? value === shownWhen.equals
    : shownWhen.equals.includes(value)
}
