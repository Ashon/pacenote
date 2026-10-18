# Reasoner sandbox
The requester's message and the thread content become model input as they are. With `REASONER_SANDBOX=vm`, each
request runs the reasoner in a lightweight Linux VM of its own, built into Pacenote, gone when the request finishes. In
the code this is `VmSandbox` (`src/sandbox/vm.ts`), an implementation of the `Sandbox` interface; `REASONER_SANDBOX=none`,
the default, is `HostSandbox`, which runs the CLI on your Mac with your own login. See [Layers](architecture.md#layers).

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

What leaves the Mac is not limited to allowed domains here; that is what the built-in sandbox is for.

## Built-in sandbox

```
bot (host) --pacenote-vm run--> a Linux VM of its own, with no network device
                                |- the reasoner image   read-only root
                                |- /workspace     reference directory (read-only, optional)
                                |- /attachments   attached images for codex (read-only)
                                |- /out           codex's generated images (the one writable mount)
                                |- /run/secrets   codex's auth.json (read-only)
                                |- HOME, /tmp     tmpfs, empty on every run
                                |- 127.0.0.1:3128 --socket--> egress proxy in Pace --> allowed domains only
                                '- 127.0.0.1:8080 --socket--> the run's door in Pace --> /pace/mcp: Pace's own tools
                                                                                   '-> the rest: the ops broker
```

Settings > Sandbox > Run environment > "Built-in sandbox" (`REASONER_SANDBOX=vm`) runs each request in a VM of its own,
which starts in under a second. `VmSandbox` asks `pacenote-vm` to start it: a helper in the app (`apps/vm`, Swift on
Apple's [Containerization](https://github.com/apple/containerization) and Virtualization.framework). Nothing else is
installed. It needs a Mac with Apple silicon and macOS 15 or later; on other Macs, answers run on this Mac.

Each CLI's adapter (`src/reasoners`) asks only for the mounts it needs; the paths are `SANDBOX_PATHS` in
`src/sandbox/runtime.ts`, and the reasoner image is built for them.

| Item | Limit |
| --- | --- |
| Isolation | A VM per request under its own Linux kernel, stopped when the request ends or is cut off. Requests at the same time each get their own |
| Filesystem | The reasoner image read-only, and only the mounts above. A single file (codex's `auth.json`) is copied into the VM alone, never with its folder |
| Network | No network device at all. The CLIs' `HTTPS_PROXY` is 127.0.0.1:3128, which the image forwards over a socket that pacenote-vm relays to Pace's own egress proxy (`src/sandbox/egress.ts`). It lets through only the domains in `~/.pacenote/sandbox/allowed-domains.txt` (exact names; CONNECT on 443, and plain HTTP; first created from `sandbox/allowed-domains.txt`), and reads it again when it changes, so an edit applies to the next request. It looks each name up itself and connects to that address, never to this Mac's own (loopback), the link-local range (where cloud metadata answers), "any" or multicast, even for an allowed name; private ranges stay reachable by name |
| Privileges | uid 1000, the memory and CPUs set in Settings > Sandbox |
| Auth | claude gets `SANDBOX_CLAUDE_OAUTH_TOKEN` or `SANDBOX_ANTHROPIC_API_KEY` by variable name only (not in process arguments); codex gets its `auth.json` read-only, copied to tmpfs |
| Pace's own tools | Each run gets a door of its own, a socket relayed in at 127.0.0.1:8080. Under `/pace/mcp` it serves Pacenote's tools for the person Pace answers ([Asking Pace in Slack](tasks.md#asking-pace-in-slack)), which read and write Pacenote's files here on this Mac; the VM never sees them. The rest goes to the ops broker, when ops tools are on |
| On failure | Settings > Sandbox and the status bar say what is missing and how to set it up. Reasoner calls fail; it does not fall back to running on the host |

Per backend:

- `claude`: it has no shell tool, so even inside the sandbox it can consult `/workspace` with `Read,Grep,Glob`.
  Use this combination when you need the reference directory.
- `codex`: inside the VM, codex's own sandbox (bubblewrap) cannot create namespaces, so every shell command is rejected.
  This state is kept so the outer isolation is not loosened, and the reference directory is not mounted. In other
  words, it answers from the thread context only. The model and reasoning effort are read from `model` and
  `model_reasoning_effort` in `~/.codex/config.toml` and passed along.

The domain allowlist keeps the model API domains open, so it cannot stop data being sent out through that API.
That is why the sandbox keeps a setup where shell tools do not work (claude has no shell, codex commands are rejected).

Setup: "Set up built-in sandbox" in Settings > Sandbox, or `pnpm sandbox:vm` in the repository. It keeps everything in
`~/.pacenote/vm`:

1. The Linux kernel: Kata Containers' build, the one Containerization is tested with. It is downloaded once (about
   14 MB) from `ghcr.io/ashon/pacenote-kernel`, by its pinned SHA-256 (`KERNEL` in `src/sandbox/vm-setup.ts`), where the
   `kernel` workflow publishes it from Kata's release archive. When ghcr.io cannot give it, the setup takes it from that
   archive itself (about 290 MB), checked against its own pinned hash and then the kernel's.
2. The init filesystem: vminitd, from `ghcr.io/apple/containerization/vminit`.
3. The reasoner image, built in a VM from `node:24-bookworm-slim` by `sandbox/vm/build.sh`. The build's own way out goes
   only to `deb.debian.org` and `registry.npmjs.org`.
4. With diagrams on, the diagram renderer's image (`sandbox/vm/renderer-build.sh`): chromium for mermaid, graphviz,
   librsvg and vl-convert, with `pypi.org` and `files.pythonhosted.org` added to the build's way out, and the app's
   typeface, Pretendard, from its npm package.
5. With ops tools on, the ops broker's image: the broker then runs in a VM of its own while Pace runs, its way out
   limited to what its settings name (see [Ops tools](ops-tools.md#in-the-built-in-sandbox)).

### The kernel's source

The kernel is Linux 6.12.28 as Kata Containers builds it for its 3.17.0 release (`vmlinux-6.12.28-153`, kernel
configuration version 153), republished unchanged. It is licensed under the GNU General Public License, version 2. Its
source is the [Linux 6.12.28 release](https://cdn.kernel.org/pub/linux/kernel/v6.x/linux-6.12.28.tar.xz) with the
configuration, patches and build script in
[kata-containers 3.17.0, tools/packaging/kernel](https://github.com/kata-containers/kata-containers/tree/3.17.0/tools/packaging/kernel).
If you cannot get it there, open an issue in this repository and the source is sent to you.

Each image is built from a recipe (`src/sandbox/vm-images.ts`): its script and the other files of `sandbox/vm` it
installs, the versions it pins in `VERSIONS`, and its settings. The image keeps its recipe's hash, so when a newer
Pacenote changes a recipe, Settings > Sandbox says "Update needed" and the status bar says which images were built for
another version. They still run until the setup builds them anew; running it again builds only those. When you upgrade
the host CLI, bump it in `VERSIONS` too.

Diagrams and charts in answers render in a VM of the renderer's image with no way out at all, seeing only the folder with
the block and its PNG; generated images are shrunk there too. That works whatever the run environment, once the built-in
sandbox is set up, so it needs Apple silicon and macOS 15 as well.

## Reasoner login

In the desktop app, Settings > Sandbox > Reasoner login > "Get token from Claude" does the `claude setup-token` step: it runs
the command (under `script`, which gives it the terminal it needs), you approve in the browser, and the token it prints is
saved to `SANDBOX_CLAUDE_OAUTH_TOKEN` without being shown. Pacenote never calls Anthropic's API with it: a claude.ai token is
for Claude Code itself, so one that stopped working shows when a mention fails on it (in the status bar's check issues).
An API key (`SANDBOX_ANTHROPIC_API_KEY`) is checked with a call that uses no quota (the model list) when Pace starts and in
Settings > Sandbox's status ("Sandbox claude token"). The token is a one-year token for your own Claude subscription
(Pro, Max, Team or Enterprise); the bot answers only you (`MENTION_ALLOWED_USERS`), and on the [team hub](team-hub.md)
each member's desktop answers only that member. Mounting `~/.claude` into the sandbox
is not an alternative: on macOS the login lives in the Keychain, and the folder holds every past session and your hooks.

From a terminal, `claude setup-token` prints the same token; put it in `sandbox.claudeToken` in
`~/.pacenote/settings.json`.

## Before the built-in sandbox

Pacenote used to offer a Docker sandbox. It is gone: `REASONER_SANDBOX=docker` is read as the built-in sandbox, and
moving an earlier version's `.env` into `settings.json` rewrites it. Nothing uses its containers, network and images any
more, but the proxy and broker containers restart with Docker until removed:

```sh
docker rm -f pacenote-sandbox-egress-proxy-1 pacenote-sandbox-ops-broker-1
docker network rm pacenote-sandbox pacenote-egress
docker volume rm pacenote-sandbox_ops-work
docker image rm pacenote-reasoner pacenote-renderer pacenote-egress-proxy pacenote-ops-broker
```
