# Installation

There are two ways to run Pacenote: the desktop app from Homebrew, or from source with pnpm. Both need the
Slack app from steps 1-3 under "From source".

## Install with Homebrew

The desktop app installs from the Homebrew tap (macOS 12 or later, Apple silicon; Intel Macs are not supported since
v0.5.7):

```sh
brew tap ashon/tap
brew trust ashon/tap
brew install --cask pacenote
```

- Homebrew loads casks only from taps you trust. Without `brew trust`, the install is refused, and a plain `brew upgrade`
  compares the installed copy with itself and skips Pacenote. An install from before the rename to Pacenote (`verda`,
  `orbly`) trusted only the old cask name, so run `brew trust ashon/tap` once there too.
- The app carries the bot, the sandbox jobs and its own Node, so it needs no repository, Node or pnpm. It needs a `claude` or
  `codex` CLI login (codex 0.138 or later), and `gh` and `git` for the ops tools. The built-in sandbox, which also renders
  diagrams, needs nothing installed, on Apple silicon with macOS 15 or later.
- Open Pacenote. A first run opens on setup: the AI service (the CLIs found on this Mac, signed in or not), where
  answers run (the built-in sandbox where this Mac runs it, prepared in the background from the start, or this Mac),
  Slack (the team hub, or your own app from Pacenote's manifest with its two tokens, then "@Pace it's me" to say who you
  are), a review, and the first answer. Each choice is saved as it is made; Overview picks setup up again, or hands it to Settings instead.
- Settings holds the same choices afterwards: Settings > Messengers > Slack (the connection and who can ask), Settings >
  Sandbox > Run environment and "Set up built-in sandbox". Diagrams need that setup too, with answers on this Mac or not;
  until it is done, they stay as text.
- At startup Pace checks that the CLI is installed, signed in and, for codex, new enough; what is missing shows in the
  status bar with what to do.
- Config, run history and the allowed domains list live in `~/.pacenote` (`PACENOTE_HOME`), outside the app, so they survive
  upgrades and uninstall. The folder is kept to your account (700, and `.env` 600), and the app's own log is
  `logs/desktop.log`, beside Pace's `logs/bot.log`.
- `brew upgrade --cask pacenote` quits the running app first (the bot gets up to 15 seconds to finish its requests, and the rest
  resume on the next start) and reopens it. The app tells you when a new release is out ("Update" in its status bar).
  Homebrew refreshes the tap at most once a day on its own, so right after a release run `brew update` first.
  `brew uninstall --cask pacenote` removes the app and keeps `~/.pacenote`.

## From source

1. Slack app: https://api.slack.com/apps -> Create New App -> From an app manifest ->
   paste `slack-app-manifest.yaml`. For an existing app, only match the scopes and events below.
   - Bot Token Scopes: `app_mentions:read`, `channels:history`, `channels:read`, `chat:write`, `files:read`, `files:write`, `users:read`,
     and `reactions:write` (without it Pace posts "Working on it..." instead of reacting to the mention with 👀)
   - Event Subscriptions > bot events: `app_mention`
   - Turn on Socket Mode
2. Basic Information -> App-Level Tokens: create a token with `connections:write` -> `SLACK_APP_TOKEN`
3. Invite the bot to the public channels where it should answer. (`/invite @botname`) Put your own Slack member ID (your
   profile > ⋮ > Copy member ID) in `MENTION_ALLOWED_USERS`: Pace answers only you, and with your own app the bot does
   not start until it knows who you are.
4. Write the config file and check it. Config lives outside the repository in `~/.pacenote/.env`. (`PACENOTE_HOME` changes the location)
   The bot (app, terminal) and the sandbox jobs read this file, so values of the target environment never land in the repository.

   ```sh
   mkdir -p ~/.pacenote && cp .env.example ~/.pacenote/.env   # fill in SLACK_*, MENTION_ALLOWED_USERS, REASONER, REASONER_SANDBOX
   pnpm install
   pnpm slack:check        # check tokens, scopes, app match, Socket Mode
   ```

5. Run

   ```sh
   pnpm desktop             # the desktop app starts and manages the bot (recommended, see desktop-app.md)
   pnpm dev                 # development in a terminal (watch)
   pnpm build && pnpm start # run in a terminal
   ```

Two processes with the same app token make Slack split events between them, so run only one.
At startup the bot takes a run lock through `PACENOTE_DATA_DIR/bot.json`. If another bot is alive, it waits 30 seconds for it to exit,
and if it is still alive it exits with "Pace is already running". A `bot.json` left behind by a crash or a power cut does not
count, even once another process has its pid: a process that started after the bot did is not the bot.
`pnpm dev` restarts the process whenever the source changes, so requests in progress can be cut off while you edit code.

Restart handling:

- Mentions are recorded in `PACENOTE_DATA_DIR/inflight.json` and get a reaction as soon as they are taken on: 📥 while
  they wait their turn, 👀 once they start. After a restart the bot resumes each one once; the 👀 stays on the mention
  meanwhile (without `reactions:write`, the asker alone is told "I restarted, so I'm picking this up again...").
  Requests already resumed once or older than 30 minutes get ⚠️, and the asker alone is told "I couldn't finish this: I
  restarted and the request was cut off. Please mention me again."
- An answer is never posted twice: once posting has begun, a restart does not answer again. If it came partway through, the
  mention gets ⚠️ and the asker alone is told "I restarted while posting my answer, so it may be cut short."
- On a shutdown signal (SIGINT, SIGTERM) it stops taking new events and waits up to 15 seconds for requests in progress. Then it
  stops their reasoner runs (on this Mac the CLI and whatever it started, in a sandbox its VM or container), which resume on
  the next start without counting as an attempt.
- At startup it deletes attachment/output temp directories (`PACENOTE_DATA_DIR/attachments/*`) older than 1 hour.

Requirements: Node.js 22.9 or later, pnpm 11, and for the built-in sandbox a Mac with Apple silicon and macOS 15 or later,
with Xcode to build pacenote-vm (`pnpm sandbox:vm` builds it, then sets the sandbox up).
