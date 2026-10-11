# Run history for AI tools (MCP)

Pacenote records each mention Pace answered: the request and where it came from, every tool call with its result, and the
answer. With **Settings > History & logs > Share with AI tools** on, the other AI tools on your Mac (Claude Code, Codex and
anything else that speaks MCP) can read that history through Pacenote's MCP server, and pick up where Pace left off: "what did
Pace find about web-01 this morning?", or the background of a draft PR Pace opened.

Pacenote only offers its own history. Which tools use it is up to you: Pacenote adds itself to a tool only when you click
Add for that tool.

## Adding it to a tool

Turn on **Share with AI tools** (or, for your tasks, Settings > Todo > Gather my tasks from Slack). The same settings card then
lists Claude Code and Codex, each with its state and one button:

| State | What it means | Button |
| --- | --- | --- |
| Not added | The tool does not have Pacenote | Add |
| Connected | The tool has this app's server, and it answers | Remove |
| Runs another Pacenote | The tool has a server from a moved app or a dev build | Use this app |
| Does not reach Pacenote | The tool has this app's server, but it does not start or answer | Add again |
| Not installed | The tool's CLI is not on the PATH | |

The buttons run the tools' own CLIs: `claude mcp add-json --scope user` (after `claude mcp remove`, since Claude Code does not
replace a server of the same name) and `codex mcp add`, so every project has the server. To check, Pacenote asks Claude Code
(`claude mcp get pacenote`, which starts the server), and for Codex starts the server Codex has registered and lists its tools
over MCP. Check again runs them once more.

To add it by hand instead, **Add it by hand** under the list shows the commands, filled in with the paths of the app you are
running:

```sh
# Claude Code
claude mcp add pacenote --scope user --env ELECTRON_RUN_AS_NODE=1 -- \
  '/Applications/Pacenote.app/Contents/MacOS/Pacenote' \
  '/Applications/Pacenote.app/Contents/Resources/app/tools/history-mcp.mjs'
```

```toml
# Codex: ~/.codex/config.toml
[mcp_servers.pacenote]
command = "/Applications/Pacenote.app/Contents/MacOS/Pacenote"
args = ["/Applications/Pacenote.app/Contents/Resources/app/tools/history-mcp.mjs"]
env = { ELECTRON_RUN_AS_NODE = "1" }
```

The server runs with the app's own Node (`ELECTRON_RUN_AS_NODE=1`), so no Node install is needed, and the tool starts it only
when it needs it (stdio, no port). Pacenote does not need to be running.

## Tools

| Tool | What it returns |
| --- | --- |
| `recent_runs` | The latest runs, newest first: id, status, when, channel, requester, the request, the reasoner, how many tools it used. `limit` (default 10, at most 50), `status` |
| `search_runs` | Runs whose request, channel, requester, answer or error contains `query`. `status`, `since` (ISO 8601), `limit` |
| `get_run` | One run in full: the request and its Slack link, each tool call and command with its result (cut to 1500 characters), the answer or error (and its cause, such as `auth` or `limit`), outputs, token use. `include_prompt` adds the prompt Pace sent to the reasoner |
| `collect_context`, `add_tasks`, `close_task`, `my_tasks` | Your tasks from Slack, collected by the tool with its own Slack connector: see [Your tasks from Slack](tasks.md). These answer only while Settings > Todo > Gather my tasks from Slack is on, separately from sharing the run history, and `add_tasks` and `close_task` write |

The run tools are read-only. The history is the one the desktop app shows (`PACENOTE_DATA_DIR`, by default `~/.pacenote`).

## Privacy and safety

- **Off by default.** The switch is read from the settings file on every call, so turning it off stops the tools at once, even
  in a session that already started the server. While it is off, every call answers with how to turn it on.
- **Secrets are redacted** in everything the tools return, with the same patterns as the ops tools' output (tokens, keys,
  passwords). The history can still hold your team's Slack messages and what the tools saw, such as logs and file contents,
  so share it only with tools you would show that to.
- **Run content is data.** Requests come from Slack users and results from tools, so a run can contain text that reads like an
  instruction. The server says so in its instructions and in every result, for the tool's model to treat it as data.
- **Local only.** The server talks to the tool that started it over stdio. It opens no port and sends nothing anywhere.

## From the repository

`pnpm mcp` runs the server from source (`src/tools/history-mcp.ts`). `pnpm bundle` builds `build/tools/history-mcp.mjs`,
which a development run's settings card points to. `HISTORY_SHARE` set in the environment at launch overrides the settings
file.
