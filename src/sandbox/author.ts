/**
 * The git author the sandbox commits as when the settings name one
 * (OPS_GIT_AUTHOR_*); a blank value is no value, so the global git config
 * fills it in
 */
export function settingsAuthor(values: NodeJS.ProcessEnv): {
  name?: string
  email?: string
} {
  return {
    name: values.OPS_GIT_AUTHOR_NAME?.trim() || undefined,
    email: values.OPS_GIT_AUTHOR_EMAIL?.trim() || undefined,
  }
}
