# Reasoner sandbox
The requester's message and the thread content become model input as they are. With `REASONER_SANDBOX=docker`, each
request runs the reasoner in a new container that is removed when it finishes. In the code this is `DockerSandbox`
(`src/sandbox/docker.ts`), one implementation of the `Sandbox` interface; `REASONER_SANDBOX=none`, the default, is
`HostSandbox`, which runs the CLI on your Mac with your own login. See [Layers](architecture.md#layers).

## On this Mac

Nothing isolates the CLI's process here, so its own controls keep it to the reference directory (`MENTION_WORKSPACE`),
or to nothing without one:

- `claude` gets only `Read`, `Grep` and `Glob`, allowed in the reference directory alone (`Read(//dir/**)`); everything
  else is denied without asking (`dontAsk`). Without a reference directory it gets no tools.
- `codex` (0.138 or later) runs its shell under a permission profile that reads the platform's basics (`:minimal`) and the
  reference directory, with no writes and no network; codex's read-only sandbox would read the whole disk. `/tmp` stays
  readable, as codex's macOS sandbox always allows it. Your `~/.codex/config.toml` is not loaded (its MCP servers and
  sandbox settings stay out of answers); its `model` and `model_reasoning_effort` are passed along.
- Neither reads `.env` files in the reference directory, Pacenote's folders (`PACENOTE_HOME`, `PACENOTE_DATA_DIR`), or
  `~/.ssh`, `~/.aws`, `~/.config/gh`, `~/.claude`, `~/.codex` and the other usual credential folders, even when the
  reference directory holds them (`src/reasoners/reads.ts`).
- The CLI's environment leaves out Pacenote's secret settings: the Slack and hub tokens, the sandbox login, the Jira token.
- At startup and every 5 minutes, Pace checks that the CLI is installed, signed in and, for codex, new enough. What is
  missing shows in the status bar with what to do.

What leaves the Mac is not limited to allowed domains here; that is what the Docker sandbox below is for.

## Docker sandbox

```
bot (host) --docker run--> reasoner container --(internal network)--> egress-proxy --> allowed domains only
                           |- /workspace     reference directory (read-only, optional)
                           |- /attachments   attached images for codex (read-only)
                           |- /out           codex's generated images (the one writable mount)
                           |- /run/secrets   codex's auth.json (read-only)
                           |- HOME, /tmp     tmpfs, empty on every run
                           '- no other host files
```

Each CLI's adapter (`src/reasoners`) asks only for the mounts it needs; the paths are `SANDBOX_PATHS` in
`src/sandbox/runtime.ts`, and the reasoner image is built for them.

| Item | Limit |
| --- | --- |
| Filesystem | Read-only root. The only host files visible are the mounts above: the reference directory, attachments and the codex auth file read-only, and codex's output directory |
| Network | `internal` network with no external route. Only domains in `~/.pacenote/sandbox/allowed-domains.txt` are allowed, via CONNECT on 443 (the file is first created from `sandbox/proxy/allowed-domains.txt`) |
| Privileges | All capabilities dropped, `no-new-privileges`, uid 1000, pids/memory/CPU limits |
| Auth | claude gets `SANDBOX_CLAUDE_OAUTH_TOKEN` or `SANDBOX_ANTHROPIC_API_KEY` passed by environment variable name only (not exposed in process arguments). codex gets `auth.json` mounted read-only and copied to tmpfs |
| On failure | If the image, network or proxy is missing, the startup log says so and reasoner calls fail. It does not fall back to running on the host. |

Per backend:

- `claude`: it has no shell tool, so even inside the sandbox it can consult `/workspace` with `Read,Grep,Glob`.
  Use this combination when you need the reference directory.
- `codex`: inside the hardened container, codex's own sandbox (bubblewrap) cannot create namespaces, so every shell
  command is rejected. This state is kept so the outer isolation is not loosened, and the reference directory is not mounted.
  In other words, it answers from the thread context only. The model and reasoning effort are read from `model` and
  `model_reasoning_effort` in `~/.codex/config.toml` and passed along.

The domain allowlist keeps the model API domains open, so it cannot stop data being sent out through that API.
That is why the sandbox keeps a setup where shell tools do not work (claude has no shell, codex commands are rejected).

Setup:

```sh
pnpm sandbox:build     # build the reasoner image (claude, codex CLIs), the renderer image and the proxy image
pnpm sandbox:up        # start the egress proxy and the internal network (also run after changing the allowed domains)
claude setup-token     # for the claude backend: issue a subscription token -> SANDBOX_CLAUDE_OAUTH_TOKEN in .env
```

In the desktop app, Settings > Sandbox > Reasoner login > "Get token from Claude" does the `claude setup-token` step: it runs
the command (under `script`, which gives it the terminal it needs), you approve in the browser, and the token it prints is
saved to `SANDBOX_CLAUDE_OAUTH_TOKEN` without being shown, then checked with the API: the screen says whether Claude accepts it.
The token is checked the same way, with a call that uses no quota (the model list), when Pace starts (a rejected one shows
in the status bar's check issues) and in Settings > Sandbox's status ("Sandbox claude token"). The token is a one-year token for your own Claude subscription
(Pro, Max, Team or Enterprise); the bot answers only the people in `MENTION_ALLOWED_USERS` (start with yourself), and on
the [team hub](team-hub.md) each member's desktop answers only that member. Mounting `~/.claude` into the sandbox
is not an alternative: on macOS the login lives in the Keychain, and the folder holds every past session and your hooks.

The CLI versions are pinned by build args in `sandbox/compose.yaml`. When you upgrade the host CLI, bump them too and rebuild.
