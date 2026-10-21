import path from 'node:path'
import { z } from 'zod'
import type { ConfigIssue } from '../config.js'
import { text as configText } from '../config.text.js'
import { localized } from '../i18n/locale.js'
import { text } from './env.text.js'

/**
 * A rule's message, read when a value is checked rather than when the schema
 * is built, so it is in the language of that moment
 */
const says = (rule: keyof (typeof text)['en']['rules']) => ({
  error: () => localized(text).rules[rule],
})

/** zod's own messages in the language of the moment, as config.ts has them */
const inLanguage = () => ({ error: localized(configText).zodIssue })

/** Mount paths accept only absolute paths: ~ is not expanded. */
const absolutePath = z
  .string()
  .refine((value) => value.startsWith('/'), says('absolutePath'))

const owner = '[A-Za-z0-9][A-Za-z0-9-]*'
const projectKey = '[A-Za-z][A-Za-z0-9_]*'
const name = '[A-Za-z0-9][A-Za-z0-9._@-]*'

/**
 * Values that ops-broker and its prep jobs (the broker's start, sandbox-job
 * kubeconfig) read from the settings. For empty features the broker starts
 * without those tools.
 */
export const BrokerEnvSchema = z.object({
  /**
   * Work directory mounted read-only (fs_*, ws_*). If empty, the file tools are
   * off.
   */
  OPS_FS_ROOT: absolutePath.optional(),
  /**
   * Orgs allowed for PR creation and GitHub queries (ws_*, gh_*). If empty, the
   * GitHub tools are off.
   */
  OPS_GIT_ALLOWED_OWNERS: z
    .string()
    .regex(
      new RegExp(`^\\s*${owner}(\\s*,\\s*${owner})*\\s*$`),
      says('githubOrgs')
    )
    .optional(),
  /**
   * Author of commits the sandbox makes (ws_create_pr). If empty, the global
   * git config (git config --global) is used. Separate from this repository's
   * git config.
   */
  OPS_GIT_AUTHOR_NAME: z.string().optional(),
  OPS_GIT_AUTHOR_EMAIL: z.email(says('email')).optional(),
  /**
   * Jira queries, issue creation, and comments (jira_*). On only when all four
   * are set. Writes are made as the token owner.
   */
  OPS_JIRA_URL: z
    .url({
      protocol: /^https$/,
      ...says('jiraUrl'),
    })
    .optional(),
  OPS_JIRA_EMAIL: z.email(says('email')).optional(),
  OPS_JIRA_TOKEN: z.string().optional(),
  OPS_JIRA_PROJECTS: z
    .string()
    .regex(
      new RegExp(`^\\s*${projectKey}(\\s*,\\s*${projectKey})*\\s*$`),
      says('jiraProjects')
    )
    .optional(),
  /**
   * Directory with the ansible inventory used to build the host list. Relative
   * paths are relative to this repository
   */
  OPS_SSH_INVENTORY_DIR: z.string().optional(),
  OPS_SSH_INVENTORY: z
    .string()
    .regex(/^[A-Za-z0-9._/-]+$/, says('inventoryPath'))
    .refine(
      (value) => !value.split('/').includes('..'),
      says('inventoryInside')
    )
    .optional(),
  OPS_SSH_ALLOWED_CIDR: z
    .string()
    .regex(/^(\d{1,3}\.){3}\d{1,3}\/\d{1,2}$/, says('cidr'))
    .optional(),
  OPS_SSH_USER: z
    .string()
    .regex(/^[a-z_][a-z0-9_-]{0,31}$/, says('linuxUser'))
    .optional(),
  OPS_SSH_KEY: absolutePath.optional(),
  OPS_SSH_KNOWN_HOSTS: absolutePath.optional(),
  /**
   * Local kubeconfig contexts to build the read-only kubeconfig from. If empty,
   * the k8s tools are off.
   */
  OPS_K8S_CONTEXTS: z
    .string()
    .regex(
      new RegExp(`^\\s*${name}(\\s*,\\s*${name})*\\s*$`),
      says('k8sContexts')
    )
    .optional(),
  OPS_K8S_SA: z
    .string()
    .regex(/^[a-z0-9]([a-z0-9-]*[a-z0-9])?$/, says('serviceAccount'))
    .default('pacenote-ro'),
  OPS_K8S_SA_NAMESPACE: z
    .string()
    .regex(/^[a-z0-9]([a-z0-9-]*[a-z0-9])?$/, says('namespace'))
    .default('pacenote'),
})

export type BrokerEnv = z.infer<typeof BrokerEnvSchema>

function provided(env: NodeJS.ProcessEnv): Record<string, string> {
  return Object.fromEntries(
    Object.entries(env).filter(
      (entry): entry is [string, string] =>
        entry[0] in BrokerEnvSchema.shape && Boolean(entry[1]?.trim())
    )
  )
}

export function checkBrokerEnv(env: NodeJS.ProcessEnv): ConfigIssue[] {
  const parsed = BrokerEnvSchema.safeParse(provided(env), inLanguage())
  if (parsed.success) return []
  return parsed.error.issues.map((issue) => ({
    key: issue.path[0] === undefined ? undefined : String(issue.path[0]),
    message: issue.message,
  }))
}

/**
 * Validates and reads the settings. Used by the prep jobs (sandbox-job broker,
 * kubeconfig).
 */
export function loadBrokerEnv(env: NodeJS.ProcessEnv): BrokerEnv {
  const parsed = BrokerEnvSchema.safeParse(provided(env), inLanguage())
  if (parsed.success) return parsed.data
  throw new Error(
    parsed.error.issues
      .map((issue) => `${String(issue.path[0] ?? '')}: ${issue.message}`)
      .join('\n')
  )
}

/** Comma-separated list to array */
export function splitList(value: string | undefined): string[] {
  return (value ?? '')
    .split(',')
    .map((item) => item.trim())
    .filter(Boolean)
}

/**
 * Empty placeholder an unset mount points to instead. Created when the broker
 * starts. (src/sandbox/prepare.ts) (runtimeDir must match brokerRuntimeDir())
 */
export function unsetMount(runtimeDir: string, name: string): string {
  return path.join(runtimeDir, 'unset', name)
}

/** Values the broker starts with (with defaults expanded) */
export function brokerExpected(env: NodeJS.ProcessEnv, runtimeDir: string) {
  const parsed = BrokerEnvSchema.parse(provided(env))
  const unset = (name: string) => unsetMount(runtimeDir, name)
  return {
    sshUser: parsed.OPS_SSH_USER ?? '',
    allowedCidr: parsed.OPS_SSH_ALLOWED_CIDR ?? '',
    allowedOwners: parsed.OPS_GIT_ALLOWED_OWNERS ?? '',
    jiraUrl: parsed.OPS_JIRA_URL ?? '',
    jiraEmail: parsed.OPS_JIRA_EMAIL ?? '',
    jiraProjects: parsed.OPS_JIRA_PROJECTS ?? '',
    /**
     * Only set values. For empty values the broker starts without that tool.
     */
    configured: {
      fsRoot: Boolean(parsed.OPS_FS_ROOT),
      ssh: Boolean(
        parsed.OPS_SSH_USER && parsed.OPS_SSH_ALLOWED_CIDR && parsed.OPS_SSH_KEY
      ),
    },
    fsRoot: parsed.OPS_FS_ROOT ?? unset('workspace'),
    sshKey: parsed.OPS_SSH_KEY ?? unset('ssh-key'),
    knownHosts: parsed.OPS_SSH_KNOWN_HOSTS ?? unset('known_hosts'),
  }
}
