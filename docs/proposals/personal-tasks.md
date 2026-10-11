# Proposal: your own tasks, gathered from Slack

Status: phase 0 in progress (plan finalized 2026-10-11). Storyboard: the "Pacenote personal tasks storyboard" canvas.

## Why

Pace reads the pace notes so the driver keeps their eyes on the road. Today that means answering when someone mentions
Pace. The same idea turned toward the person who runs Pacenote: read the channels for what they owe other people
(a question waiting for them, a request, a "can you take a look", something they said they would do), so they do not
have to keep it in their head or scroll back to find it.

## What it does

1. **Collect.** With a Slack user token, read the last 7 days (later: only what is new) of the conversations you are in,
   and keep on this Mac the messages that mention you and the threads you took part in, plus your DMs if you turn them on.
2. **Extract.** Hand those messages to the reasoner (claude or codex), with no tools, to pick out what is a task for you:
   who asked, what, any hint of a due date, why it is a task, and how sure it is. It answers in JSON.
3. **Keep.** Store tasks in `PACENOTE_DATA_DIR/tasks.json`, one per source message, so a message is never a task twice.
4. **Show.** A Tasks screen in the app and an MCP tool for Claude Code and Codex; later, a short summary Pace sends you
   in a DM.

## Decided

| Question | Answer |
| --- | --- |
| Where to look | Public and private channels you are in, by default. DMs and group DMs only when you turn them on. Channels can be left out. |
| Where tasks show | The Tasks screen and the `my_tasks` MCP tool; the daily DM summary in phase 1 |
| How to read Slack | Conversation history of the conversations you are in (`users.conversations`, `conversations.history`, `conversations.replies`), filtered on this Mac. Slack search (`search:read`) is not used: matching a mention in a query is not documented, it returns one match for messages close together, and Enterprise Grid may restrict it. |
| When to collect | Phase 0: when you choose Collect now |
| Precision | When unsure, it is a Maybe, not a task (below) |

## Precision first

A list that fills with wrong guesses adds load instead of removing it, and dismissing is itself a small chore. So the
first lever is picking fewer, better tasks; Dismiss is the safety net.

- **A task**: someone asked you by name (a mention, or a DM when that is on), or you said you would do something.
- **A Maybe**: an `@here` or `@channel`, "someone should look at this", or anything the reasoner is not sure about.
  Maybes stay out of the list and `my_tasks` until you keep one.
- **Nothing**: an FYI, a thanks, something already answered or done in the thread.
- A task **closes by itself** when you reply in its thread after it, or when its message gets a ✅ (white_check_mark).

## Dismissing cheaply, and learning from it

- Done and Dismiss are one click. Dismiss can carry a reason: not for me, already done, not worth it.
- After three "not for me" dismissals from the same channel in two weeks, the screen offers once to leave that channel out.
- **Dismiss rate**: the share of collected tasks you dismissed. Above about 30%, the rules are too loose. The Tasks screen
  shows it under Done; later it joins the answers' usefulness in Overview.

## Design

**Slack app.** The user token comes from the same Pacenote app with user scopes added (the main manifest stays without
them, so a setup that does not use tasks never asks for them): `channels:read`, `groups:read`, `channels:history`,
`groups:history`, `users:read`; for the DM option also `im:read`, `im:history`, `mpim:read`, `mpim:history`.
Reinstalling the app shows a User OAuth Token (`xoxp-`), saved as `SLACK_USER_TOKEN` like the other secrets.

**Where things run.** Collect now goes from the app to the bot process, which reads Slack with the user token and asks
its reasoner, with no MCP tools, to pick the tasks. The user token never reaches the reasoner or the sandbox. The
reasoner gets only the kept messages, with the same rule as attachments: content is data, not instructions.

**Files.** The bot writes `tasks.json` (the tasks, where each collection left off); the app writes your decisions (done,
dismissed with a reason, kept) to `tasks-decisions.json`. Each file has one writer, so a collection and a click never
overwrite each other. A task: `{ id, source { conversation, label, message, thread, permalink }, title, askedBy, kind:
asked | promised, due?, confidence: sure | maybe, reason, foundAt, closed? { at, why: replied | checked } }`.

**Keeping.** Open tasks fade after 7 days and drop after 14; done and dismissed ones are kept 14 days.

**MCP.** `my_tasks` (open tasks with links, reasons and due hints) on the existing MCP server, read-only, behind the same
"Share with AI tools" switch and only while tasks are on.

## Risks

- **Trust boundary.** Pace reads only threads it is mentioned in today, in public channels, with a bot token. A user token
  sees everything you can see. Tasks stay off by default, and the screen that turns them on spells out the reach.
- **Where the text goes.** Extraction sends the kept messages, DMs included when that is on, to the reasoner's provider.
- **Noise.** Precision first, Maybe, closing by itself, the dismiss rate.
- **Quota and rate limits.** One reasoner request per collection; history reads are paced for Slack's limits, and later
  collections read only what is new.
- **Workspace policy.** Some workspaces restrict user tokens or these scopes; tasks then stay off, and the screen says why.
- **Team hub.** Each member would need their own user token, which means an OAuth flow on the hub. Personal setups first.

## Phases

| Phase | Scope |
| --- | --- |
| 0 | Collect now, the last 7 days then only what is new, precision first with Maybe, closing by itself, Done and Dismiss with reasons, the leave-out offer, the dismiss rate, the Tasks screen, `my_tasks` |
| 1 | Collecting on a schedule, the daily DM summary, the dismiss rate in Overview |
| 2 | Team hub support, sending tasks to Linear, Jira or Reminders, Slack search where it works |

## Still open (phase 1)

- How often to collect on a schedule (30 minutes was suggested).
- When the daily summary goes out, and whether it skips days with nothing open.
- Whether you can add a task by mentioning Pace ("@Pace remind me to ..."), so tasks are not only guessed.
