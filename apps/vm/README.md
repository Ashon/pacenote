# pacenote-vm

The built-in reasoner sandbox's helper: it runs one process in a lightweight Linux VM of its own, on Apple's
[Containerization](https://github.com/apple/containerization) and Virtualization.framework. Pace's `VmSandbox`
(`src/sandbox/vm.ts`) starts it for each request; [Reasoner sandbox](../../docs/sandbox.md#built-in-sandbox) says what
the VM can and cannot do.

```
pacenote-vm prepare --root R                       the init filesystem (vminitd), once the kernel is in R/kernel
pacenote-vm build --root R --base REF --name N [--label K=V] [run options] -- SCRIPT ARGS...
pacenote-vm run --root R --image N [run options] -- COMMAND ARGS...
pacenote-vm status --root R                        what is ready, as JSON
```

Run options: `--mount HOST:GUEST[:rw]` (read-only unless `:rw`; a file is copied in alone), `--tmpfs GUEST[:OPTIONS]`,
`--env NAME` (the value from pacenote-vm's own environment) or `--env NAME=VALUE`, `--workdir`, `--user UID[:GID]`,
`--cpus`, `--memory` (MiB), and the sockets: `--egress SOCKET`, a unix socket on the host the guest sees as
`/run/pacenote/egress.sock`, its only way out (the VM has no network device); `--relay HOST:NAME`, another one
appearing as `/run/pacenote/NAME` (the ops broker's, in reasoner VMs); and `--publish GUEST:HOST`, a socket a process in
the guest listens on, appearing on the host (the broker's MCP server). `run --writable-root` lets the process write over
its copy of the image. `run` gives the command its stdin, stdout and stderr and exits with its code; SIGTERM or SIGINT
stops the VM. Each run boots from APFS clones of the image and init
filesystem, so runs at the same time do not share a disk. `build --label KEY=VALUE` keeps a value with the image, which
`status` reports: Pacenote keeps the hash of the image's recipe there, to tell an image built by another version.

Building needs Swift 6.2 or later (Xcode 26), and running needs Apple silicon with macOS 15 or later:

```sh
pnpm vm:build      # swift build -c release, then an ad-hoc signature with vm.entitlements
pnpm sandbox:vm    # sets up ~/.pacenote/vm: the kernel, the init filesystem and the reasoner image
```

VMs start only with the `com.apple.security.virtualization` entitlement (`vm.entitlements`). The Apple silicon app
carries the helper in `Contents/MacOS` (`apps/desktop/scripts/package-mac.mjs`), signed with it; the Intel app goes
without, since Intel Macs cannot run it.

`pnpm test:e2e` runs `tests/e2e/vm.e2e.ts` against real VMs when the helper is built (it skips otherwise, and in CI,
where VMs cannot nest). Its kernel, init filesystem and test image stay in `$TMPDIR/pacenote-e2e-vm` between runs.
