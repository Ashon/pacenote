# Development

```sh
pnpm check          # typecheck (bot, UI, app) + lint + format:check + test
pnpm test
pnpm test:e2e       # end-to-end: the bot and the hub against a fake Slack, claude and codex (about 15 s)
pnpm test:e2e:coverage  # the same, with the bot's and the hub's coverage (coverage/e2e/index.html)
pnpm test:e2e:app   # end-to-end through the desktop app's window (builds first; opens a window)
pnpm site:build     # pacenote.dev into _site/, with the guide and the news
```

## Code style

Prettier formats the code (`.prettierrc`: no semicolons, single quotes, 80 columns) and ESLint checks it
(`eslint.config.js`), with an 80-column limit that also holds for comments; strings, template literals, regexes and
URLs may run longer. `pnpm format` rewrites; `pnpm lint` and `pnpm format:check` verify, and both are part of
`pnpm check`.

## End-to-end tests

`tests/e2e` runs Pacenote the way it runs for real, on this computer and without network access: the bot (and the
team hub) as their own processes, a Slack workspace stand-in they reach through `SLACK_API_URL`, and stand-ins
for the claude and codex CLIs. Each test gets its own workspace, data folder and `HOME`, so a real Pacenote running on
the same Mac is never touched.

| Piece | What it is |
| --- | --- |
| `support/fake-slack.ts` | Web API, Socket Mode (events as acked envelopes), file downloads (Slack's login page without access) and uploads, with channels, users and threads behind them |
| `support/fake-claude.mjs` | Answers by rules matched on the request: an answer, a delay, a failure, tool steps. Records each call's prompt, system prompt and images |
| `support/fake-codex.mjs` | `codex exec` by the same rules, in codex's `--json` events: tool calls, the answer, tokens with the cache counted in, a failed turn, and an image it drew, left where codex leaves them |
| `support/world.ts` | One test's workspace (#ops public, #secret private, alice, bob), the fakes' rules, and the bot's environment (`REASONER=codex` for the fake codex), status and run history |
| `support/processes.ts` | The bot and the hub as processes (from source with tsx; `E2E_BOT=bundle` runs the bot's bundle after `pnpm bundle`) |

| File | Cases |
| --- | --- |
| `bot.e2e.ts` | Answers in a thread and outside one (context, mrkdwn, run history, permalink), long answers, tool steps, answering only you, private channels, failures, attachments (text, image, files.info lookups, no access), redelivered events, finishing on SIGTERM, resuming after a crash, a rejected token, and with codex: the thread on stdin, a tool step and tokens, an attached image as a file, a drawn image in the thread, a usage limit |
| `hub.e2e.ts` | Pairing with a code sent in Slack, a member's mention answered on their desktop through the hub (files included, no Slack token on the desktop), a member without a desktop, a disconnected desktop |
| `app.e2e.ts` | The desktop app (Playwright for Electron): setup from a first run with your own Slack app ("@Pace it's me", the first answer), getting past where it used to stop (a token in the wrong field, someone else's mention, a wrong "Yes", a failed first answer, a hub address that is not one, a cancelled code), with the team hub (picked up after a restart, reduced motion) and in the built-in sandbox (gated like the VM case), the built-in sandbox prepared as soon as setup opens, setup left for Settings with Slack tokens saved there, the connection check, starting the bot, the answered mention in the run history |

`E2E_VERBOSE=1` prints the processes' logs as they run. A failed app test leaves a screenshot in `test-results/`.

Coverage (`pnpm test:e2e:coverage`) is measured with c8 in the bot and hub processes themselves (each writes its V8
coverage, mapped back to the TypeScript through tsx's source maps), over the code those processes run: the bot, the
hub, the messengers, the mention pipeline, the reasoners, history and runtime (`.c8rc.json`). The ops-broker, the
sandbox jobs and the desktop app's own code (the history reader, the connection check, hub pairing) are left out,
since this suite does not run them in those processes; a process killed on purpose (the crash test) leaves no coverage. The report is in `coverage/e2e/` (`index.html`, `lcov.info`).

CI (`.github/workflows/ci.yml`) runs `pnpm check` and `pnpm test:e2e:coverage` on every push to main and pull
request, puts the coverage per folder in the job summary, and keeps the report as the `e2e-coverage` artifact. On
main it also updates the coverage badge above (the `badges` branch). The app test runs on a macOS runner when the
workflow is started by hand.

## pacenote.dev

`site/` holds the hand-written pages. `scripts/site-pages.mjs` (`pnpm site:build`) copies them into `_site/` and adds the
pages it makes from markdown, in the header and footer of `install/` in each language:

- **The guide**, from `docs/guide/en` and `docs/guide/ko`: one file per page, the same names in both languages, with
  front matter: `title`, `summary`, `kind` (`start` for a walkthrough, `screen` for a screen of the app), `order` and
  `shot`. Links to `guide:<page>` go to another page of the guide, and relative links to files in the repository go to
  GitHub.
- **The news**, from feature posts in `docs/news/en` and `docs/news/ko` (front matter: `title`, `summary`, and the
  `version` it comes with, or a `date`) and the release notes in `docs/releases`. Only released versions show: the
  Pages workflow passes GitHub's releases, and a local build takes the repository's tags. From v0.6.11, each release
  note has its Korean in `docs/releases/ko`, and the build stops without it; older ones show in English on the Korean
  news, marked EN.
- The sitemap, an Atom feed per language (`feed.xml`, `ko/feed.xml`), and the home pages' link to the latest news.

Its markdown is the small part these pages use: `##` and `###` headings, paragraphs, `-` and `1.` lists, `code`,
**bold**, links, ```` ```sh ```` blocks (a command with a Copy button), and `![...](shot:<name>)` on a line of its own:
the app's screen from `site/shots/<lang>/<name>.png`. Those are taken by the app's end-to-end tests, at `siteShot`
points, in English and in Korean: `pnpm site:shots` runs them and writes the pictures. `tests/site.test.ts` builds the
site and checks it.

## Adding a messenger

The mention pipeline (`src/mention`) talks to chat apps only through `Messenger` in `src/messengers/types.ts`, so a new
app is an adapter, not a change to the pipeline:

1. Add its id to `src/messengers/ids.ts`.
2. Write `src/messengers/<id>/`: a `Messenger` (who may ask and where, the readable request and context, file lookups
   and downloads, posting, editing, uploads, rendering Markdown into the app's markup) and a `MessengerConnection` that
   turns the app's events into `Mention`s. `src/messengers/slack/` is the reference.
3. Connect it in `src/index.ts` and pass its messenger to `MentionResponder`.
4. Give its settings groups `messenger: "<id>"` in `src/settings/fields.ts`; the Messengers section shows them under
   the app's heading.

Run history (`origin.messenger`) and interrupted requests (`inflight.json`) already record which messenger a request
came from.

## Adding a reasoner

A model's CLI is a `CliAdapter` in `src/reasoners`; the runner (`cli.ts`) and the sandboxes do not change:

1. Add its id to `src/reasoners/ids.ts` and to the `REASONER` options in `src/settings/fields.ts`.
2. Write `src/reasoners/<id>.ts`, with `claude.ts` and `codex.ts` as the references:
   - `invocation()`: the command, its arguments, stdin, credentials (`env`), and the host paths it needs as mounts
     (`SANDBOX_PATHS`, with `sandbox.pathIn()` for the paths it is told about).
   - `canReadFiles(sandbox)`: whether it may read the reference directory where it runs.
   - `events()`, `answer()`, `failure()`: progress steps, the final answer, and the cause of a failed run, from what it
     prints.
3. Register it in `ADAPTERS` in `src/reasoners/cli.ts`.
4. In `src/config.ts`, give it a binary setting in `commands` and, for the built-in sandbox, its credentials in `auth`.
5. Install the CLI in `sandbox/vm/build.sh` (its version in `VERSIONS`, `src/sandbox/vm-images.ts`) and allow its API's
   domain in `sandbox/allowed-domains.txt`.

A model reached without a CLI can implement `Reasoner` directly and be returned from `createReasoner`.

## Adding a sandbox

A place to run the CLI is a `Sandbox` in `src/sandbox`; the adapters do not change:

1. Add its kind to `SandboxKind` in `src/sandbox/runtime.ts`.
2. Write `src/sandbox/<kind>.ts`. `run()` starts one process with the given stdin, environment values (kept out of
   process listings), mounts (read-only unless `writable`) and working directory (an empty one without it), honors the
   timeout and the abort signal, and passes stdout lines on. Set `isolated` when the process sees only its mounts; an
   isolated sandbox puts them at `SANDBOX_PATHS`, and `pathIn()` says where a host file appears. `extractPdfText()` and
   `verify()` cover uploaded PDFs and what keeps it from running.
3. Build it in `src/index.ts` from `REASONER_SANDBOX` (`src/config.ts`, `src/settings/fields.ts`).
