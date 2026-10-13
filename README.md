<p align="center">
  <img src="assets/pacenote-icon-256.png" alt="Pacenote" width="96" height="96">
</p>

# Pacenote

[![ci](https://github.com/Ashon/pacenote/actions/workflows/ci.yml/badge.svg?branch=main)](https://github.com/Ashon/pacenote/actions/workflows/ci.yml)
[![e2e coverage](https://img.shields.io/endpoint?url=https%3A%2F%2Fraw.githubusercontent.com%2FAshon%2Fpacenote%2Fbadges%2Fe2e-coverage.json)](https://github.com/Ashon/pacenote/actions/workflows/ci.yml)

**You drive. Pace reads the notes.**

In rallying, the co-driver reads pace notes so the driver can keep their eyes on the road. Pacenote puts Pace in that
seat for your team's Slack: mention `@Pace` in a public channel, and Pace reads the thread, hands the reasoning to a
local `claude` or `codex` CLI on your machine, keeps only what matters now, and answers in the same thread.

Two names, two roles: **Pacenote** is the project and the app; **Pace** is who you talk to, the Slack bot and the
voice of the app.

<picture>
  <source media="(prefers-color-scheme: dark)" srcset="docs/diagrams/architecture-dark.svg">
  <img alt="Slack; Pace on your Mac as four layers (messenger, pipeline, reasoner, sandbox), beside the desktop app, the MCP server and ~/.pacenote; and the built-in sandbox's VMs: the renderer, and the reasoner with its two ways out, the proxy in Pace and ops-broker" src="docs/diagrams/architecture-light.svg">
</picture>

## What it does

- Answers mentions in the thread, with the thread and its attachments (text, images, PDFs) as context.
- Reasons with your own `claude` or `codex` CLI login: on your Mac, reading only a folder you choose, or in a
  disposable Linux VM built into Pacenote that reaches only allowed domains.
- Answers only the people you name, and keeps its own tokens and other secrets out of what it posts.
- Optional ops tools: read-only lookups on servers, k8s clusters and a work directory, GitHub and Jira, and code
  changes as draft PRs, through a broker that keeps credentials out of the reasoner.
- Renders diagrams and charts to images, and keeps a run history with every tool step in the desktop app.
- Connects over Socket Mode, so it needs no public endpoint. A team can share one Slack app through a
  [team hub](docs/team-hub.md), which routes each member's mentions to their own desktop.

## Install

The desktop app installs with Homebrew (macOS 12 or later, Apple silicon or Intel):

```sh
brew tap ashon/tap
brew trust ashon/tap
brew install --cask pacenote
```

Homebrew loads casks only from taps you trust: without `brew trust`, the install is refused and `brew upgrade` skips
Pacenote. An install from before the rename to Pacenote trusted only the old cask name, so run `brew trust ashon/tap`
once there too.

Then:

1. Log in to `claude` or `codex` (0.138 or later) on your Mac.
2. Open Pacenote. In Settings > Messengers > Slack, click "Create the Slack app": Slack opens with Pacenote's
   [manifest](slack-app-manifest.yaml) filled in. Install the app, then save its app token and bot token in Pacenote.
   (On a team with a hub, pair with the hub instead: see [Team hub](docs/team-hub.md).)
3. Under "Who can ask", add your Slack member ID (in Slack: your profile > ⋮ > Copy member ID). Pace answers no one
   until you name who may ask, or let anyone in your workspace ask.
4. Choose where answers run, in Settings > Sandbox > Run environment:
   - **On this Mac** (the default): the CLI runs with your login and reads only the reference directory set in
     Settings > Answers, never its `.env` files, Pacenote's folder or the usual credential folders.
   - **Built-in sandbox**: a lightweight Linux VM for each answer, reaching only allowed domains, with nothing to
     install (Apple silicon, macOS 15 or later). Run "Set up built-in sandbox" in Settings > Sandbox.

   Ops tools need the built-in sandbox, and diagrams its setup in either run environment.
5. Invite `@Pace` to a public channel and mention it.

`brew upgrade --cask pacenote` updates the app. Config and run history live in `~/.pacenote` and are kept across
upgrades and uninstalls. To run from source instead, see [Installation](docs/installation.md).

## Documentation

| Doc | What it covers |
| --- | --- |
| [Architecture](docs/architecture.md) | The design in six diagrams: the pieces, one mention, your tasks and AI tools, the team hub, the layers, the code layout |
| [How it works](docs/how-it-works.md) | The path from a mention to its answer, attachments, diagrams and images, the reasoner CLIs |
| [Reasoner sandbox](docs/sandbox.md) | Where answers run: on this Mac and what the CLI may read there, or the built-in VM sandbox, with its way out, allowed domains and login |
| [Ops tools](docs/ops-tools.md) | ops-broker: hosts, k8s, work directory, GitHub, Jira, and code changes as draft PRs |
| [Team hub](docs/team-hub.md) | One Slack app for a team, with each member's desktop answering their own mentions |
| [Run history for AI tools](docs/history-mcp.md) | Pacenote's MCP server: Claude Code, Codex and other tools on your Mac reading what Pace did |
| [Your tasks from Slack](docs/tasks.md) | What people asked of you, collected by Claude Code or Codex with its Slack connector, on the Todo screen |
| [Installation](docs/installation.md) | Homebrew in detail, running from source, restarts and the run lock |
| [Desktop app](docs/desktop-app.md) | The app's screens, bot management, settings, sandbox controls, packaging |
| [Development](docs/development.md) | Checks, end-to-end tests and coverage, adding a messenger |
| [Releases](docs/releases) | Release notes |

## Development

```sh
pnpm install
pnpm check      # typecheck, lint, format, unit tests
pnpm test:e2e   # the bot and the hub against a local Slack stand-in
pnpm desktop    # the desktop app from source
```

See [Development](docs/development.md) for more.
