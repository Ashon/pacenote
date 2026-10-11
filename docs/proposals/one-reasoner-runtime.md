# Proposal: one reasoner runtime, for answers and for tasks

Status: phase 1 built (2026-10-11), not yet released: collections are runs, Runs lists every job, Todo comes before it.
Phase 2 and 3 are not started. It builds on [your own tasks](personal-tasks.md) and changes how a collection runs and is
recorded, not what it collects or how it reads Slack.
Storyboard: the "Pacenote one runtime storyboard" canvas.

## What changes, and what stays

| | Today | After |
| --- | --- | --- |
| Running a collection | `TaskCollector` builds its own `claude` command and parses its output | The same runner as answers, under a profile of its own (phase 2) |
| Its record | A summary in `tasks-collections.json` | A run, with what it looked up and what `add_tasks` answered (phase 1) |
| Runs | Answers to mentions | Every job Pacenote ran, each saying what it was, with a detail that fits it (phase 1) |
| Sidebar | Overview, Runs, Tasks, Pace | Overview, Todo (Tasks renamed), Runs, Pace (phase 1) |
| The model | claude only | The primary reasoner (`REASONER`); codex collects when it has a Slack connector (phase 2) |
| When | Collect now | Collect now, and on a schedule (phase 2) |
| Sources | Slack | Slack, then others (phase 3) |

What stays: Pace receives mentions with its bot token (or through the team hub), a collection reads Slack through the
AI tool's own connector, Pacenote holds no Slack token for tasks, and a collection with claude reads Slack as it does
now. For someone who uses claude only, the visible change is phase 1.

## Why

Pacenote runs a model in two places, and they grew apart. Answering a mention goes through the reasoner layer
(`src/reasoners`, `src/sandbox`) and into the run history. Collect now on the Tasks screen spawns `claude` from the
desktop app, reads its output with a parser of its own, and keeps a log of its own. Two ways to call the same CLI mean two
places to fix, two token counts to keep in step, and a collection you cannot open the way you open a run.

People also use more than one AI service, and Pacenote already has one setting for the model it uses (Settings >
Reasoner, `REASONER`: claude or codex). Only answers follow it. Collections are Claude Code only, because they read Slack
through the claude.ai Slack connector. The work should go to the person's primary reasoner, whichever it is.

## Where things stand

| | Answering a mention (Runs) | Collect now (Tasks) |
| --- | --- | --- |
| Started by | Anyone who mentions Pace | You, on the Tasks screen |
| Runs in | The bot process: `CliReasoner` with a `CliAdapter`, in a `Sandbox` | The desktop app's main process: `TaskCollector` spawns `claude` |
| Reasoner | `REASONER` (claude or codex) | claude only |
| Sandbox | Docker by default, or your Mac | Your Mac |
| Slack | The bot token reads the thread, which goes into the prompt | The claude.ai Slack connector, as you |
| The CLI's own settings | None: `--setting-sources ''`, `--strict-mcp-config` | Project only (there are none), so the claude.ai connectors load |
| Permissions | `dontAsk` with an allowlist (ops tools through the broker) | `default` with an allowlist; Slack writes denied |
| Output | `claudeLineToEvents` or `codexLineToEvents`, into run events | `CollectStream`, its own parser |
| Record | `runs/<day>/<id>/run.json`: the timeline and tokens | `tasks-collections.json`: the outcome, lookups and tokens |
| Where you see it | Runs, Overview | Recent collections on Tasks, Overview |

## Two Slack identities, as today

Pacenote meets Slack as two identities, and each does what the other cannot:

| | Pace's own (the bot) | Yours, through your AI tool |
| --- | --- | --- |
| What it does | Receives mentions (Socket Mode), reads the thread it is called in, replies | Reads Slack as you while a collection runs: search, your DMs if they count, channels you are in |
| How it is connected | Your Slack app's bot and app tokens in Settings, or pairing with the team hub (the desktop then holds no Slack token) | A connector you authorize in the AI service (claude.ai > Settings > Connectors); Pacenote holds no token |
| Needed for | Answering mentions | Collecting tasks; it works without Pace's Slack connection |

A connector cannot receive events (the model pulls from it during a session), and the bot token cannot search or read
as you, so neither replaces the other. Three things follow:

- **An answer reads only what the bot token reaches.** A question like "what did they tell me in a DM?" would be easier
  with the connector, but it would open the operator's private messages to anyone who can mention Pace.
- **When a feature ties the two, they must be the same person and workspace.** A daily summary Pace sends you in a DM,
  or "@Pace remind me to ...", relate the bot's workspace and user to the connector's. A collection records the team and
  user its connector read as, and Settings says so when they differ from Pace's.
- **Two apps to approve.** A workspace can allow Pacenote's app and block the AI tool's connector, or the other way
  round; another primary reasoner brings another connector to approve. Settings > Todo says which one is missing.

## Whom the work is for

A mention runs on the operator's login for whoever sent it, and anyone in the channel can send one. It must never reach
the operator's own connectors, DMs or settings, which is why answers load nothing of the CLI's own. A collection runs
for the operator and reads Slack as the operator: it needs exactly what an answer must not have.

So the runtime becomes one, and each job says whom it works for. That is a property of the job (its profile), not of
which process runs it, and it is decided in one place.

## Design

### One job, two profiles

A job is one call of the reasoner: what to ask, under which profile, and where to record it.

| Profile | For | The CLI's own connectors | Tools | Sandbox |
| --- | --- | --- | --- | --- |
| `mention` | Whoever mentioned Pace | None | Reading files, ops tools through the broker (as today) | `REASONER_SANDBOX` |
| `collection` | You | A source connector's read tools only, by allowlist; its write tools denied | Pacenote's task tools | Your Mac (the connectors live in your login) |

Each `CliAdapter` builds its invocation from the profile. For claude, `mention` keeps today's flags, and `collection`
takes what `collectCommand` has now: `--setting-sources project`, `--mcp-config` with Pacenote's server, `--tools
ToolSearch`, and the allow and deny lists. `CliReasoner` runs both. `TaskCollector` keeps one collection at a time, Stop and
the 10-minute limit, and hands the run itself to `CliReasoner`.

### One record, a view for each kind

Underneath, a collection is a run. `RunRecord` gains `kind: 'mention' | 'collection'`, and a collection's origin is the
app (`trigger: 'now'`, later `'schedule'`) instead of a message. Its events come from the same parser as an answer's: the
lookups, the tasks added and the tokens are read from them, `CollectStream` goes, and the outcome comes from the record.
`tasks-collections.json` is read into runs once (or read until its 90 days pass) and no longer written. A collection
keeps less than an answer does: see Privacy.

On screen, the kinds stay apart, each shown in its own terms:

- **Runs is the log of the jobs Pacenote ran.** Each item says what the job was: a mention ("@Mina in #platform", with
  the request as its title) or a task collection ("Collect now", with its outcome as the title: "Added 2 tasks and 1
  Maybe", "Nothing new", or why it stopped). It filters by kind (All, Mentions, Task collections).
- **The detail fits the kind.** A mention keeps the timeline: the request, the steps, Pace's reply. A collection has no
  chat bubbles: how it started, what it added (each a link to the task), its lookups (which tool, when, how long), and
  its tokens.
- **Todo shows collections as part of your to-dos.** Recent collections stays where it is, and a row opens that
  collection's run.
- **The sidebar reads Overview, Todo, Runs, Pace.** The Tasks screen becomes Todo, above Runs: what you have to do, apart
  from the jobs Pacenote ran. Settings > Tasks becomes Settings > Todo. The MCP tools and files keep their names
  (`my_tasks`, `add_tasks`, `tasks.json`), so no AI tool has to add Pacenote again.
- **The rest counts by kind,** as now: Overview's tokens per day (mentions at the bottom of a bar, collections on top),
  and the status bar's work in progress ("N active" for mentions, "Collecting tasks").

### One primary reasoner

`REASONER` becomes the primary reasoner for everything Pacenote asks a model to do. Settings > Reasoner says so, and
Settings > Todo shows whether the primary reasoner can collect (it has a source connector Pacenote can use) and what to
set up when it cannot.

### Where jobs run

Phase 2 puts the runner where it can serve both, and where a schedule can live. Today the app has no channel to the bot
(it reads `bot.json`), and a schedule needs a process that is up when the window is closed. Two options, to decide in
phase 2:

- The bot runs collections, and the app asks it through a request file in the data folder or a local socket.
- Either process may run a job, with a lock in the data folder so only one collection runs at a time.

## Reading sources when the primary is not Claude

The model is not the hard part; reading Slack as you is. v0.4.0 read Slack with a user token of Pacenote's, and v0.4.1
moved to the AI tool's own connector so that Pacenote holds no Slack token
([why](personal-tasks.md#why-the-connector-not-a-token-of-pacenotes-v041)). Two ways make collecting work for any
primary:

**A. The primary's own connector (start here).** Pacenote still holds no token. For each reasoner it knows how to find a
Slack connector and which of its tools only read: the claude.ai Slack connector for claude (as today), and for codex a
Slack connector or MCP server that Codex has. A collection runs when the primary has one; Settings > Todo says what to
add when it does not.

- Tool names differ per connector, so the read-only allowlist is per connector, and a connector Pacenote does not know
  is not used.
- Whether `codex exec` can limit an MCP server to listed tools is to be checked. If it cannot, Pacenote's server can sit in
  front of it and pass on only the read tools.

**B. A source connector of Pacenote's.** Pacenote reads Slack with a read-only user token and offers the reads as tools on
its own MCP server, the same for every reasoner. One read-only implementation for any primary, and the shape other
sources (mail, calendar, issue trackers) would take anyway.

- The v0.4.0 setup comes back (user scopes, a reinstall, the token in the Keychain), unless the team hub does the OAuth
  with its Slack app.
- The promise in Settings ("Pacenote holds no Slack token for this") changes, and so does the team hub's rule that
  desktops hold no Slack token, for user tokens.
- More code to keep: reading history and filtering, which v0.4.1 removed.

Start with A. Take up B when a source has no connector in the tools people use, or when enough people cannot use the
connector (workspace policy).

## Privacy

- A collection's lookups return your DMs and private channels. Its run keeps the tool calls (which tool, when, how long)
  but not what the source returned, and the run history MCP gives out no more of it than those calls and the outcome.
- The messages go to the primary reasoner's provider, as with anything that tool reads. Settings > Todo names the
  provider.
- Only the `collection` profile loads connectors, only with an allowlist of read tools, and a mention never runs under it.
- Phase 1 keeps collections out of the run history MCP altogether, until what it may give out of them is settled.

## Phases

| Phase | Scope |
| --- | --- |
| 1 | One record: collections become runs (kind, origin, events from the shared parser, source results left out); Runs as the job log, each item saying what it was, a filter by kind and a detail for each kind; Overview and Recent collections read runs; the old log read in once |
| 2 | One runner and the primary reasoner: profiles in `CliAdapter`, `TaskCollector` on `CliReasoner`, Tasks follow `REASONER`, codex collects when it has a Slack connector (A); where jobs run, then the schedule |
| 3 | Sources: a source layer for Tasks beyond Slack, with B where A cannot cover a source |

Phase 1 changes nothing about who runs a collection or how; it can ship on its own.

## Risks

- **A profile mix-up** would hand a mention the operator's connectors. The profile follows from who starts the job (the
  mention pipeline can only start `mention`), and tests check each profile's flags.
- **Moving the log** loses nothing: the old log is read until its entries age out.
- **Codex parity.** A codex collection depends on a connector Pacenote does not control, and quality can differ by
  model; the dismiss rate shows it.
- **More runs.** Collections join the run list; each item says what it was, and the Mentions filter shows the list as it
  was.

## Still open

- Phase 2: the bot runs collections (request file or socket), or a shared runner with a lock.
- Whether a collection's run keeps the queries it searched for: useful for tuning the rules, but they can name people.
- Whether `codex exec` can limit an MCP server's tools, and which Slack connectors Codex users have.
- One primary for everything, or a separate one for Tasks (a cheaper model for collections).
