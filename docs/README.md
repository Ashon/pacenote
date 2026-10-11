# Pacenote docs

Start with the [project README](../README.md) for what Pacenote is and how to install it.

- [Architecture](architecture.md): the design in five diagrams: the pieces, one mention, the team hub, the layers
  (messenger, reasoner, sandbox), the code layout
- [How it works](how-it-works.md): the path from a mention to its answer, attachments, diagrams and images, the reasoner CLIs
- [Reasoner sandbox](sandbox.md): the Docker sandbox, the egress proxy and allowed domains, the sandbox's claude or codex login
- [Ops tools](ops-tools.md): ops-broker for hosts, k8s, the work directory, GitHub and Jira, and code changes as draft PRs
- [Team hub](team-hub.md): one Slack app for a team, with each member's desktop answering their own mentions
- [Run history for AI tools](history-mcp.md): Pacenote's MCP server, for Claude Code, Codex and other tools on your Mac to
  read what Pace did
- [Your tasks from Slack](tasks.md): what people asked of you, collected by your AI tool over MCP, on the Todo screen
- [Installation](installation.md): Homebrew in detail, running from source, restarts and the run lock
- [Desktop app](desktop-app.md): the app's screens, bot management, settings, sandbox controls, packaging
- [Development](development.md): checks, end-to-end tests and coverage, adding a messenger
- [Releases](releases): release notes
