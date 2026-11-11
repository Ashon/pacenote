/**
 * The read-only account Pace reads each cluster as: what it is made of
 * (sandbox/k8s/pacenote-ro.yaml is the default one), and what kubectl's
 * answers say about it. Plain code with no Node APIs, so the desktop app, Pace
 * and the screen share it: the screen shows and copies the manifest, the
 * desktop app makes the account with it and reads kubectl's answers.
 */

/** A ServiceAccount in a namespace, the same name in each cluster */
export interface K8sAccount {
  serviceAccount: string
  namespace: string
}

export const DEFAULT_K8S_ACCOUNT: K8sAccount = {
  serviceAccount: 'pacenote-ro',
  namespace: 'pacenote',
}

/** A ServiceAccount or namespace name (a DNS label) */
export const K8S_NAME = /^[a-z0-9]([a-z0-9-]{0,61}[a-z0-9])?$/

/**
 * A kubeconfig context name: GKE's and kind's, and EKS's ARNs
 * (arn:aws:eks:region:account:cluster/name)
 */
export const K8S_CONTEXT = /^[A-Za-z0-9][A-Za-z0-9._@:/-]{0,252}$/

/** The Secret that holds the account's token */
export const tokenSecret = (account: K8sAccount): string =>
  `${account.serviceAccount}-token`

/** The label every object of the account has, to find or remove them */
export const ACCOUNT_LABEL = 'app=pacenote'

/**
 * The account's manifest, for kubectl apply: the namespace, the
 * ServiceAccount and its token, ClusterRole view (which leaves out secrets)
 * everywhere, and reads of the cluster's own resources. reader, the user an
 * admin makes it for, may also read the token, so that user's Pacenote can
 * build its kubeconfig from it.
 */
export function accountManifest(
  account: K8sAccount,
  options: { reader?: string } = {}
): string {
  const { serviceAccount: sa, namespace: ns } = account
  const subject = [
    '  - kind: ServiceAccount',
    `    name: ${sa}`,
    `    namespace: ${ns}`,
  ]
  const labels = ['  labels:', '    app: pacenote']
  const docs: string[][] = [
    [
      'apiVersion: v1',
      'kind: Namespace',
      'metadata:',
      `  name: ${ns}`,
      ...labels,
    ],
    [
      'apiVersion: v1',
      'kind: ServiceAccount',
      'metadata:',
      `  name: ${sa}`,
      `  namespace: ${ns}`,
      ...labels,
    ],
    [
      'apiVersion: v1',
      'kind: Secret',
      'metadata:',
      `  name: ${tokenSecret(account)}`,
      `  namespace: ${ns}`,
      '  annotations:',
      `    kubernetes.io/service-account.name: ${sa}`,
      ...labels,
      'type: kubernetes.io/service-account-token',
    ],
    [
      'apiVersion: rbac.authorization.k8s.io/v1',
      'kind: ClusterRoleBinding',
      'metadata:',
      `  name: ${sa}-view`,
      ...labels,
      'roleRef:',
      '  apiGroup: rbac.authorization.k8s.io',
      '  kind: ClusterRole',
      '  name: view',
      'subjects:',
      ...subject,
    ],
    [
      'apiVersion: rbac.authorization.k8s.io/v1',
      'kind: ClusterRole',
      'metadata:',
      `  name: ${sa}-cluster`,
      ...labels,
      'rules:',
      '  - apiGroups: [""]',
      '    resources: [nodes, namespaces, persistentvolumes]',
      '    verbs: [get, list, watch]',
      '  - apiGroups: [storage.k8s.io]',
      '    resources: [storageclasses]',
      '    verbs: [get, list, watch]',
      '  - apiGroups: [metrics.k8s.io]',
      '    resources: [nodes, pods]',
      '    verbs: [get, list]',
    ],
    [
      'apiVersion: rbac.authorization.k8s.io/v1',
      'kind: ClusterRoleBinding',
      'metadata:',
      `  name: ${sa}-cluster`,
      ...labels,
      'roleRef:',
      '  apiGroup: rbac.authorization.k8s.io',
      '  kind: ClusterRole',
      `  name: ${sa}-cluster`,
      'subjects:',
      ...subject,
    ],
  ]
  if (options.reader) {
    const reader = `${sa}-token-reader`
    docs.push(
      [
        `# Lets ${oneLine(options.reader)} read the token, so their Pacenote can use the account.`,
        'apiVersion: rbac.authorization.k8s.io/v1',
        'kind: Role',
        'metadata:',
        `  name: ${reader}`,
        `  namespace: ${ns}`,
        ...labels,
        'rules:',
        '  - apiGroups: [""]',
        '    resources: [secrets]',
        `    resourceNames: [${tokenSecret(account)}]`,
        '    verbs: [get]',
      ],
      [
        'apiVersion: rbac.authorization.k8s.io/v1',
        'kind: RoleBinding',
        'metadata:',
        `  name: ${reader}`,
        `  namespace: ${ns}`,
        ...labels,
        'roleRef:',
        '  apiGroup: rbac.authorization.k8s.io',
        '  kind: Role',
        `  name: ${reader}`,
        'subjects:',
        '  - apiGroup: rbac.authorization.k8s.io',
        '    kind: User',
        // A user name may hold colons (oidc:alice, arn:aws:...): quoted
        `    name: ${JSON.stringify(options.reader)}`,
      ]
    )
  }
  const header = [
    `# Pacenote's read-only account for one cluster (${ns}/${sa}). Settings > Tools > Kubernetes makes it`,
    "# for you, or copies it for the cluster's admin. By hand: save it as a file and run kubectl apply -f with it.",
    '#',
    '# - Namespaced resources are read with the built-in ClusterRole view, which leaves out secrets.',
    `# - Cluster resources such as nodes, namespaces, storage and metrics are read with ${sa}-cluster.`,
    "# - Nothing can be changed. A separate account keeps Pace's lookups apart in the audit log, and",
    '#   removing it takes two commands:',
    `#   kubectl delete namespace ${ns}`,
    `#   kubectl delete clusterrolebinding,clusterrole -l ${ACCOUNT_LABEL}`,
  ]
  // The header comments the first document: no empty document before it
  return `${header.join('\n')}\n${docs.map((doc) => doc.join('\n')).join('\n---\n')}\n`
}

/** A user name in a comment line, whatever it holds */
const oneLine = (value: string) => value.replace(/\s+/g, ' ').trim()

/**
 * How the broker's kubeconfig was last built, kept beside it
 * (kubeconfig.json): what the settings asked for, the contexts it has, and
 * why the others are missing
 */
export interface KubeconfigBuild {
  contexts: string[]
  serviceAccount: string
  namespace: string
  built: string[]
  failed: { context: string; state: K8sAccountState; detail?: string }[]
  at: string
}

/** One context's account, as Settings > Tools > Kubernetes shows it */
export interface K8sContextCheck {
  context: string
  state: K8sAccountState
  detail?: string
  /** You may make it (kubectl auth can-i create clusterrolebindings) */
  canCreate?: boolean
  /** Who kubectl signs in as there, for the admin's manifest (auth whoami) */
  user?: string
}

/**
 * What Pace's broker reads each cluster with: how its kubeconfig was built,
 * and each context in it asked, with the account's own token, whether it may
 * read, read secrets and change things (none means kubectl did not say, as in
 * detail)
 */
export interface K8sConnected {
  build?: KubeconfigBuild
  contexts: {
    context: string
    reads?: boolean
    secrets?: boolean
    changes?: boolean
    detail?: string
  }[]
}

/** How a kubectl command this Mac ran finished */
export interface KubectlResult {
  code: number | null
  stdout: string
  stderr: string
  /** kubectl is not on the PATH */
  missing?: boolean
}

/**
 * A cluster's account, as the token's Secret answers:
 * - ready: its token is there
 * - pending: made, with no token yet (the cluster fills it in a moment)
 * - missing: not in the cluster
 * - forbidden: you may not look, so an admin makes it or lets you read it
 * - signIn: kubectl has to sign in to the cluster first
 * - unreachable: the cluster does not answer (a VPN, or the address)
 * - noContext: no such context in your kubeconfig
 * - noKubectl: kubectl is not on this Mac
 * - failed: something else, in its detail
 */
export type K8sAccountState =
  | 'ready'
  | 'pending'
  | 'missing'
  | 'forbidden'
  | 'signIn'
  | 'unreachable'
  | 'noContext'
  | 'noKubectl'
  | 'failed'

/**
 * What kubectl's answer to reading the token says about the account. detail:
 * kubectl's own last line, for a state that needs it.
 */
export function accountState(result: KubectlResult): {
  state: K8sAccountState
  detail?: string
} {
  if (result.missing) return { state: 'noKubectl' }
  if (result.code === 0)
    return { state: result.stdout.trim() ? 'ready' : 'pending' }
  return {
    state: kubectlTrouble(result.stderr),
    detail: lastLine(result.stderr) || undefined,
  }
}

/** Why a kubectl command failed, from what it printed */
export function kubectlTrouble(
  stderr: string
): Exclude<K8sAccountState, 'ready' | 'pending' | 'noKubectl'> {
  if (
    /context was not found|context "[^"]*" does not exist|no context exists/i.test(
      stderr
    )
  )
    return 'noContext'
  if (/\(Forbidden\)|\bforbidden\b/i.test(stderr)) return 'forbidden'
  if (
    /\(Unauthorized\)|\bUnauthorized\b|must be logged in|provide credentials|getting credentials|exec plugin|executable file not found|token (has )?expired|invalid_grant|refresh token/i.test(
      stderr
    )
  )
    return 'signIn'
  if (
    /Unable to connect|dial tcp|i\/o timeout|no such host|connection refused|deadline exceeded|TLS handshake|Client\.Timeout|timed out|network is unreachable|no route to host/i.test(
      stderr
    )
  )
    return 'unreachable'
  if (/\(NotFound\)|not found/i.test(stderr)) return 'missing'
  return 'failed'
}

/** kubectl auth can-i's answer: yes, no, or none when it failed */
export function canI(result: KubectlResult): boolean | undefined {
  const answer = result.stdout.trim().toLowerCase()
  if (answer.startsWith('yes')) return true
  if (answer.startsWith('no')) return false
  return undefined
}

/** A command's last line of output, short enough for one row */
export function lastLine(output: string): string {
  const line =
    output
      .split('\n')
      .map((each) => each.trim())
      .filter(Boolean)
      .pop() ?? ''
  return line.length > 200 ? `${line.slice(0, 199)}…` : line
}
