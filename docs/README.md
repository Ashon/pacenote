# Pacenote docs

Start with the [project README](../README.md) for what Pacenote is and how to install it.

- [Architecture](architecture.md): the design in seven diagrams: the pieces, one mention, your tasks and AI tools, a
  task's trajectory, the team hub, the layers (messenger, reasoner, sandbox), the code layout
- [How it works](how-it-works.md): the path from a mention to its answer, attachments, diagrams and images, the reasoner CLIs
- [Reasoner sandbox](sandbox.md): where answers run: on this Mac and what the CLI may read there, or the built-in VM sandbox
  with its egress proxy, allowed domains and login
- [Tools](ops-tools.md): connections through the ops broker (hosts, k8s, the work folder, GitHub, Jira), each with a Read and, where Pace can change something, a Write switch
- [Team hub](team-hub.md): one Slack app for a team, with each member's desktop answering their own mentions
- [Run history for AI tools](history-mcp.md): Pacenote's MCP server, for Claude Code, Codex and other tools on your Mac to
  read what Pace did
- [Your tasks from Slack](tasks.md): what people asked of you, collected by your AI tool over MCP, on the Todo screen
- [Where you contribute](you.md): your areas, how you contribute to each and what is going on there, on the You screen
- [Recap](recap.md): what you did in a day, a week or a month, written up on a click and copied as a standup or update
- [Installation](installation.md): Homebrew in detail, running from source, restarts and the run lock
- [Settings file](settings.md): `~/.pacenote/settings.json`, every setting's place, and environment variables over it
- [Desktop app](desktop-app.md): the app's screens, bot management, settings, sandbox controls, packaging
- [Development](development.md): checks, end-to-end tests and coverage, adding a messenger
- [Releases](releases): release notes, with their Korean in `releases/ko` from v0.6.11
- [Guide](guide) and [news](news): pacenote.dev's guide and feature posts in English and Korean, made into pages with
  the release notes ([Development](development.md#pacenotedev))
