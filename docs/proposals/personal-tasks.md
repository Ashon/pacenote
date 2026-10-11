# Proposal: your own tasks, gathered from Slack

Status: proposal, not scheduled (2026-10-11). Kept for review; nothing here is built.

## Why

Pace reads the pace notes so the driver keeps their eyes on the road. Today that means answering when someone mentions
Pace. The same idea turned toward the person who runs Pacenote: read the channels for what they owe other people
(a question waiting for them, a request, a "can you take a look", something they said they would do), so they do not
have to keep it in their head or scroll back to find it.

## What it would do

1. **Collect.** With a Slack user token, search recent messages: ones that mention you, threads you took part in whose
   last word is not yours, and, if you turn it on, your DMs.
2. **Extract.** Hand those messages to the reasoner (claude or codex) to pick out what is a task for you: who asked, what,
   any hint of a due date, a link to the message, and how sure it is. It answers in JSON.
3. **Keep.** Store tasks in `PACENOTE_DATA_DIR/tasks.json`, one per source message, so a message is never a task twice.
4. **Show.** A Tasks screen in the app, an MCP tool for Claude Code and Codex, and a short summary Pace sends you in a DM.

## Decided so far

| Question | Answer |
| --- | --- |
| Where to look | Public and private channels you are in, by default. DMs only when you turn them on. |
| Where tasks show | The Tasks screen, an MCP tool, and a summary in your DM with Pace |
| When to collect | Not decided (see open questions) |

## Design

**Slack app.** User token scopes on the same app, added to the manifest as optional: `search:read` (find the messages),
`channels:history` and `groups:history` (read a thread for context), `im:history` and `mpim:history` (only for the DM
option), `users:read`. Reinstalling the app shows a User OAuth Token (`xoxp-`), saved as `SLACK_USER_TOKEN` like the
other secrets. Sending the summary to your DM needs the bot scope `im:write` (to open the DM) besides `chat:write`.

**Where things run.** The Slack calls run in the bot process on your Mac, never in the sandbox. The reasoner gets only the
collected text, with the same rule as attachments: content is data, not instructions. The user token never reaches the
reasoner.

**Collection.** Slack search first (mentions of you, `in:@you` for DMs when on, the last N days), then the threads around
hits. Only what is new since the last collection goes to the reasoner, to keep quota use small.

**A task.** `{ id, title, detail, askedBy, channel, permalink, due?, confidence, status: open | done | dismissed, seenAt }`.

**Keeping the list short.** A second inbox that fills with wrong guesses adds load instead of removing it, so:

- every task links to its message, and has one-click Done and Dismiss;
- a task closes by itself when you reply after it in the thread, or when someone marks it ✅;
- low-confidence guesses are hidden behind a "maybe" filter;
- old open tasks fade out after a while (a setting, default 14 days).

**MCP.** `my_tasks` (open tasks, with links and context) next to the run history tools, read-only at first; marking done
from a tool can come later.

**Summary.** Once a day, Pace sends you a DM: the open tasks, newest first, each with its link. Nothing goes to channels.

## Risks

- **Trust boundary.** Pace reads only threads it is mentioned in today, in public channels, with a bot token; the manifest
  says it uses no user token and no DM scopes. A user token sees everything you can see. This must stay off by default,
  with the reach spelled out where it is turned on.
- **Where the text goes.** Extraction sends message text, DMs included when that is on, to the reasoner's provider
  (Anthropic or OpenAI).
- **Noise.** Guessing tasks from chat is imprecise; the measures above are what keep it useful.
- **Quota.** Each collection uses the reasoner. Search filtering and only-new-messages keep it small.
- **Workspace policy.** Some workspaces restrict user tokens or these scopes; the feature then stays off.
- **Team hub.** Each member would need their own user token, which means an OAuth flow on the hub. Personal setups first.

## Phases

| Phase | Scope |
| --- | --- |
| 0 | "Collect now" on demand, `search:read` only, last 7 days, the Tasks screen, `my_tasks` over MCP |
| 1 | Collecting on a schedule, closing tasks by themselves, the daily DM summary |
| 2 | Team hub support, sending tasks to Linear, Jira or Reminders |

## Open questions

- When to collect: on demand first, or on a schedule from the start, and how often (30 minutes was suggested)?
- When the daily summary goes out (a morning hour?), and whether it should skip days with nothing open.
- How long done and dismissed tasks are kept.
- Whether you can add a task by mentioning Pace ("@Pace remind me to ..."), so tasks are not only guessed.
