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
                                |- /run/login     the CLI's own login folder (Reasoner login)
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
| Filesystem | The reasoner image read-only, and only the mounts above. The login folder holds only what the CLI keeps to stay signed in; the rest it leaves there goes once no run is using it |
| Network | No network device at all. The CLIs' `HTTPS_PROXY` is 127.0.0.1:3128, which the image forwards over a socket that pacenote-vm relays to Pace's own egress proxy (`src/sandbox/egress.ts`). It lets through only the domains in `~/.pacenote/sandbox/allowed-domains.txt` (exact names; CONNECT on 443, and plain HTTP; first created from `sandbox/allowed-domains.txt`), and reads it again when it changes, so an edit applies to the next request. It looks each name up itself and connects to that address, never to this Mac's own (loopback), the link-local range (where cloud metadata answers), "any" or multicast, even for an allowed name; private ranges stay reachable by name |
| Privileges | uid 1000, the memory and CPUs set in Settings > Sandbox |
| Auth | The CLI signed in inside the sandbox, into its own login folder ([Reasoner login](#reasoner-login)); Pacenote never reads it. Instead, claude can get `SANDBOX_ANTHROPIC_API_KEY` or a token set by hand, by variable name only (not in process arguments) |
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
5. With connections on (Settings > Tools), the ops broker's image: the broker then runs in a VM of its own while Pace
   runs, its way out limited to the connections in use (see [Tools](ops-tools.md#in-the-built-in-sandbox)).

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

The sandbox signs in to Claude Code or Codex on its own, apart from this Mac's login. In the desktop app, Settings >
Sandbox > Reasoner login > "Sign in to Claude" (or "Codex") runs the CLI's own login in a VM of its own
(`src/sandbox/vm-login.ts`):

- Claude: `claude auth login` prints a claude.com page. You approve there, and the page shows a code, which you paste
  into Pacenote; Pacenote hands it to the CLI.
- Codex: `codex login --device-auth` prints an OpenAI page and a one-time code, which you enter there.

The CLI keeps what it gets in a login folder of its own, `~/.pacenote/vm/login/claude` or `.../codex`. Each run's VM
has that folder at `/run/login` as the CLI's config folder (`CLAUDE_CONFIG_DIR`, `CODEX_HOME`), so the CLI renews its
login there itself. Pacenote never reads the folder: it checks only whether the credentials file is there, and once no
run is using the folder it removes everything else the CLI left (sessions, history, logs), as HOME is emptied after
every run. Signing in uses your own plan (Claude Pro, Max, Team or Enterprise; ChatGPT Plus, Pro or Business), and the
bot answers only you (`MENTION_ALLOWED_USERS`); on the [team hub](team-hub.md) each member's desktop signs in and
answers only that member.

This follows Claude Code's terms, which let an end user sign in to the unmodified Claude Code binary with their own
subscription, including where a platform hosts it, and bar a product from collecting or storing claude.ai credentials:
the sign-in completes on Anthropic's own page, and the credentials stay with the CLI. This Mac's own codex login
(`~/.codex/auth.json`) is not copied in, so a login the sandbox renews never undoes this Mac's.

The login reaches only `platform.claude.com` and `api.anthropic.com` (Claude) or `auth.openai.com` (Codex). Runs allow
the domains the CLI needs whether or not the allowed-domains file lists them yet: `platform.claude.com` is where claude
renews its login.

Not signed in yet, Pace still starts, and the status bar says what to do. An Anthropic API key
(`SANDBOX_ANTHROPIC_API_KEY`) works instead of signing in to Claude, and is checked with a call that uses no quota (the
model list) when Pace starts and in Settings > Sandbox's status. A token from `claude setup-token` you run yourself
(`sandbox.claudeToken`) is still read, after the sign-in. Pacenote never calls Anthropic's API with a claude.ai token.

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
