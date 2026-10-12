#!/bin/sh
# What a run sees in the built-in sandbox, one fact a line, for vm.e2e.ts.
# Reads stdin first, as the CLIs read their prompt.
echo "stdin: $(cat)"
echo "kernel: $(uname -s) $(uname -m)"
echo "user: $(id -u):$(id -g)"
echo "devices: $(ls /sys/class/net | tr '\n' ' ' | sed 's/ $//')"
echo "workdir: $(pwd)"
echo "secret: ${PACENOTE_E2E_SECRET:-missing}"
echo "workspace: $(cat /workspace/note.txt)"
if touch /workspace/x 2>/dev/null; then echo "workspace write: yes"; else echo "workspace write: no"; fi
if touch /etc/x 2>/dev/null; then echo "root write: yes"; else echo "root write: no"; fi
echo "answer" > /out/result.txt && echo "out write: yes"
touch "$HOME/scratch" && echo "home write: yes"
echo "auth: $(cat /run/secrets/codex-auth.json 2>/dev/null || echo missing)"
echo "auth folder: $(ls /run/secrets | tr '\n' ' ' | sed 's/ $//')"
exit 3
