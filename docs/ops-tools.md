# Tools: connections through the ops broker
Settings > Tools shows what Pace can reach when it answers you, and what it may change. Its connections (a work folder,
GitHub, Jira, Kubernetes, SSH hosts) let the reasoner CLI query operational state and, where you turn on Write, fix code
into draft PRs and write Jira issues and comments. Credentials and the work directory are never put into the
reasoner's VM; only a separate relay (`ops-broker`), in a VM of its own, holds them. The reasoner can only request
fixed queries through MCP tools.

```
reasoner VM ----------MCP(http, through Pace)-----> ops-broker VM  --ssh OPS_SSH_USER--> inventory hosts (within OPS_SSH_ALLOWED_CIDR)
  (no credentials, no shell or shell rejected)      (keys, tokens) --kubectl (read-only SA)--> OPS_K8S_CONTEXTS clusters
                                                                   --read-only mount--> OPS_FS_ROOT
                                                                   --git(https, user token)--> GitHub (pacenote/* branches, draft PRs)
                                                                   --REST(user token, read)--> GitHub (repositories, PR queries)
                                                                   --REST(API token)--> Jira (allowed project queries, issue create/comment)
```

| Tool | What it does | Limits |
| --- | --- | --- |
| `host_list`, `host_check` | Host checks over SSH: `uptime`, `dmesg`, `memory`, `disk`, `top`, `pci_devices`, `failed_units`, `service`, `journal` | Fixed checks with format-validated arguments only. Hosts are named from the host list only, within `OPS_SSH_ALLOWED_CIDR` |
| `k8s_get`, `k8s_describe`, `k8s_logs`, `k8s_events`, `k8s_top` | kubectl queries | Enforced on the cluster side by a read-only SA (`sandbox/k8s/pacenote-ro.yaml`, ClusterRole `view` plus cluster-scoped reads). Secrets are blocked by both RBAC and the broker |
| `fs_list`, `fs_find`, `fs_search`, `fs_read` | Work directory reads | Read-only mount. Excludes `.env`, keys, kubeconfig, `*secret*`, `.git`, `.venv` and similar. Rejects paths outside the root and links pointing outside it. Searches must be scoped to a repository or a path inside one |
| `ws_prepare`, `ws_read`, `ws_search`, `ws_list`, `ws_edit`, `ws_write`, `ws_delete`, `ws_diff`, `ws_create_pr` | Code changes and draft PRs | See "Code changes and PRs" below |
| `gh_repo_search`, `gh_pr_list`, `gh_pr_search`, `gh_pr_view`, `gh_pr_diff` | GitHub repository search, PR list/search, PR details (reviews, CI checks, changed files), diff | Read-only. Only `OPS_GIT_ALLOWED_OWNERS` orgs. A repository name without an org is looked up in the allowed orgs; if there is none, similar repositories are suggested |
| `jira_search`, `jira_issue`, `jira_create_issue`, `jira_add_comment` | Jira JQL search, issue details (description, sub-issues and linked issues, recent comments), issue creation, comments | Only `OPS_JIRA_PROJECTS` projects (JQL is pinned to a project condition). Writes happen only on request, are made as the token owner's account, and are limited to 20 per hour. No status changes |

- Every tool output is returned with secret values in common formats, such as tokens and private keys, masked.
- Jira is accessed only with the broker's API token (`OPS_JIRA_TOKEN`). The broker connects directly, so Jira is not added to the proxy's allowed domains.
- GitHub is queried only with the broker's token (`gh auth token`). The reasoner's VM cannot reach GitHub and has no token.
  codex's ChatGPT app connectors (`codex_apps`, including the GitHub connector) have a different permission scope and send data
  over a different path, so they are turned off in sandbox runs. (`codex exec --disable apps`)
- Every call is logged by the broker, in Pace's own log.
- Because it uses credentials, the bot does not start without the built-in sandbox (`REASONER_SANDBOX=vm`). Pace
  answers only you, so the tools act only for you.
- To add checks, edit `src/broker/checks.ts` (SSH) or `src/broker/k8s.ts`, bundle the broker (`pnpm bundle`) and restart Pace.

## Read and write

Each connection has a Read switch and, where Pace can change something, a Write switch. Nothing finer: one Write covers
everything a connection can change.

| Connection | Read (on until turned off) | Write (off until turned on) |
| --- | --- | --- |
| Work folder | `fs_*` | None |
| GitHub | `gh_*` | `ws_*`: draft PRs, which also need the work folder |
| Jira | `jira_search`, `jira_issue` | `jira_create_issue`, `jira_add_comment` |
| Kubernetes | `k8s_*` | None |
| SSH hosts | `host_*` | None |

- A connection is in use once its settings are filled in and its Read is on. With Read off, its settings stay and Pace
  reaches none of it; its Write goes off with it.
- The broker registers only the tools of what is in use (`TOOLS`, which Pace builds from the switches with
  `brokerTools` in `src/settings/tools.ts`), so the model never sees the name of a tool that is off, and the broker's way
  out opens only toward the connections in use.
- When a request needs a tool that is not there, Pace says what is missing and that you can allow it in Settings > Tools.
- Write came with its own switch in v0.6.5. The first start of v0.6.5 writes `ops.write` into the settings file once:
  on for GitHub and Jira if they were already set up, so they keep doing what they did, and off otherwise. A connection
  set up after that starts with Write off.

## In the built-in sandbox

The broker runs in a Linux VM of its own while Pace runs (`src/sandbox/vm-broker.ts`):

```
reasoner VM --127.0.0.1:8080--> socket on this Mac --> broker VM --127.0.0.1:3128--> Pace's broker egress --> what its settings name
 (no network device)                                   (keys, tokens, /work)          (refuses anything else)
```

- The VMs share no network: each reasoner VM gets a door to the broker of its run's own, where it is 127.0.0.1:8080.
  The door is Pace's: it adds who the run answers (the Slack user, the channel, the thread and the run) to every call
  and drops any such header the reasoner sent, so the broker's audit lines say who asked, in Pace's log
  (`"by":{"user":"U0...","label":"#ops",...}`).
- The broker's VM has no network device either. Its way out is an egress proxy in Pace that lets it reach only what its
  settings name: the hosts in `hosts.json` on port 22 (ssh goes through it with a ProxyCommand), each kubeconfig
  cluster's API server, `github.com` and `api.github.com` when the GitHub tools are on, and the Jira site. It never reaches
  this Mac's own addresses.
- Each time Pace starts, `hosts.json` is built from the inventory and the GitHub token read with `gh auth token`. Its work
  folder (mirrors and worktrees) is `~/.pacenote/vm/broker-work`.
- Its image (ssh, git, ripgrep and kubectl) is built by "Set up built-in sandbox" when ops tools are on; the broker's code
  is mounted from the app at each start, so a newer Pacenote needs no new image.
- Settings apply when Pace restarts.

## Code changes and PRs

- `ws_prepare(repo)`: finds `origin` from the local repository directory name and, if it is a repository of an allowed org
  (`OPS_GIT_ALLOWED_OWNERS`), creates a workspace on a `pacenote/<date>-<id>` branch from the remote default branch.
  The workspace is a mirror worktree in the broker's work folder (`~/.pacenote/vm/broker-work`), so the user's local working tree and changes in progress are not touched.
- Changes are made only with `ws_edit` (exact string replacement), `ws_write` and `ws_delete`. There is no shell and no test run.
  Verification is left to the PR's CI and human review.
- `ws_create_pr`: commits after policy checks, pushes only to `pacenote/*` branches, and creates a draft PR.
  - Rejected: no changes, `.github/workflows/`, `.gitmodules`, secret file paths, secret value formats in the diff, more than 50 files, more than 3000 added lines
  - The commit author is `OPS_GIT_AUTHOR_NAME`, `OPS_GIT_AUTHOR_EMAIL`, or, when they are empty, the user in the global git config (`git config --global`).
    This is separate from this repository's git config. PRs are created as the `gh` login account. Limited to 10 per hour.
- The GitHub token is read with `gh auth token` when the broker starts (with Pace) and passed only as a broker environment variable. The model cannot see it.
  It has the `repo` and `workflow` scopes, so in production a fine-grained PAT limited to the target repositories is recommended instead.
- Workspaces are cleaned up after 24 hours.

Setup: no value of the target environment lives in the code; all of them go into `ops` in the settings file
(`~/.pacenote/settings.json`, from Settings > Tools; [Settings file](settings.md) maps each `OPS_*` name below to
its place). Each feature is optional, and the broker starts without the tools of any feature left empty.
Files the broker generates, such as the host list and kubeconfig, are also created outside the repository, in `~/.pacenote/ops-broker/`.

| Feature | Settings | If empty |
| --- | --- | --- |
| File reads (`fs_*`) | `OPS_FS_ROOT` | File and PR tools off |
| GitHub queries, PRs (`gh_*`, `ws_*`) | `OPS_GIT_ALLOWED_OWNERS` (+ `gh auth login`, commit author `OPS_GIT_AUTHOR_*`) | GitHub and PR tools off |
| Jira (`jira_*`) | `OPS_JIRA_URL`, `OPS_JIRA_EMAIL`, `OPS_JIRA_TOKEN`, `OPS_JIRA_PROJECTS` | Jira tools off |
| k8s queries (`k8s_*`) | `OPS_K8S_CONTEXTS`, `OPS_K8S_SA`, `OPS_K8S_SA_NAMESPACE` | Empty kubeconfig, k8s tools off |
| Host checks (`host_*`) | `OPS_SSH_USER`, `OPS_SSH_ALLOWED_CIDR`, `OPS_SSH_KEY` (+ `OPS_SSH_KNOWN_HOSTS`) | Host tools off |
| Host list | `OPS_SSH_INVENTORY_DIR`, `OPS_SSH_INVENTORY` (ansible inventory) | Write `~/.pacenote/ops-broker/hosts.json` directly |

```sh
# 1) Read-only k8s SA: apply sandbox/k8s/pacenote-ro.yaml to every cluster to query
# 2) Build the broker kubeconfig from the SA tokens (reads the token Secrets with the local admin kubeconfig)
pnpm k8s:kubeconfig
# 3) Build the broker's image with the built-in sandbox (with OPS_TOOLS=on), then start Pace
pnpm bundle && pnpm sandbox:vm
```

In the app, "Rebuild kubeconfig" (Settings > Tools > Broker) and "Set up built-in sandbox" do steps 2 and 3. When the
inventory or an SA token changes, run the matching step and restart Pace.
