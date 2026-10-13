import { homedir } from 'node:os'
import path from 'node:path'
import { defaultHome } from './home.js'

/**
 * Pacenote settings location outside the repository. Holds the config file
 * (.env) and ops-broker runtime files (host list, kubeconfig). It is kept out
 * of the repository so values from target environments do not end up in it.
 * Change the location with the PACENOTE_HOME environment variable. The default
 * is ~/.pacenote. (The sandbox jobs always get the resolved location)
 */
export function pacenoteHome(
  env: NodeJS.ProcessEnv = process.env,
  home = homedir()
): string {
  const value = env.PACENOTE_HOME?.trim()
  if (!value) return defaultHome(home)
  return value === '~' || value.startsWith('~/')
    ? path.join(home, value.slice(1))
    : path.resolve(value)
}

/** Config file shared by the bot, desktop app, and sandbox jobs */
export function envFilePath(
  env: NodeJS.ProcessEnv = process.env,
  home = homedir()
): string {
  return path.join(pacenoteHome(env, home), '.env')
}

/**
 * Egress allowlist the built-in sandbox's proxy reads on each request. Created
 * from sandbox/allowed-domains.txt if missing.
 */
export function allowlistPath(
  env: NodeJS.ProcessEnv = process.env,
  home = homedir()
): string {
  return path.join(pacenoteHome(env, home), 'sandbox', 'allowed-domains.txt')
}

/**
 * The built-in VM sandbox's folder: kernel, init filesystem, images
 * (PACENOTE_VM_ROOT for tests)
 */
export function vmRootPath(
  env: NodeJS.ProcessEnv = process.env,
  home = homedir()
): string {
  const root = env.PACENOTE_VM_ROOT?.trim()
  return root ? path.resolve(root) : path.join(pacenoteHome(env, home), 'vm')
}

/**
 * Generated files the broker mounts (hosts.json, kubeconfig) and empty
 * placeholders for unset mounts (unset/)
 */
export function brokerRuntimeDir(
  env: NodeJS.ProcessEnv = process.env,
  home = homedir()
): string {
  return path.join(pacenoteHome(env, home), 'ops-broker')
}
