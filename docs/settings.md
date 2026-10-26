# Settings file

Pacenote keeps its settings in one file, `~/.pacenote/settings.json` (`PACENOTE_HOME` changes the folder). The desktop
app's Settings screen writes it; the bot, the MCP server and the sandbox jobs read it, from the app or a terminal alike.
It holds the Slack tokens and logins, so it is kept to your account (600).

```json
{
  "slack": { "botToken": "xoxb-...", "appToken": "xapp-...", "memberId": "U..." },
  "answers": { "reasoner": "claude" },
  "sandbox": { "runIn": "vm" },
  "tasks": { "enabled": true, "linkSessions": true }
}
```

- Settings are grouped as the Settings screen groups them. A switch is `true` or `false`, a number is a number, and a
  list is a list (`["acme", "tools"]`). A setting left out, empty or `null` takes its default.
- Saving from the app changes only what changed and keeps entries it does not know.
- A file that is not valid JSON is not read: Pace does not start, and the Settings screen says why and saves nothing
  over it.

## Environment variables

Each setting also has a variable name, which Pace reads it by. A variable set in the environment Pacenote starts in
wins over the file, and the Settings screen marks the setting. This is for development and tests; the screen never
shows the names.

Settings without a place of their own go under `env`, by variable name:

```json
{ "env": { "SLACK_API_URL": "https://slack-gov.com/api/", "CLAUDE_BIN": "/opt/homebrew/bin/claude" } }
```

| Path | Variable | Default | What |
| --- | --- | --- | --- |
| `dataDir` | `PACENOTE_DATA_DIR` | `~/.pacenote` | Run history, status and logs. Relaunch the app after changing it |
| `env.SLACK_API_URL` | `SLACK_API_URL` | `https://slack.com/api/` | Your own app's Slack Web API; `https://slack-gov.com/api/` for GovSlack |
| `env.CLAUDE_BIN`, `env.CODEX_BIN` | `CLAUDE_BIN`, `CODEX_BIN` | `claude`, `codex` | The CLIs run on this Mac |

## From .env

Earlier versions kept settings in `~/.pacenote/.env`. The first start of the app or the bot moves them into
`settings.json` once and keeps the old file as `.env.bak`; until then, every reader still finds them in `.env`. On the
way, `REASONER_SANDBOX=docker` becomes the built-in sandbox and `MENTION_ANYONE` is dropped. A `.env` written after the
move is not read.

## Reference

Each table is one group of the file. Select values are in the last column; the Settings screen explains each one.

### slack

| Path | Variable | Default | On the screen |
| --- | --- | --- | --- |
| `slack.connection` | `SLACK_CONNECTION` | `app` | Connection: `app` (your own Slack app) or `hub` (team hub) |
| `slack.hub.url` | `HUB_URL` | | Hub URL |
| `slack.hub.token` | `HUB_TOKEN` | | Hub token, saved by pairing |
| `slack.appToken` | `SLACK_APP_TOKEN` | | App token |
| `slack.botToken` | `SLACK_BOT_TOKEN` | | Bot token |
| `slack.memberId` | `MENTION_ALLOWED_USERS` | | Your Slack member ID: Pace answers only you |
| `slack.clientPingTimeoutMs` | `SOCKET_CLIENT_PING_TIMEOUT_MS` | `5000` | Client ping timeout (ms) |
| `slack.serverPingTimeoutMs` | `SOCKET_SERVER_PING_TIMEOUT_MS` | `30000` | Server ping timeout (ms) |

### answers

| Path | Variable | Default | On the screen |
| --- | --- | --- | --- |
| `answers.reasoner` | `REASONER` | `claude` | Reasoner CLI: `claude` or `codex` |
| `answers.model` | `REASONER_MODEL` | | Model |
| `answers.timeoutSec` | `REASONER_TIMEOUT_SEC` | `900` | Timeout (seconds) |
| `answers.concurrency` | `MENTION_CONCURRENCY` | `2` | Concurrent requests |
| `answers.timeZone` | `TIMEZONE` | this Mac's | Time zone |
| `answers.referenceDir` | `MENTION_WORKSPACE` | | Tools > Reference folder |
| `answers.notesLanguage` | `NOTES_LANGUAGE` | `app` | Pace's own notes: `app` (the app's language), `en` or `ko`, the language of what Pace posts itself (the line under answers, notes only the asker sees, failure replies); answers follow the request ([Languages](i18n.md)) |
| `answers.diagrams` | `RENDER_DIAGRAMS` | `true` | Render diagrams |
| `answers.imageMaxPx` | `GENERATED_IMAGE_MAX_PX` | `512` | Generated image max size (px) |

### sandbox

| Path | Variable | Default | On the screen |
| --- | --- | --- | --- |
| `sandbox.runIn` | `REASONER_SANDBOX` | `none` | Run environment: `vm` (built-in sandbox) or `none` (on this Mac) |
| `sandbox.memory` | `SANDBOX_MEMORY` | `2g` | Memory limit |
| `sandbox.cpus` | `SANDBOX_CPUS` | `2` | CPU limit |
| `sandbox.claudeToken` | `SANDBOX_CLAUDE_OAUTH_TOKEN` | | claude token from `claude setup-token`, read only while Claude is not signed in inside the sandbox, and removed once it is; going away (advanced, shown only while set) |
| `sandbox.anthropicApiKey` | `SANDBOX_ANTHROPIC_API_KEY` | | Anthropic API key, instead of signing in (advanced) |

### ops

| Path | Variable | Default | On the screen |
| --- | --- | --- | --- |
| `ops.enabled` | `OPS_TOOLS` | `false` | Use connections |
| `ops.read.files` | `OPS_FS_READ` | `true` | Work folder: Read |
| `ops.read.github` | `OPS_GIT_READ` | `true` | GitHub: Read |
| `ops.write.github` | `OPS_GIT_WRITE` | `false` | GitHub: Write (draft PRs) |
| `ops.read.jira` | `OPS_JIRA_READ` | `true` | Jira: Read |
| `ops.write.jira` | `OPS_JIRA_WRITE` | `false` | Jira: Write (issues and comments) |
| `ops.read.kubernetes` | `OPS_K8S_READ` | `true` | Kubernetes: Read |
| `ops.read.ssh` | `OPS_SSH_READ` | `true` | SSH hosts: Read |
| `ops.workDir` | `OPS_FS_ROOT` | | Work directory |
| `ops.github.owners` | `OPS_GIT_ALLOWED_OWNERS` | | Allowed GitHub orgs (list) |
| `ops.github.authorName` | `OPS_GIT_AUTHOR_NAME` | | PR commit author name |
| `ops.github.authorEmail` | `OPS_GIT_AUTHOR_EMAIL` | | PR commit author email |
| `ops.jira.url` | `OPS_JIRA_URL` | | Jira URL |
| `ops.jira.email` | `OPS_JIRA_EMAIL` | | Jira account email |
| `ops.jira.token` | `OPS_JIRA_TOKEN` | | Jira API token |
| `ops.jira.projects` | `OPS_JIRA_PROJECTS` | | Allowed Jira projects (list) |
| `ops.kubernetes.contexts` | `OPS_K8S_CONTEXTS` | | k8s contexts (list) |
| `ops.kubernetes.serviceAccount` | `OPS_K8S_SA` | `pacenote-ro` | k8s read-only account |
| `ops.kubernetes.namespace` | `OPS_K8S_SA_NAMESPACE` | `pacenote` | k8s read-only account namespace |
| `ops.ssh.user` | `OPS_SSH_USER` | | SSH user |
| `ops.ssh.allowedRange` | `OPS_SSH_ALLOWED_CIDR` | | Allowed SSH range |
| `ops.ssh.key` | `OPS_SSH_KEY` | | SSH key path |
| `ops.ssh.knownHosts` | `OPS_SSH_KNOWN_HOSTS` | | SSH known_hosts path |
| `ops.ssh.inventoryDir` | `OPS_SSH_INVENTORY_DIR` | | Inventory directory |
| `ops.ssh.inventory` | `OPS_SSH_INVENTORY` | | Inventory file |

### tasks

| Path | Variable | Default | On the screen |
| --- | --- | --- | --- |
| `tasks.enabled` | `TASKS` | `false` | Gather my tasks from Slack |
| `tasks.dms` | `TASKS_DMS` | `false` | Count DMs and group DMs |
| `tasks.leaveOutChannels` | `TASKS_EXCLUDE_CHANNELS` | | Leave out channels (list) |
| `tasks.yourNames` | `TASKS_NAMES` | | Other names people call you (list) |
| `tasks.yourGroups` | `TASKS_GROUPS` | | Groups that mean you (list) |
| `tasks.openIn` | `TASKS_CLI` | `claude` | Open code tasks in: `claude`, `codex` or `opencode` |
| `tasks.sessionsIn` | `TASKS_OPEN_IN` | `terminal` | Open sessions in: `terminal` or `app` (the Claude app, the Codex app) |
| `tasks.terminal` | `TASKS_TERMINAL` | `auto` | Terminal: `auto`, `terminal`, `iterm` or `ghostty` |
| `tasks.planFirst` | `TASKS_PLAN_FIRST` | `true` | Start with a plan |
| `tasks.linkSessions` | `TASKS_LINK_SESSIONS` | `false` | Show sessions you start yourself |
| `tasks.suggestDone` | `TASKS_SUGGEST_DONE` | `false` | Say when a task looks done |

### history

| Path | Variable | Default | On the screen |
| --- | --- | --- | --- |
| `history.enabled` | `HISTORY` | `true` | Record runs |
| `history.retentionDays` | `HISTORY_RETENTION_DAYS` | `30` | History retention (days), 0 keeps them |
| `history.shareWithAiTools` | `HISTORY_SHARE` | `false` | Share with AI tools |

### logs

| Path | Variable | Default | On the screen |
| --- | --- | --- | --- |
| `logs.level` | `LOG_LEVEL` | `info` | Log level: `debug`, `info`, `warn` or `error` |
| `logs.pingPong` | `SOCKET_PING_PONG_LOG` | `false` | Ping/pong log |
