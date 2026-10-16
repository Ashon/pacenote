# Where you contribute

The **You** screen shows what you work on and where you contribute: your areas, how you contribute to each, what is open
in each, what you did there lately, and who asks you most. Pacenote finds it in the work it already sees, your tasks and
your Claude Code and Codex sessions on this Mac, and asks you only to fix what it got wrong.

## Areas

An area is a part of your work: the repositories, Slack channels and user groups that go together. Pacenote finds them
from the last 8 weeks with no model asked:

- **A repository you work in** is an area: two or more tasks or days of sessions in it. Its siblings join it, so
  `Ashon/payments` and `Ashon/payments-sdk` make one area named Payments.
- **A Slack channel** joins the area of the repository most of its tasks are about, at least two of them and 60% of
  its tasks that name a repository. A channel that asks you about no one repository is an area of its own once it has
  three tasks.
- **A user group** joins the channel or repository its asks come with, or is an area of its own.
- A Maybe, or a task you dismissed as not yours, is no one's work. A session counts on the day it started and the day it
  last wrote; only a log's first lines are read, for the folder it ran in, and its repository comes from the folder's
  `origin` remote.

Areas are kept once found, so your fixes stay. Later work adds parts to the areas you have, but never renames, splits or
drops one. An area with nothing in it for four weeks rests at the bottom of the list, and comes back when work does.

## How you contribute

Each area says how you contribute to it, and what shows it:

| Role | Shown by |
| --- | --- |
| Builds | Sessions in its repositories: "sessions here on 5 days of the last 30" |
| Reviews | Two or more tasks to review something in the last 30 days |
| Answers | Two or more people's asks there in the last 30 days: "mina and hyun asked you 5 times" |
| On call | Asks through its user group |

## The first look

Once a collection has run and your areas are found, Todo shows them above your tasks, once: **This is your work, as
Pacenote sees it**, each area with how you contribute and what is open. **Looks right** puts the card away. **Fix
something** lets you rename an area, take a repository or channel out of it, or say it is not yours, there and then;
**Done** puts the card away too.

## The You screen

The screen is in the sidebar, under Todo. Each area is a row: its name and roles, what it is made of, what is open or
working now, and its work each week over the last 8 weeks. A row opens in place (`#/you/<id>`) with its roles and what
shows them, its open tasks (each opens in Todo), what was done there in the last 30 days and how, and what it is made
of. Its menu renames it, merges it into another area (which keeps its own name), or says it is not yours anymore; an
area you leave can be taken back from the notice that follows. Each part has its own button to take it out.

Each task on Todo says its area, by its repository or else its channel, and opens the area on the You screen.

## For your AI tools

`my_work`, a tool of Pacenote's MCP server, gives an AI tool the same picture: your areas (what each is made of, how you
contribute and what shows it, what is open, what you did lately and who asks you most), and the resting ones. A session
told about your tasks is told about `my_work` too. It answers while Settings > Todo > Gather my tasks from Slack is on,
like the task tools, and only reads.

## What is kept

`PACENOTE_DATA_DIR/you.json` keeps your areas as you shaped them (names, parts, the parts you took out, the ones you
left), when you looked at them, and who you are on GitHub (`gh`'s login) and in git (its global email), looked up once a
day. Only the desktop app writes it. What is going on in each area is counted again from your tasks and sessions each
time, at most every minute, and is not stored.

## Not yet

Pull requests and reviews from GitHub (your pull requests in an area, review requests as tasks), a week of your work to
copy for a standup, roles you confirm when a collection notices one, and those roles changing what a collection counts as
yours come next.
