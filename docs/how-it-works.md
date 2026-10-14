# How it works

What happens between a mention and its answer: context, attachments, diagrams and images, and the reasoner CLIs.

```
@bot mention in a public channel
  -> messenger adapter (Slack: Bolt, Socket Mode or the team hub, app_mention event) -> Mention
  -> check allowed users / public channel
  -> Pace reacts to the mention with 👀 (📥 first while it waits its turn, and ⏳ after 90 seconds of work)
  -> collect context (in a thread its first message and the latest 29, or the last 10 messages outside a thread)
  -> Reasoner: claude -p or codex exec (a disposable VM when REASONER_SANDBOX=vm)
  -> post the answer as a new reply (long answers continue in more messages), and take the reactions off
```

- The thread gets only answers. How Pace is doing shows as reactions on the mention (📥 waiting its turn, 👀 working,
  ⏳ slow, ⚠️ failed), and what only the asker needs goes to them in a message only they can see (ephemeral): why an
  answer failed, that Pace is busy, that it is not allowed there. People talking in the thread are not interrupted, and
  the answer arrives as a new reply at the bottom, which notifies them. (An edited message would not.)
- A Slack app without the `reactions:write` scope (created from an older manifest, or not approved in the workspace)
  works the same, except that only the asker sees that Pace is working ("Working on it...", for them alone) or failed.
  The Pace screen and Settings > Messengers > Slack > Check connection say the scope is missing; it is a limit, not a
  fault, so the status bar does not count it.

- A mention inside a thread also passes the bot's earlier answers as context, so it continues from them. The thread is
  read to its end, however long; past 30 messages Pace passes its first message, which says what the thread is about,
  and the latest 29, with a line saying how many are left out between them. Each message passes up to 1,500 characters.
- On its own Slack app, the bot answers only the users in `MENTION_ALLOWED_USERS`, and does not start until it is set.
  `MENTION_ANYONE=on` answers anyone in the workspace instead, but not people from other organizations in a shared
  channel (Slack Connect). Anyone else gets a message only they can see (ephemeral): "I only answer specific people
  here." On the [team hub](team-hub.md), each desktop gets only its own member's mentions.
- Before an answer is posted, the secrets the bot holds (its Slack tokens, the hub token, the sandbox login) and
  common secret formats (API keys, private keys, tokens) are replaced with `[REDACTED ...]`. The run history keeps
  the answer as posted, with a note of how many were redacted.
- It does not answer in private channels or DMs.
- It runs up to `MENTION_CONCURRENCY` requests at once and queues up to 10 more. Beyond that it tells the asker, in a
  message only they can see, that it is busy.
- On failure it puts ⚠️ on the mention and tells the asker alone "I couldn't produce an answer" with what that means,
  read from the reasoner's error (`src/mention/failure.ts`): its sign-in was rejected, it reached a usage limit, its
  service was unavailable, something in the setup failed, or the request took longer than `REASONER_TIMEOUT_SEC`. It
  says who fixes it: whoever runs Pace, or on the [team hub](team-hub.md) the asker, whose own Mac answered. The error
  itself goes only to the log and the run history, where the run also says what to fix and links to it. A rejected sign-in or a usage limit also shows in the
  status bar's check issues until the reasoner answers again.

## Attachments
Files attached to the mention and to the thread are downloaded with the bot token (`files:read`) and passed along. Attachments
of the request message come first, then the thread's recent attachments. Files that arrive in the event as a stub
(`file_access: check_file_info`) are fetched again with `files.info`.

| Kind | Handling | Limits |
| --- | --- | --- |
| Images (png, jpg, gif, webp) | codex: read-only `/attachments` mount + `--image`; claude: base64 blocks on stdin | 10MB each, up to 4 |
| Text (logs, config, code, JSON/YAML/CSV, Slack snippets, SVG) | Content goes into the prompt as an `<attached_file>` data section | 2MB and 50,000 characters per file, 120,000 characters in total |
| PDF | Text of the first 50 pages only, extracted with `pdftotext` (in a disposable VM with no network in the built-in sandbox) | 20MB, up to 4 together with text files |
| Other formats, external files (Google Drive and so on) | Not read; the model is told the name and the reason | |

- Instructions inside attachments are treated as data only. Downloaded files are kept in `PACENOTE_DATA_DIR/attachments/<id>`
  and deleted when the answer is done.
- Without the scope, Slack returns a login page instead of the file. This case is reported as "check the files:read scope".

## Diagrams and images
When a diagram helps, the model writes a ` ```mermaid `, ` ```dot ` (graphviz), ` ```vega-lite ` or ` ```svg ` code block.
The bot renders the block as a PNG, posts it to the thread (`files:write`), and leaves only a "(Figure N: image below)" marker in the text.

- Rendering runs in a disposable VM of the built-in sandbox with no way out, which sees only the block's folder
  (`sandbox/vm/renderer`: mermaid-cli + chromium, graphviz, vl-convert, librsvg, Pretendard and Noto CJK fonts). It needs
  the built-in sandbox set up, whatever the run environment: Apple silicon and macOS 15.
- Every format is drawn as the app looks, in its light theme and typeface, Pretendard: shapes are its choice cards
  (white, a hairline, rounded), groups its wells, lines and secondary text its muted foreground, and charts its rounded
  bars in the logo's gradient (`mermaid.json`, `vega-lite.json`, `dot.gvpr` and the dot defaults in `render.sh`). A node's
  class gives it the app's look for that meaning: `accent` (the checked choice), `primary` (the primary button), `warn`
  (a notice), `error` and `muted`, as `A[Label]:::warn` in mermaid or `[class="warn"]` in dot. A dot or vega-lite block
  can still set its own colors; a mermaid block cannot change the theme. The model is told to leave styling to the
  theme, and given its colors for svg.
- Up to 3 per answer. A block that cannot be rendered keeps its source with a note, and if the upload fails the source is posted to the thread.
- vega-lite cannot load external data, so values go directly into `data.values`. Without a size, it renders at 520x260.
- `RENDER_DIAGRAMS=off` turns it off. If the renderer image is missing, the startup log and the status bar say so, and the bot
  works without diagrams.

Illustrations and photo-like images are made with codex's image generation (`image_generation`). (The claude backend has none.)

- codex saves generated images to `~/.codex/generated_images`. In the sandbox, each request mounts
  `PACENOTE_DATA_DIR/attachments/<id>/generated` at `/out`, and the entrypoint links that path to `/out` so the images stay on the host.
  This is the only path the sandbox can write to on the host.
- After the answer, the bot posts the generated images (up to 4) together with the diagrams to the thread. Generation takes about a minute.
- codex generates only fixed sizes (1024x1024, 1536x1024 and so on), so without a size or aspect request it is asked for a square,
  and before upload the renderer's VM (Pillow) shrinks the long side to `GENERATED_IMAGE_MAX_PX` (default 512). 0 keeps the original.
- Images already in the thread are passed along, so the model can draw with reference to images posted earlier.

| Path | Role |
| --- | --- |
| `src/index.ts` | App assembly: connects the messenger and hands its mentions to the responder |
| `src/messengers/types.ts` | The messenger interface: receiving mentions, context, files, posting, editing, uploads, formatting, links |
| `src/messengers/slack/` | The Slack adapter: connection (Socket Mode or the team hub), user/channel cache, mrkdwn conversion, file downloads |
| `src/mention/` | The messenger-neutral pipeline: allowlist and venue checks, prompt, attachments, run history, resuming after a restart |
| `src/reasoners/` | The reasoner interface and a `CliAdapter` per CLI (`claude -p`, `codex exec`), run by `cli.ts` |
| `src/sandbox/` | Where the CLI runs: the `Sandbox` interface, `host.ts` and `vm.ts`, the built-in sandbox's setup, proxy and broker |
| `src/broker/` | ops-broker: SSH host checks, k8s queries, work directory reads (MCP server) |
| `src/tools/sandbox-job.ts` | Sandbox jobs: the built-in sandbox's setup, the broker's kubeconfig. Shared by the app and `pnpm sandbox:vm`, `pnpm k8s:kubeconfig` |
| `scripts/bundle.mjs` | Bundles the bot, the sandbox jobs and the broker with their dependencies (`pnpm bundle`; used by the packaged app and the broker's VM) |
| `apps/desktop/scripts/package-mac.mjs` | Installable macOS app and its release zip (`pnpm package:mac`) |
| `src/tools/check-slack.ts` | Slack app config check (`pnpm slack:check`) |
| `sandbox/` | The built-in sandbox's image builds (`vm/`), the default allowed domains, the k8s read-only role |
| `deploy/homebrew/` | Homebrew cask template (`Casks/pacenote.rb`), tap update script, release runbook |

## Reasoner backends

| REASONER | Runs | Limits |
| --- | --- | --- |
| `claude` (default) | `claude -p --output-format stream-json` | Does not read user settings, hooks or MCP. No tools by default; with `MENTION_WORKSPACE`, only `Read,Grep,Glob`, allowed in that directory alone (`Read(//dir/**)`, `dontAsk`), never on `.env` files, Pacenote's folders or the usual credential folders |
| `codex` | `codex exec --ephemeral --ignore-user-config` | On this Mac its shell runs under a permission profile that reads the platform's basics and `MENTION_WORKSPACE` alone (no `.env` files, no writes, no network), and the user's `config.toml` is not loaded; its model comes along as arguments. Needs codex 0.138 or later. In the built-in sandbox, `--sandbox read-only`, where its shell does not run. `approval_policy=never` in both |
