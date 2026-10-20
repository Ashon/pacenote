import { createHash } from 'node:crypto'
import { existsSync, statSync } from 'node:fs'
import { homedir } from 'node:os'
import path from 'node:path'
import { z } from 'zod'
import { isSecureOrLocalUrl, slackApiBase } from './messengers/slack/api.js'
import { isTimeZone, systemTimeZone } from './messengers/text.js'
import { defaultHome } from './settings/home.js'
import { hostDeniedReads } from './reasoners/reads.js'
import { readCodexDefaults } from './reasoners/codex.js'
import { REASONER_IDS, type ReasonerId } from './reasoners/ids.js'
import { OWN_CLIS } from './tasks/own-ai.js'
import type {
  McpServerRef,
  ReasonerAuth,
  ReasonerOptions,
} from './reasoners/types.js'
import {
  defaultSandboxDir,
  defaultVmBin,
  memoryMiB,
  type VmSandboxOptions,
} from './sandbox/vm.js'
import {
  VM_BROKER_IMAGE,
  VM_IMAGE,
  VM_RENDERER_IMAGE,
} from './sandbox/vm-images.js'
import { REQUIRED_DOMAINS } from './sandbox/allowlist.js'
import { loginDir, signedIn } from './sandbox/vm-login.js'
import { allowlistPath, pacenoteHome, vmRootPath } from './settings/paths.js'
import { settingName } from './settings/settings-file.js'

const DEFAULT_CLAUDE_MODEL = 'claude-opus-5-5'
/** Pace's own tools in a reasoner VM, through the run's door (vm-broker.ts) */
const OWN_TOOLS_URL = 'http://127.0.0.1:8080/pace/mcp'

/**
 * REASONER_SANDBOX as Pace reads it: docker, the sandbox Pacenote had before
 * the built-in one, means the built-in one now. (Moving an earlier version's
 * .env into settings.json rewrites it.)
 */
export function sandboxSetting(value: unknown): unknown {
  return value === 'docker' ? 'vm' : value
}

const csv = z
  .string()
  .optional()
  .transform((value) =>
    (value ?? '')
      .split(',')
      .map((item) => item.trim())
      .filter(Boolean)
  )

/** Comma-separated list of Slack user IDs. (U..., W...) */
const userIds = csv.pipe(
  z.array(
    z
      .string()
      .transform((id) => id.toUpperCase())
      .pipe(
        z
          .string()
          .regex(/^[UW][A-Z0-9]+$/, 'Must be a Slack user ID (U... or W...)')
      )
  )
)

export const EnvSchema = z.object({
  /**
   * How this bot reaches Slack. app: its own Slack app over Socket Mode
   * (SLACK_BOT_TOKEN, SLACK_APP_TOKEN). hub: the team hub, which holds the
   * Slack app; this desktop answers its member's mentions through it (HUB_URL,
   * HUB_TOKEN).
   */
  SLACK_CONNECTION: z.enum(['app', 'hub']).default('app'),
  SLACK_BOT_TOKEN: z
    .string()
    .startsWith('xoxb-', 'Must be a bot token starting with xoxb-')
    .optional(),
  SLACK_APP_TOKEN: z
    .string()
    .startsWith('xapp-', 'Must be an app token starting with xapp-')
    .optional(),
  /**
   * Slack's Web API base for your own app. Defaults to slack.com; GovSlack, or
   * a local stand-in for tests
   */
  SLACK_API_URL: z
    .string()
    .url()
    .refine(
      isSecureOrLocalUrl,
      'Must be an https URL (http only for localhost)'
    )
    .optional(),
  /**
   * The team hub (docs/team-hub.md). https, or http only for a hub on this
   * computer
   */
  HUB_URL: z
    .string()
    .url()
    .refine(
      isSecureOrLocalUrl,
      'Must be an https URL (http only for localhost)'
    )
    .optional(),
  /**
   * This desktop's token for the hub, set by pairing in Settings > Messengers >
   * Slack
   */
  HUB_TOKEN: z
    .string()
    .regex(
      /^[0-9a-f]{64}$/,
      'Must be the token pairing stored (64 hex characters)'
    )
    .optional(),
  /**
   * Reconnects if no pong arrives within this time after the bot sends a ping.
   */
  SOCKET_CLIENT_PING_TIMEOUT_MS: z.coerce
    .number()
    .int()
    .min(1000)
    .max(60_000)
    .default(5000),
  /** Reconnects if the Slack server sends no ping for this long. */
  SOCKET_SERVER_PING_TIMEOUT_MS: z.coerce
    .number()
    .int()
    .min(5000)
    .max(300_000)
    .default(30_000),
  /** Logs ping/pong. (Visible when LOG_LEVEL=debug) */
  SOCKET_PING_PONG_LOG: z.enum(['on', 'off']).default('off'),
  /** Times in thread context are shown in it; this Mac's time zone if unset */
  TIMEZONE: z
    .string()
    .refine(isTimeZone, 'Must be a time zone name, such as Asia/Seoul or UTC')
    .default(systemTimeZone),

  /**
   * You: the one Slack member Pace answers through your own Slack app. Pace
   * runs on your Mac with your login, so it answers only you; teammates each
   * run their own Pace through the team hub, which sends a desktop only its
   * member's mentions. The name is from when it took a list.
   */
  MENTION_ALLOWED_USERS: userIds,
  MENTION_WORKSPACE: z.string().optional(),
  MENTION_CONCURRENCY: z.coerce.number().int().positive().default(2),

  REASONER: z.enum(REASONER_IDS).default('claude'),
  REASONER_MODEL: z.string().optional(),
  REASONER_TIMEOUT_SEC: z.coerce.number().int().positive().default(900),
  CLAUDE_BIN: z.string().default('claude'),
  CODEX_BIN: z.string().default('codex'),
  /** opencode on this Mac, for Pacenote's own work (the desktop app) */
  OPENCODE_BIN: z.string().default('opencode'),
  REASONER_SANDBOX: z.preprocess(
    sandboxSetting,
    z.enum(['none', 'vm']).default('none')
  ),
  SANDBOX_MEMORY: z
    .string()
    .regex(/^\d+(\.\d+)?[bkmg]?$/i, 'Must be a size such as 2g or 1536m')
    .default('2g'),
  SANDBOX_CPUS: z
    .string()
    .regex(/^\d+(\.\d+)?$/, 'Must be a CPU count (e.g. 2, 1.5)')
    .default('2'),
  SANDBOX_CLAUDE_OAUTH_TOKEN: z.string().optional(),
  SANDBOX_ANTHROPIC_API_KEY: z.string().optional(),

  OPS_TOOLS: z.enum(['off', 'on']).default('off'),

  RENDER_DIAGRAMS: z.enum(['on', 'off']).default('on'),
  /** Max px of a generated image's long side. 0 keeps the original size */
  GENERATED_IMAGE_MAX_PX: z.coerce.number().int().min(0).max(4096).default(512),

  /**
   * Where run history, bot status, and logs live. The desktop app reads it.
   * Defaults to the home (~/.pacenote)
   */
  PACENOTE_DATA_DIR: z.string().optional(),
  /** Run history (PACENOTE_DATA_DIR/runs) */
  HISTORY: z.enum(['on', 'off']).default('on'),
  /** Deletes history older than this many days. 0 keeps everything. */
  HISTORY_RETENTION_DAYS: z.coerce.number().int().min(0).default(30),
  /**
   * Lets AI tools on this Mac read the run history through Pacenote's MCP
   * server (src/tools/history-mcp.ts). The bot does not use it.
   */
  HISTORY_SHARE: z.enum(['on', 'off']).default('off'),

  /**
   * Your own tasks (src/tasks): AI tools with a Slack connector add them
   * through Pacenote's MCP server, which reads these on each call. The bot
   * does not use them.
   */
  TASKS: z.enum(['on', 'off']).default('off'),
  /** DMs and group DMs count for tasks */
  TASKS_DMS: z.enum(['on', 'off']).default('off'),
  /** Channels tasks leave out, by name (#random) or ID */
  TASKS_EXCLUDE_CHANNELS: z.string().optional(),
  /** Other names people call you, and the user groups that mean you */
  TASKS_NAMES: z.string().optional(),
  TASKS_GROUPS: z.string().optional(),
  /**
   * Continuing a task (the desktop app): where code tasks open, in which
   * terminal, whether the session starts with a plan, whether sessions
   * you start yourself are looked for, and whether a quiet session is read
   * for whether its task looks done
   */
  TASKS_CLI: z.enum(['claude', 'codex']).default('claude'),
  TASKS_TERMINAL: z
    .enum(['auto', 'terminal', 'iterm', 'ghostty'])
    .default('auto'),
  TASKS_PLAN_FIRST: z.enum(['on', 'off']).default('on'),
  TASKS_LINK_SESSIONS: z.enum(['on', 'off']).default('off'),
  TASKS_SUGGEST_DONE: z.enum(['on', 'off']).default('off'),
  /**
   * Pacenote's own work on this Mac (the desktop app): the CLI that collects,
   * judges, writes recaps up and drafts replies, and whether the other one
   * takes over when it cannot
   */
  TASKS_AI: z.enum(OWN_CLIS).default('claude'),
  TASKS_AI_FALLBACK: z.enum(['on', 'off']).default('on'),
  /** opencode's provider/model for it; empty: opencode's own default */
  TASKS_AI_OPENCODE_MODEL: z.string().optional(),

  LOG_LEVEL: z.enum(['debug', 'info', 'warn', 'error']).default('info'),
})

export interface Config {
  slack:
    | {
        kind: 'app'
        botToken: string
        appToken: string
        /** Web API base, with a trailing slash */
        apiUrl: string
        socket: {
          clientPingTimeoutMs: number
          serverPingTimeoutMs: number
          pingPongLogging: boolean
        }
      }
    | {
        kind: 'hub'
        /** Without a trailing slash */
        hubUrl: string
        hubToken: string
      }
  timezone: string
  mention: {
    /**
     * The one person Pace answers: you, with your own Slack app. With the team
     * hub it is the member the hub names once connected, so it is not here.
     */
    owner?: string
    /** Directory to consult read-only when answering */
    workspace?: string
    /** Number of CLIs to run concurrently */
    concurrency: number
  }
  /**
   * The reasoner CLI (src/reasoners) and where it runs (src/sandbox). If empty,
   * codex uses the model from ~/.codex/config.toml.
   */
  reasoner: ReasonerOptions & {
    /**
     * MCP servers to attach to the reasoner CLI. With OPS_TOOLS=on, ops-broker
     * (SSH host checks, k8s, file lookup)
     */
    mcpServers: McpServerRef[]
    /** Binary paths for running on the host (CLAUDE_BIN, CODEX_BIN) */
    commands: Record<ReasonerId, string>
    /** If set, runs the CLI in a lightweight VM of its own (sandbox/vm.ts). */
    vm?: VmSandboxOptions
  }
  /**
   * Renders mermaid/dot/vega-lite/svg blocks in answers to PNG and uploads
   * them, in a VM of the built-in sandbox (render/diagrams.ts)
   */
  render: {
    enabled: boolean
    /**
     * Turned on by name (RENDER_DIAGRAMS=on). Left unset it is on too, but a
     * sandbox not set up for it is a limit rather than a problem.
     */
    asked: boolean
    /** pacenote-vm, its folder and the renderer's image */
    vm: { bin: string; root: string; image: string }
    /**
     * Shrinks a generated image's long side to this size before upload. 0 keeps
     * the original
     */
    generatedMaxPx: number
  }
  /**
   * Directory for run history, bot status (bot.json), and logs (logs/bot.log)
   */
  dataDir: string
  /** Run history. undefined when off */
  history?: {
    retentionDays: number
  }
  logLevel: 'debug' | 'info' | 'warn' | 'error'
}

/** Treats entries left empty, like "KEY=", as unset. */
const providedValues = (env: NodeJS.ProcessEnv) =>
  Object.fromEntries(
    Object.entries(env).filter(
      ([, value]) => value !== undefined && value.trim() !== ''
    )
  )

/**
 * Values a bot restart does not need: the data location, which the desktop app
 * passes as an absolute path when launching the bot, and sharing the history
 * and the tasks settings, which the MCP server and the app read where used.
 */
const OUTSIDE_FINGERPRINT = new Set([
  'PACENOTE_DATA_DIR',
  'HISTORY_SHARE',
  'TASKS',
  'TASKS_DMS',
  'TASKS_EXCLUDE_CHANNELS',
  'TASKS_NAMES',
  'TASKS_GROUPS',
  'TASKS_CLI',
  'TASKS_TERMINAL',
  'TASKS_PLAN_FIRST',
  'TASKS_LINK_SESSIONS',
  'TASKS_SUGGEST_DONE',
  'TASKS_AI',
  'TASKS_AI_FALLBACK',
  'TASKS_AI_OPENCODE_MODEL',
  'OPENCODE_BIN',
])

/**
 * Bot config fingerprint. The bot writes it to the status file at startup, and
 * the desktop app compares it with the value computed from the current settings
 * to decide whether a restart is needed. (The values themselves are not stored)
 */
export function configFingerprint(env: NodeJS.ProcessEnv): string {
  const provided = providedValues(env)
  const entries = Object.keys(EnvSchema.shape)
    .filter((key) => !OUTSIDE_FINGERPRINT.has(key))
    .sort()
    .flatMap((key) =>
      provided[key] === undefined ? [] : [[key, provided[key]]]
    )
  return createHash('sha256')
    .update(JSON.stringify(entries))
    .digest('hex')
    .slice(0, 16)
}

export interface ConfigIssue {
  /**
   * The env var at fault. For problems involving several values, the main one
   */
  key?: string
  message: string
  /**
   * The setting is required but not filled in yet (a Slack credential, the
   * sandbox's login). Saving a partial setup is fine, since the bot shows
   * "Setup needed" until it is complete; a wrong value is not marked so and
   * blocks saving.
   */
  missing?: boolean
}

/** A setting that keeps Pace from starting, and the problem in words */
export class SettingError extends Error {
  constructor(
    readonly key: string,
    message: string
  ) {
    super(message)
  }
}

/**
 * A required setting that is still empty. Carries a valid stand-in so the
 * remaining rules can still be checked.
 */
export class MissingSettingError extends SettingError {
  constructor(
    key: string,
    message: string,
    readonly standIn: string
  ) {
    super(key, message)
  }
}

/**
 * Validation for the settings screen. Uses the same rules as loadConfig and
 * returns problems per setting.
 */
export function checkConfig(env: NodeJS.ProcessEnv): ConfigIssue[] {
  const parsed = EnvSchema.safeParse(providedValues(env))
  if (!parsed.success) {
    return parsed.error.issues.map((issue) => ({
      key: issue.path[0] === undefined ? undefined : String(issue.path[0]),
      message: issue.message,
    }))
  }
  // A missing setting is reported and then stood in for, so the rules behind it
  // are checked as well.
  const issues: ConfigIssue[] = []
  const probe: NodeJS.ProcessEnv = { ...env }
  for (;;) {
    try {
      loadConfig(probe)
      return issues
    } catch (err) {
      if (
        err instanceof MissingSettingError &&
        probe[err.key] !== err.standIn
      ) {
        issues.push({ key: err.key, message: err.message, missing: true })
        probe[err.key] = err.standIn
        continue
      }
      const { message } = err as Error
      const key = err instanceof SettingError ? err.key : undefined
      return [...issues, { key, message }]
    }
  }
}

export function loadConfig(env: NodeJS.ProcessEnv = process.env): Config {
  const parsed = EnvSchema.safeParse(providedValues(env))
  if (!parsed.success) {
    const issues = parsed.error.issues
      .map(
        (issue) => `- ${settingName(String(issue.path[0]))}: ${issue.message}`
      )
      .join('\n')
    throw new Error(`Some settings are invalid.\n${issues}`)
  }
  const e = parsed.data

  const workspace = e.MENTION_WORKSPACE
    ? expandHome(e.MENTION_WORKSPACE)
    : undefined
  if (workspace && !isDirectory(workspace)) {
    throw new SettingError(
      'MENTION_WORKSPACE',
      `The reference directory must be an absolute path to an existing folder: ${workspace}`
    )
  }

  const slack = slackConnection(e)
  // Pace answers only you: it runs on your Mac with your login, and a mention
  // in a public channel drives it as you. Answering anyone else, or a whole
  // workspace, is not a setting.
  if (env.MENTION_ANYONE?.trim().toLowerCase() === 'on')
    throw new SettingError(
      'MENTION_ALLOWED_USERS',
      'MENTION_ANYONE is gone: Pace answers only you. Remove it from the settings file.'
    )
  const owners = [...new Set(e.MENTION_ALLOWED_USERS)]
  if (slack.kind === 'app' && owners.length === 0)
    throw new MissingSettingError(
      'MENTION_ALLOWED_USERS',
      'Say who you are: add your own Slack member ID (in Slack, your profile, then ⋮, Copy member ID). Pace answers only you.',
      'U0STANDIN'
    )
  if (slack.kind === 'app' && owners.length > 1)
    throw new SettingError(
      'MENTION_ALLOWED_USERS',
      'Add one Slack member ID, your own: Pace answers only you. Teammates each run their own Pace through the team hub.'
    )

  const dataDir = e.PACENOTE_DATA_DIR
    ? path.resolve(expandHome(e.PACENOTE_DATA_DIR))
    : defaultHome()

  return {
    slack,
    timezone: e.TIMEZONE,
    mention: {
      ...(slack.kind === 'app' ? { owner: owners[0]! } : {}),
      workspace,
      concurrency: e.MENTION_CONCURRENCY,
    },
    reasoner: buildReasonerConfig(e, {
      deniedReads: hostDeniedReads([dataDir, pacenoteHome(env)]),
      codexHome: env.CODEX_HOME
        ? expandHome(env.CODEX_HOME)
        : path.join(homedir(), '.codex'),
      vm: {
        bin: defaultVmBin(env),
        root: vmRootPath(env),
        allowlistFile: allowlistPath(env),
        broker: {
          image: VM_BROKER_IMAGE,
          bundleDir: path.join(defaultSandboxDir(env), 'ops-broker/dist'),
          workDir: path.join(vmRootPath(env), 'broker-work'),
          env,
        },
      },
    }),
    render: {
      enabled: e.RENDER_DIAGRAMS === 'on',
      // Set by name, not left at its default
      asked: providedValues(env).RENDER_DIAGRAMS === 'on',
      vm: {
        bin: defaultVmBin(env),
        root: vmRootPath(env),
        image: VM_RENDERER_IMAGE,
      },
      generatedMaxPx: e.GENERATED_IMAGE_MAX_PX,
    },
    dataDir,
    history:
      e.HISTORY === 'on'
        ? { retentionDays: e.HISTORY_RETENTION_DAYS }
        : undefined,
    logLevel: e.LOG_LEVEL,
  }
}

function slackConnection(e: z.infer<typeof EnvSchema>): Config['slack'] {
  if (e.SLACK_CONNECTION === 'hub') {
    if (!e.HUB_URL)
      throw new MissingSettingError(
        'HUB_URL',
        'Connecting through the team hub needs the hub URL.',
        'https://hub.invalid'
      )
    if (!e.HUB_TOKEN)
      throw new MissingSettingError(
        'HUB_TOKEN',
        'This desktop is not paired with the hub yet. Connect in Settings > Messengers > Slack.',
        '0000000000000000000000000000000000000000000000000000000000000000'
      )
    return {
      kind: 'hub',
      hubUrl: e.HUB_URL.replace(/\/+$/, ''),
      hubToken: e.HUB_TOKEN,
    }
  }
  if (!e.SLACK_BOT_TOKEN)
    throw new MissingSettingError(
      'SLACK_BOT_TOKEN',
      'Your own Slack app needs its bot token.',
      'xoxb-stand-in'
    )
  if (!e.SLACK_APP_TOKEN)
    throw new MissingSettingError(
      'SLACK_APP_TOKEN',
      'Your own Slack app needs its app token.',
      'xapp-stand-in'
    )
  return {
    kind: 'app',
    botToken: e.SLACK_BOT_TOKEN,
    appToken: e.SLACK_APP_TOKEN,
    apiUrl: slackApiBase(e.SLACK_API_URL),
    socket: {
      clientPingTimeoutMs: e.SOCKET_CLIENT_PING_TIMEOUT_MS,
      serverPingTimeoutMs: e.SOCKET_SERVER_PING_TIMEOUT_MS,
      pingPongLogging: e.SOCKET_PING_PONG_LOG === 'on',
    },
  }
}

function isDirectory(dir: string): boolean {
  return path.isAbsolute(dir) && existsSync(dir) && statSync(dir).isDirectory()
}

function expandHome(file: string): string {
  return file === '~' || file.startsWith('~/')
    ? path.join(homedir(), file.slice(1))
    : file
}

type Env = z.infer<typeof EnvSchema>

function buildReasonerConfig(
  e: Env,
  host: {
    /** What the CLI never reads on this Mac */
    deniedReads: string[]
    /** codex's own folder on this Mac (CODEX_HOME), for its config.toml */
    codexHome: string
    /** Where the built-in VM sandbox's parts are, and its broker's */
    vm: Pick<VmSandboxOptions, 'bin' | 'root' | 'allowlistFile'> & {
      broker: NonNullable<VmSandboxOptions['broker']>
    }
  }
): Config['reasoner'] {
  const base: Config['reasoner'] = {
    mcpServers: [],
    backend: e.REASONER,
    model:
      e.REASONER_MODEL ??
      (e.REASONER === 'claude' ? DEFAULT_CLAUDE_MODEL : undefined),
    timeoutMs: e.REASONER_TIMEOUT_SEC * 1000,
    commands: { claude: e.CLAUDE_BIN, codex: e.CODEX_BIN },
  }
  if (e.OPS_TOOLS === 'on') {
    // ops-broker uses SSH keys, a cluster read token, and the work directory.
    // It stays off without the sandbox; Pace answers only you either way.
    if (e.REASONER_SANDBOX === 'none') {
      throw new SettingError(
        'OPS_TOOLS',
        'Ops tools need the built-in sandbox: set the run environment to the built-in sandbox.'
      )
    }
    // The broker is relayed into each VM at this address (vm-broker.ts).
    base.mcpServers = [{ name: 'ops', url: 'http://127.0.0.1:8080/mcp' }]
  }
  if (e.REASONER_SANDBOX === 'none') {
    // codex on this Mac does not load the user's config.toml (its MCP servers
    // and sandbox settings stay out of answers), so the model it names comes
    // along as arguments, as in the sandbox.
    if (e.REASONER === 'codex' && !e.REASONER_MODEL) {
      const defaults = readCodexDefaults(
        path.join(host.codexHome, 'config.toml')
      )
      base.model = defaults.model
      base.reasoningEffort = defaults.reasoningEffort
    }
    return { ...base, deniedReads: host.deniedReads }
  }

  // The VM has no host keychain or config: the CLI signs in there itself, into
  // a login folder of its own (vm-login.ts), and Pacenote never reads what it
  // keeps. An API key, or a claude token set by hand, also works for claude.
  // Not signed in yet, Pace still starts and says so (src/index.ts), and the
  // sign-in is in Settings > Sandbox.
  let auth: ReasonerAuth = {}
  if (signedIn(host.vm.root, e.REASONER))
    auth = { login: loginDir(host.vm.root, e.REASONER) }
  else if (e.REASONER === 'claude' && e.SANDBOX_CLAUDE_OAUTH_TOKEN)
    auth = { env: { CLAUDE_CODE_OAUTH_TOKEN: e.SANDBOX_CLAUDE_OAUTH_TOKEN } }
  else if (e.REASONER === 'claude' && e.SANDBOX_ANTHROPIC_API_KEY)
    auth = { env: { ANTHROPIC_API_KEY: e.SANDBOX_ANTHROPIC_API_KEY } }
  if (e.REASONER === 'codex' && !e.REASONER_MODEL) {
    const defaults = readCodexDefaults(path.join(host.codexHome, 'config.toml'))
    base.model = defaults.model
    base.reasoningEffort = defaults.reasoningEffort
  }

  const { broker, ...vm } = host.vm
  return {
    ...base,
    // Pace's own tools come through each run's door, at the broker's address
    // (src/pace/tools.ts).
    mcpServers: [...base.mcpServers, { name: 'pacenote', url: OWN_TOOLS_URL }],
    auth,
    vm: {
      ...vm,
      ...(e.OPS_TOOLS === 'on' ? { broker } : {}),
      image: VM_IMAGE,
      memoryMiB: memoryMiB(e.SANDBOX_MEMORY),
      cpus: Number(e.SANDBOX_CPUS),
      required: REQUIRED_DOMAINS[e.REASONER],
    },
  }
}
