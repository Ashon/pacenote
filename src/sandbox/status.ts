import type { ClaudeCredential, CredentialState } from './claude-credential.js'
import { execFile } from 'node:child_process'
import { existsSync, readFileSync, statSync } from 'node:fs'
import { homedir } from 'node:os'
import path from 'node:path'
import { configFingerprint, sandboxSetting } from '../config.js'
import { localized } from '../i18n/locale.js'
import { readBotStatus } from '../runtime/status.js'
import { settingLabel } from '../settings/fields.js'
import { readSettingsValues } from '../settings/settings-file.js'
import {
  allowlistPath,
  brokerRuntimeDir,
  vmRootPath,
} from '../settings/paths.js'
import {
  parseAllowlist,
  readAllowlistFile,
  REQUIRED_DOMAINS,
} from './allowlist.js'
import { brokerExpected } from './env.js'
import { defaultVmBin, vmStatus } from './vm.js'
import { signedIn } from './vm-login.js'
import { VM_BROKER_IMAGE, VM_IMAGE, VM_RENDERER_IMAGE } from './vm-images.js'
import type { PendingApply, SandboxCheck, SandboxStatus } from './types.js'
import { text } from './status.text.js'

/** Settings Pace has not picked up: they changed after it started */
export function computePending(bot?: {
  configHash?: string
  expectedHash: string
}): PendingApply[] {
  return bot?.configHash && bot.configHash !== bot.expectedHash
    ? [{ reason: localized(text).settingsChanged }]
    : []
}

type Run = (
  command: string,
  args: string[]
) => Promise<{ code: number; stdout: string; stderr: string }>

export function commandRunner(env: NodeJS.ProcessEnv, cwd: string): Run {
  return (command, args) =>
    new Promise((resolve) => {
      execFile(
        command,
        args,
        { env, cwd, timeout: 15_000, maxBuffer: 4 * 1024 * 1024 },
        (err, stdout, stderr) => {
          const code = err
            ? typeof (err as { code?: unknown }).code === 'number'
              ? (err as { code: number }).code
              : 1
            : 0
          resolve({ code, stdout: String(stdout), stderr: String(stderr) })
        }
      )
    })
}

/**
 * The broker's commit author, resolved as it is when the broker starts:
 * OPS_GIT_AUTHOR_* in the settings, otherwise the global git config. This
 * repository's local git config is not consulted.
 */
async function sandboxAuthor(
  values: NodeJS.ProcessEnv,
  run: Run
): Promise<{ name: string; email: string; source: 'settings' | 'global' }> {
  const fromGlobal = async (key: string) =>
    (await run('git', ['config', '--global', key])).stdout.trim()
  const name =
    values.OPS_GIT_AUTHOR_NAME?.trim() || (await fromGlobal('user.name'))
  const email =
    values.OPS_GIT_AUTHOR_EMAIL?.trim() || (await fromGlobal('user.email'))
  const fromSettings = Boolean(
    values.OPS_GIT_AUTHOR_NAME?.trim() || values.OPS_GIT_AUTHOR_EMAIL?.trim()
  )
  return {
    name,
    email,
    source: fromSettings ? 'settings' : 'global',
  }
}

/**
 * Collects sandbox status: the built-in sandbox's parts, credential files, and
 * settings Pace has not picked up. Secrets are not read. (Only checks whether
 * files exist and whether GitHub login is done)
 */
export async function collectSandboxStatus(options: {
  /** The sandbox folder (the repository's, or the one inside the app) */
  sandboxDir: string
  /** Settings file (outside the repository, src/settings/paths.ts) */
  settingsFile: string
  dataDir: string
  /**
   * The app's environment variables, applied with the same precedence as the
   * bot
   */
  env: NodeJS.ProcessEnv
  run: Run
  home?: string
  /**
   * Asks the API whether the claude credential works (the desktop app passes
   * checkClaudeCredential); without it, only whether one is set
   */
  checkCredential?: (
    credential: ClaudeCredential
  ) => Promise<CredentialState | undefined>
}): Promise<SandboxStatus> {
  const t = localized(text)
  const { sandboxDir, run } = options
  const home = options.home ?? homedir()
  const values: NodeJS.ProcessEnv = {
    ...readSettingsValues(options.settingsFile),
    ...options.env,
  }
  const reasoner = values.REASONER === 'codex' ? 'codex' : 'claude'
  const isolated = sandboxSetting(values.REASONER_SANDBOX) === 'vm'
  const opsOn = values.OPS_TOOLS === 'on'
  // The allowlist lives under PACENOTE_HOME. If it does not exist yet (the
  // sandbox was never set up), the default list is shown.
  const allowlistFile = allowlistPath(options.env, home)
  const allowlistSource = existsSync(allowlistFile)
    ? allowlistFile
    : path.join(sandboxDir, 'allowed-domains.txt')

  const status: SandboxStatus = {
    checkedAt: new Date().toISOString(),
    checks: [],
    pending: [],
    allowlist: {
      file: allowlistFile,
      domains: parseAllowlist(readAllowlistFile(allowlistSource)),
      required: REQUIRED_DOMAINS[reasoner],
    },
    activeRequests: 0,
  }

  // Credentials and generated files (values are not read)
  const runtimeDir = brokerRuntimeDir(options.env, home)
  const expected = brokerExpected(values, runtimeDir)
  const hostsFile = path.join(runtimeDir, 'hosts.json')
  const kubeconfig = path.join(runtimeDir, 'kubeconfig')
  const fileCheck = (label: string, file: string): SandboxCheck =>
    existsSync(file)
      ? { label, ok: true, detail: file }
      : { label, ok: false, detail: t.missingFile(file) }
  // The sandbox's own sign-in (vm-login.ts): whether the CLI's credentials
  // file is there, never what is in it
  const signed = signedIn(vmRootPath(options.env, home), reasoner)
  status.signedIn = signed
  if (isolated) {
    const name = reasoner === 'claude' ? 'Claude' : 'Codex'
    const check: SandboxCheck = {
      label: t.login(reasoner),
      login: true,
      ok: signed,
      detail: signed ? t.signedIn : t.notSignedIn(name),
    }
    // As the config picks: the sign-in, a claude token set by hand, an API key
    const apiKey = values.SANDBOX_ANTHROPIC_API_KEY || undefined
    if (!signed && reasoner === 'claude' && values.SANDBOX_CLAUDE_OAUTH_TOKEN) {
      check.ok = true
      check.detail = t.usesToken
    } else if (!signed && reasoner === 'claude' && apiKey) {
      const state = await options.checkCredential?.({ apiKey })
      check.ok = state !== 'rejected'
      check.detail = state === 'rejected' ? t.keyRejected : t.usesKey
    }
    status.checks.push(check)
  }
  // Checks only configured features. For empty features the broker starts
  // without those tools. (Shown as off in the broker tools row)
  if (opsOn && expected.configured.ssh) {
    status.checks.push(fileCheck(t.sshKey, expected.sshKey))
    if (values.OPS_SSH_KNOWN_HOSTS?.trim())
      status.checks.push(fileCheck(t.knownHosts, expected.knownHosts))
    let hostCount = 0
    try {
      hostCount = Object.keys(
        JSON.parse(readFileSync(hostsFile, 'utf8')) as object
      ).length
    } catch {
      // Missing or empty.
    }
    const fromInventory = Boolean(
      values.OPS_SSH_INVENTORY_DIR?.trim() && values.OPS_SSH_INVENTORY?.trim()
    )
    status.checks.push({
      label: t.hostList,
      ok: hostCount > 0,
      detail:
        hostCount > 0
          ? t.hosts(hostCount, fromInventory)
          : fromInventory
            ? t.noHostsYet
            : t.noHosts(settingLabel('OPS_SSH_INVENTORY')),
    })
  }
  if (opsOn) {
    const kubeSize = existsSync(kubeconfig) ? statSync(kubeconfig).size : 0
    status.checks.push({
      label: t.kubeconfig,
      ok: kubeSize > 0,
      detail: kubeSize > 0 ? t.present : t.kubeconfigEmpty,
    })
    const jiraKeys = [
      'OPS_JIRA_URL',
      'OPS_JIRA_EMAIL',
      'OPS_JIRA_TOKEN',
      'OPS_JIRA_PROJECTS',
    ] as const
    if (jiraKeys.some((key) => values[key]?.trim())) {
      const missing = jiraKeys.filter((key) => !values[key]?.trim())
      status.checks.push({
        label: t.jira,
        ok: missing.length === 0,
        detail:
          missing.length === 0
            ? `${values.OPS_JIRA_URL} (${values.OPS_JIRA_PROJECTS}, ${values.OPS_JIRA_EMAIL})`
            : t.required(missing.map(settingLabel)),
      })
    }
    const gh = await run('gh', [
      'auth',
      'status',
      '--active',
      '--hostname',
      'github.com',
    ])
    const account = /account (\S+)/.exec(gh.stdout + gh.stderr)?.[1]
    status.checks.push({
      label: t.github,
      ok: gh.code === 0,
      detail: gh.code === 0 ? t.ghSignedIn(account) : t.ghSignedOut,
    })
    const author = await sandboxAuthor(values, run)
    status.checks.push({
      label: t.author,
      ok: Boolean(author.name && author.email),
      detail:
        author.name && author.email
          ? `${author.name} <${author.email}> (${t.authorFrom[author.source]})`
          : t.noAuthor,
    })
  }

  // Shown when the built-in sandbox is chosen, saved or not yet; on a Mac
  // that cannot run it, only why.
  if (process.platform === 'darwin') {
    status.vm = await vmStatus({
      bin: defaultVmBin(options.env),
      root: vmRootPath(options.env, home),
      image: VM_IMAGE,
      renderer: VM_RENDERER_IMAGE,
      broker: VM_BROKER_IMAGE,
      sandboxDir,
    })
    const { image, renderer, broker } = status.vm
    status.vm.outdated = [
      image?.current === false && 'reasoner',
      values.RENDER_DIAGRAMS !== 'off' &&
        renderer?.current === false &&
        'diagram renderer',
      opsOn && broker?.current === false && 'ops broker',
    ].filter((name) => typeof name === 'string')
  }

  const bot = readBotStatus(options.dataDir)
  status.activeRequests = bot.alive ? (bot.status?.requests.active ?? 0) : 0
  status.pending = computePending(
    bot.alive
      ? {
          configHash: bot.status?.configHash,
          expectedHash: configFingerprint(values),
        }
      : undefined
  )
  return status
}
