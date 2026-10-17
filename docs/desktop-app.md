# Desktop app

The desktop app (`apps/desktop`, Electron) starts and manages the bot (Socket Mode) as a child process and shows its status, logs and run history.
The UI is `apps/web` (React).

```sh
pnpm desktop        # build the bot, the UI and the app, then run it from the repository (development)
pnpm desktop:dev    # the UI runs on the Vite dev server (127.0.0.1:5179) and the app opens that address
pnpm package:mac    # build the installable Pacenote.app as a release zip in release/
pnpm install:mac    # unpack that zip into /Applications (quit Pacenote first)
```

Runs from the repository (`pnpm desktop`, `pnpm desktop:dev`) are named "Pacenote Dev": they have their own Electron user data
folder and single-instance lock, so they start next to an installed Pacenote. The top bar, the Dock icon (a DEV tag, drawn by
`icon.swift` as `assets/pacenote-icon-dev.png`) and the menu bar item say "Dev". Both use the
same config and data folder (`~/.pacenote`), so the bot lock still keeps a single bot running.

These runs also have a Debug section above Settings, for things to look at in motion (Pace's spinner at each size,
looking around and writing, with speed, pause, a scrubber and the frame rate, loads of a few lengths that end with the
mark easing back into the logo, the Pace screen's mark from state to state, and the app's motion patterns at a chosen
speed) and the status bar in made-up states (Pace's state, requests, a task collection, check issues, narrower windows).
Its code is only in builds made for development: `pnpm desktop` builds the UI with `VITE_PACENOTE_DEBUG=1`, and the Vite
dev server always includes it. `pnpm desktop:build` and `pnpm package:mac`, which release builds use, leave it out.

Packaging:

- `pnpm package:mac` builds `release/Pacenote-v<version>-macos-arm64.app.zip` with a `.sha256` file, on and for a Mac
  with Apple silicon (Intel Macs are not supported since v0.5.7). The app is assembled in `release/staging.noindex` and
  removed once zipped, so Spotlight and Launchpad list only the installed Pacenote.
- The app is ad-hoc signed, for this Mac only. Release builds are signed and notarized from these zips outside this
  repository, which also publishes them and updates the Homebrew cask. See `deploy/homebrew/README.md` for the steps a
  release takes here (versions, notes, tag).
- `pnpm install:mac` checks the zip for this Mac's arch against its `.sha256` and unpacks it into `/Applications`. It refuses to
  replace a running Pacenote, or a Pacenote installed with Homebrew (`brew uninstall --cask pacenote` first).

Using the packaged app:

- `Pacenote.app` contains the UI, the bot and sandbox job bundles (`pnpm bundle`) and the `sandbox/` files, so it runs without the repository, Node or pnpm.
  It needs a reasoner CLI login (claude or codex), and gh and git for the ops tools; the built-in sandbox comes with it.
- Settings (`~/.pacenote/settings.json`), history and the allowed domains list live outside the app (`PACENOTE_HOME`,
  default `~/.pacenote`), so they are kept when the app is reinstalled.
- Sandbox jobs (the built-in sandbox's setup, the broker's kubeconfig) run the job bundle inside the app with the app's Node.
  From the repository, the same jobs run with `pnpm sandbox:vm` and `pnpm k8s:kubeconfig`.
- The packaged app uses its bundles as they are, so it has no "Rebuild and restart". After changing code, reinstall with `pnpm package:mac && pnpm install:mac`.
- To avoid two bots on the same Slack app token, do not run `pnpm desktop` or `pnpm dev` while using the packaged app.
  (If both run, the bot run lock makes the one started later only show "Pace is running elsewhere, such as a terminal.")

Layout:

- The sidebar on the left lists the screens at the top ("Overview", "Todo", "Recap", "You", "Runs", "Pace") and
  "Settings" at the bottom. Todo, your tasks, comes before Runs, the jobs Pacenote ran, and shows how many are open
  ([Your tasks from Slack](tasks.md)); Recap, what you did ([Recap](recap.md)), and You, where you contribute
  ([Where you contribute](you.md)), follow it. The toggle at the left of the top bar (or Cmd+B) keeps only its icons,
  and the choice is remembered. Windows narrower than 900 pixels keep only the icons too.
- The status bar along the bottom of the window holds indicators to glance at: Pace's connection status, reasoner backend,
  attached tools and startup check issues (when any) on the left; a task collection in progress (which opens Todo),
  requests in progress, the last request time, a folder button that opens the run history in Finder, and the version
  (which opens its release notes) on the right. Clicking "Pace: ..." opens the Pace screen, or the
  settings to fix when setup is needed. Narrow windows drop the less needed ones.
- Each screen is one content surface next to the sidebar. Its parts are told apart by space and hairlines, not by cards of their own.
- The top bar holds the run search (Cmd+K focuses it, Esc clears it). Typing a search opens Runs.
- Runs shows the run list and the selected run side by side. The line between them can be dragged, and a double-click resets it.
  When the window is too narrow for both, Runs shows the list, and a picked run with a way back to it.
- Runs lists every job Pacenote ran: answers to mentions and task collections. Each item says which it is, a mention with
  its request and a collection with what it did ("Added 2 tasks and 1 Maybe"); the list filters by kind and by state. A
  collection's detail has no chat: what it added, closed and left out, its lookups in Slack (which tool, when, how long;
  what Slack returned is not kept), the rules Pacenote gave it, and the record.
- The window can be as narrow as 600 pixels. Narrow screens stack their rows, and Settings shows its sections as icons.
- Motion answers what you just did, and only Pace at work moves on its own. Moving to another screen or Todo tab fades the
  old content out and the new one in; the sidebar's width eases, its labels fading out before it narrows and in after it
  widens; a Todo row unfolds in place; a task you settle is pushed aside and the rows below close up; a menu or tooltip
  slides out of what opened it; the folder dialog lifts in and sinks back out; the session log slides in from the right.
  Tasks that come in while you look at Todo wait behind a "2 new tasks" notice on the tabs' line, so the rows you are
  reading stay put. With reduced motion on in macOS, nothing moves or resizes and what comes and goes fades.
  The patterns live in `apps/web/src/motion.css` and the primitives in `apps/web/src/components/ui` (Collapsible, Dialog,
  the menu, the tooltip, Tabs, `Swap`, `useListMotion`, `usePresence`); `tests/web-motion.test.ts` fails on durations,
  easings or animations written anywhere else. The Debug section has a Motion bench that plays each pattern slowly.
- Text takes its size from one scale in `apps/web/src/index.css` (2xs 11, xs 12, body 13, sm 14, base 16, lg 18), and
  `tests/web-type.test.ts` fails on sizes made up elsewhere. Latin is set in Host Grotesk and Hangul in Pretendard, both
  bundled with the app (pacenote.dev uses the same pair); anything else falls to the system font. A run's status in the
  list is a dot when it succeeded and an icon otherwise, and every status color reads at 4.5:1 or more as text.

Bot management:

- Opening the app starts the bot automatically. (Turn it off with "Start the bot when the app opens" under Settings > General. It is stored in `PACENOTE_DATA_DIR/desktop.json`)
- The bot runs as an Electron utilityProcess. Development runs use the repository's `dist/index.js` and run `pnpm build` first when `src` is newer.
  The packaged app uses its bundled bot (`bot/index.mjs`) as is.
  Settings are read from the settings file (`~/.pacenote/settings.json`, see [Settings file](settings.md)), and
  variables already set in the environment take precedence.
  PATH comes from the login shell. (So codex, gh and pnpm are found even when the app is launched from Finder)
- The Pace screen has "Start", "Stop", "Restart" and "Rebuild and restart" (development runs only). The number of requests in progress is shown next to the menu bar icon.
  Pace's mark beside its name looks around while Pace starts or stops, and turns while it is connected: once in 16 seconds,
  four times as fast while it answers. With reduced motion it stays still. Stopped, a gray stop sign (a circle and a bar) takes its place. The status bar's dot pings only while Pace starts or stops.
- The menu bar (tray) holds only "Open Pacenote" at the top, then the bot status ("Pace: ...") with "Start Pace" (when stopped) or "Restart Pace", and "Quit Pacenote".
  App settings (opening at login, automatic start, run history folder) are in Settings.
- The installed app looks for a new release on GitHub twice a day (`PACENOTE_DESKTOP_UPDATE_CHECK=off` turns it off). When one
  is out, the status bar shows "Update" and the menu bar menu "Pacenote x.y.z is out...", both leading to Settings > General,
  which shows `brew upgrade --cask pacenote` to copy and the release notes. The app never replaces itself; Homebrew does.
- When Pace needs attention, the app tells you once with a macOS notification, unless its window is in front: Pace stopped
  (until it runs again), it needs setup, it lost Slack for 2 minutes or more, or a problem the Pace screen lists (a sign-in
  the reasoner rejected, a usage limit, the built-in sandbox's setup). Clicking it opens the screen to look at. While any of it lasts,
  the menu bar shows ⚠︎ next to the icon, and the menu lists what the status line does not say. macOS's own notification
  settings turn them off.
- "Open Pacenote when you log in" (Settings > General, installed app only) adds Pacenote to macOS Login Items. Opened at
  login, it stays in the menu bar without a window and starts Pace if automatic start is on. On macOS 13 and later, a new
  login item may wait for your approval; the row says so and opens System Settings > General > Login Items.
- While requests are in progress, the app keeps the Mac from going to sleep (`powerSaveBlocker`, system sleep only), so an
  answer is not cut off halfway. The display still sleeps, and closing the lid still sleeps the Mac.
- Stop and app quit send SIGTERM. The bot gives requests in progress up to 15 seconds, then stops their reasoner runs (the CLI
  and whatever it started, or the container). Those, and the mentions still waiting their turn, resume on the next start.
- A first run opens on setup (`apps/web/src/components/setup`), which takes the whole window: the steps on the left
  (AI service, Where it runs, Slack, Review, First answer), a pill that slides to the one you are on, and the step on the
  content surface, which swaps as you go. Each step checks what it needs where it is: the CLIs installed and signed in
  (`claude --version`, `claude auth status`, `codex login status`), whether this Mac runs the built-in sandbox, the
  Slack tokens as they are typed, the hub's pairing code. Where this Mac runs the built-in sandbox, setup starts
  preparing it as soon as it opens (it is the default, takes minutes and needs no login), unless Pace is set to run on
  this Mac; its progress follows in the step list. Its own Claude login is asked for before Pace starts, and Start Pace
  waits for it to be ready. With your own Slack app, "Show Pace it's you" listens on
  the app (Socket Mode, before Pace runs) for a mention, tells that person alone to confirm in Pacenote, and once you
  confirm it is you, makes you the one Pace answers. The first to mention it stays on screen until you say it is not
  you, and confirming again replaces the one before; Pace starting stops the listening, and leaving without
  confirming starts Pace again if listening stopped it. Any answer in Slack since Pace started ends setup: a failed one
  says why and waits for the next. Its progress is `PACENOTE_DATA_DIR/setup.json`; leaving it ("Finish later") puts a
  card on Overview to pick it up again or to set things up in Settings instead, and the Setup needed card leads back to
  the steps. A Pacenote set up before setup existed never opens on it.
- Before launching the bot, the app checks the settings with the bot's own rules. When the Slack tokens are missing (a first run) or a
  value is invalid, it does not launch the bot and shows "Setup needed" with a way to Settings (on the Pace screen, the Overview,
  the status bar, and the tray menu; while setup is unfinished, the tray opens setup instead). That way opens the section to fix: Slack for missing or rejected tokens, otherwise the section
  of the first invalid value. Tokens Slack rejects (`invalid_auth` and the like) also end up there. Saving in Settings then starts
  the bot ("Save and start Pace").
- If the bot exits when no one asked it to, the app starts it again: after 3 seconds, then 6, 12 and so on up to 5 minutes for
  each exit in a row, starting over after a run of 10 minutes. It shows "Crashed" (after running for 30 seconds or more) or
  "Failed to start" (sooner) with the cause, the last output and a countdown on the Pace screen, where "Start now" skips the wait
  and "Stop" ends it. A dev build that fails shows "Failed to start" and is not tried again.
- If a bot is already running from a terminal (`pnpm dev` and so on), the app leaves it alone and only shows its status and logs as "Running in terminal".
  When the terminal bot stops, the app takes over. (It starts the bot right away if automatic start is on)
- Closing the window hides the app in the tray and the bot keeps running. Quit from the tray menu or with Cmd+Q.
- With `PACENOTE_DESKTOP_BOT=off`, the app does not manage the bot and only shows history.

Settings:

- The gear icon at the bottom of the left rail ("Settings") edits the settings file (`~/.pacenote/settings.json`, see
  [Settings file](settings.md)). The app and terminal runs use the same file, so settings do not diverge. The screen
  names settings by what they do; variable names stay in the file and the docs.
- Settings has its own section list (`#/settings/<section>`): General for the app first, then the bot's sections.

  | Section | What it holds |
  | --- | --- |
  | General | Theme, opening the app at login, starting the bot with the app, updates, the settings file and run history folder |
  | Messengers | Each chat app under its own heading with how it is connected. Slack: the connection (team hub with pairing, or your own app's tokens, with "Create the Slack app" from Pacenote's manifest until they are in) with "Check connection", who can ask (only you: your Slack member ID), Socket Mode keepalive (advanced) |
  | Answers | Reasoner CLI, model, timeout, concurrent requests, time zone, reference directory, diagrams and images |
  | Sandbox | Run environment (on this Mac or the built-in sandbox) with the built-in sandbox's state and setup, limits, the reasoner login, allowed domains |
  | Ops tools | The on/off switch with what it needs, then one card per integration: files, GitHub and pull requests, Jira, Kubernetes, SSH hosts |
  | History & logs | Run history and retention, log level |

- The section list shows what needs attention: "Not connected" when Slack tokens are missing, "Set up" for a built-in sandbox
  that still needs its setup, "Off" for an unused sandbox or ops tools, and per section the number of unsaved changes or a red dot for
  values to fix. Changes in several sections are saved together from the bar at the bottom, which also names the section with a problem.
- Fields show only when they apply: sandbox limits and the reasoner login only for the built-in sandbox, and only the selected
  reasoner's (claude token or codex login file). Hidden values stay in the file. Each ops integration card says whether its fields turn it
  on ("On", "Incomplete", "Off"). Rarely changed values are collapsed under "Advanced".
  Fields, groups and sections are defined only in `src/settings/fields.ts`, and a test checks that their defaults match the bot config (`src/config.ts`).
- Secret values such as tokens are never sent to the UI. Only the prefix and the last 4 characters are shown; enter a new value to change one.
  The Save button next to the input (or Enter) saves just that value and closes the input; Esc cancels.
- "Check connection" checks the bot token, the bot scopes, that both tokens belong to the same app, and Socket Mode, with the entered tokens (or the current ones).
  (The same checks as `pnpm slack:check`; it only fetches the connection URL and does not connect)
- Before saving, values are validated with the same rules as the bot. Problems are shown next to the field and nothing is saved.
  A value that is only missing (a Slack token, the hub pairing, the sandbox's claude token) does not block saving the rest, so a setup
  can be saved a piece at a time; the bot shows "Setup needed" until it is complete.
- Saving changes only what changed and keeps entries the settings screen does not handle (such as personal API keys
  under `env`). Fields reset to their default leave the file, and it stays 600. A file that is not valid JSON is not
  saved over; Settings > General says why.
- Saved settings take effect after the bot restarts. "Save and restart Pace" does both at once.
- A field also set in the app's environment variables takes precedence over the file, so the UI marks it.
- Socket Mode keepalive values: `slack.clientPingTimeoutMs` (default 5000), `slack.serverPingTimeoutMs` (default 30000),
  `logs.pingPong` (default off, visible with `logs.level` `debug`)
- `env.SLACK_API_URL` (not on the screen): your own app's Slack Web API, default `https://slack.com/api/`;
  `https://slack-gov.com/api/` for GovSlack. http is accepted only for this computer, which is how the end-to-end tests
  point the bot at a fake Slack.
- Settings are read and written only over the app's internal IPC, like bot control. The query API and the browser dev server cannot change settings.

Sandbox (the "Sandbox" and "Ops tools" sections of Settings):

- The built-in sandbox's choice under Run environment says whether it is ready, beside "Set up built-in sandbox"
  (`sandbox:vm`), so it can be set up before it is chosen, and for diagrams with Pace on this Mac. The job's output shows
  under the choices, then, once chosen, what it has ([Reasoner sandbox](sandbox.md#built-in-sandbox)): the kernel, the init
  filesystem, the reasoner and diagram images and pacenote-vm. Settings that need Pace's restart show as pending at the
  top of the card, with "Restart Pace": when the config fingerprint (`configHash`) the bot wrote to its status file at
  startup differs from the one computed from the current settings.
- The reasoner login's check (the claude token, the codex login file) shows in the login card. The allowed domains apply
  from the next request.
- The broker's checks (host list, kubeconfig, gh login, PR author) and "Rebuild kubeconfig" (`k8s:kubeconfig`) are in the
  Broker card under Ops tools. The broker's VM starts with Pace, so its settings and files apply when Pace restarts.
  Credential values are not read; only their presence is checked.
- Allowed domains accept exact host names only (wildcards, IPs, ports and URLs are rejected). Domains the current reasoner CLI needs cannot be removed.
  Internal systems that need a token are connected as broker tools instead of opening their domains.
- Jobs run from the app, each from its card, and show their output there. Only one runs at a time, and secret values in the output are masked.
- Paths the broker mounts (`OPS_FS_ROOT`, `OPS_SSH_KEY`, `OPS_SSH_KNOWN_HOSTS`) must be absolute. (`~` is not expanded)

Status and logs:

- The bot writes its status (Socket Mode connection state and reconnect count, bot account, reasoner backend, requests in progress and handled,
  sandbox check problems, a reasoner whose sign-in was rejected or that reached its usage limit, and limits of the setup such
  as a Slack app without `reactions:write`) to `PACENOTE_DATA_DIR/bot.json`.
  The status bar counts the problems; the limits show only on the Pace screen. The app reads it the same way no matter who started the bot.
- Pace answers only you. With its own Slack app, the bot needs to know who you are: until "Who can ask" holds your Slack
  member ID (one only), the Overview shows "Set up Pace" with a way to Settings or back to setup, and the bot does not
  start. Setup fills it in from "@Pace it's me". `MENTION_ANYONE`, from when Pace could answer a whole workspace, is
  dropped when an earlier version's `.env` moves into `settings.json`.
- On this Mac, the status also says when the reasoner CLI is missing, signed out or (codex) too old, with what to do; it is
  checked at startup, every 5 minutes, and after an answer that went through.
- Logs go to the console and to `PACENOTE_DATA_DIR/logs/bot.log`. (Past 5MB it rolls over to `bot.log.1`) The app's own
  log is `logs/desktop.log` beside it: the bot's exits and restarts, builds, and errors in the window. A screen that
  breaks shows "This screen stopped working" with Reload and Back to Overview, instead of a blank window, and writes the
  error there. "Open logs folder" on the Pace screen opens both. A window whose process ends loads again (unless it keeps
  ending), and errors nothing caught in the app go to `desktop.log` too.
- "Copy diagnostics" (Settings > General > Help) copies what a bug report needs: versions, Pace's state and status, the
  settings file with its secrets only said to be set, and the last 200 lines of both logs, with secret values and token
  formats taken out. The logs can still name channels and people, so read it before you share it.
  Bolt and Socket Mode client logs go through the same logger, with the scopes `pacenote:socket` and `pacenote:bolt`.
  Connects, reconnects, disconnects and received events (envelope, retry count) are logged.
- The log file masks token and key formats and the ticket in the Socket Mode connection URL.
- The Pace screen shows logs as "All", "Socket Mode", "Mentions" or "Warnings and errors", with search. It rereads them every 2 seconds and follows the end.
  With `LOG_LEVEL=debug`, detailed Socket Mode client logs are also written.

Run history:

```
~/.pacenote/runs/<YYYY-MM-DD>/<run id>/run.json      # request, context count, attachments, prompt, steps, answer, status
~/.pacenote/runs/<YYYY-MM-DD>/<run id>/artifacts/    # images passed to the model, generated images and diagrams posted
```

- The bot records a run for every mention it handles. (`HISTORY=on`, the default)
- Steps are extracted from the CLI's JSON output (codex `--json`, claude `stream-json`): messages, thinking, tool calls (arguments, results,
  duration), shell commands and token usage. Tool results are stored up to 8,000 characters.
- Statuses are "Running", "Succeeded", "Failed" and "Interrupted". A request resumed after a restart continues in the same record
  ("Resumed after a bot restart (attempt 2)"), and records that will not be resumed are marked "Interrupted" at startup.
- Date directories older than `HISTORY_RETENTION_DAYS` (default 30 days) are deleted. Change the location with `PACENOTE_DATA_DIR`.
- Records contain thread context and attachment contents, so they stay local: `~/.pacenote` and the data folder are kept to
  your account (700, `settings.json` 600), set at every start of the app and the bot.
- Token usage is kept in four parts: new input, cache read, cache write (claude only) and output. "New tokens" are all but the cache reads,
  which are most of the input and cost far less.
- UI: run list (kind and status filters, search), "Overview" (a briefing of up to three lines from today's recap: what is
  next, what you are on, what got done today or, in the morning, yesterday, each opening its place; then the last 14 days,
  success rate, average duration, top tools, the tasks you handled per day and how they ended, new tokens per day for
  mentions, task collections and recap write-ups), run detail ("Timeline" of the work in the order request -> tool calls
  -> answer -> outputs, where Pace's mark looks around while it works and stays as the answer's avatar; "Attachments",
  "Prompt", raw "JSON"; the Tokens figure breaks down on hover).
  Runs in progress are reread every 1.5 seconds.

Other:

- The query API is served only inside the app at `pacenote://app/api/*`, with no open port. Bot control uses preload IPC only.
  The dev server (`apps/web` Vite) listens only on 127.0.0.1 and attaches the same query API read-only.
- The data location is taken from the `PACENOTE_DATA_DIR` environment variable, then `dataDir` in the settings file, then
  the default home (`~/.pacenote`).
- App icon: `assets/pacenote-icon.svg` is the source. After editing it, `pnpm --filter @pacenote/desktop icon` (macOS swift) redraws
  the same shape on the macOS icon grid (an 824 body in 1024, shadow, highlight) as `assets/pacenote-icon.png`.
  Development runs use the PNG as the Dock icon as is, so this does the system's processing by hand.
- `PACENOTE_DESKTOP_THEME=light|dark` pins the theme. (The default follows the system; it can also be changed under "Theme" in Settings > General)
- Build check: `PACENOTE_DESKTOP_CAPTURE=/tmp/pacenote.png pnpm --filter @pacenote/desktop start` saves the UI as a PNG without showing
  a window, then exits. (`PACENOTE_DESKTOP_CAPTURE_HASH=#/bot` picks the screen, and `PACENOTE_DESKTOP_CAPTURE_WIDTH` and
  `PACENOTE_DESKTOP_CAPTURE_HEIGHT` the window size; the bot is not started in this mode)
