# Stop AI Config OS dashboard (local)

Stop the local dashboard stack. Repo root is the ai-config-os workspace folder.

## Steps

1. **Kill all listeners on 4242 and 5173** (IPv4 and IPv6 — do not use `-i4` only). Portable pattern that handles **multiple PIDs** per port (macOS/Linux):

   ```bash
   for p in 4242 5173; do
     for pid in $(lsof -t -iTCP:$p -sTCP:LISTEN 2>/dev/null); do
       [ -n "$pid" ] && kill "$pid" 2>/dev/null || true
     done
   done
   sleep 0.5
   ```

2. **If still listening**, force kill:

   ```bash
   for p in 4242 5173; do
     for pid in $(lsof -t -iTCP:$p -sTCP:LISTEN 2>/dev/null); do
       [ -n "$pid" ] && kill -9 "$pid" 2>/dev/null || true
     done
   done
   ```

3. **Verify** (no output means free):

   ```bash
   lsof -nP -iTCP:4242 -sTCP:LISTEN; lsof -nP -iTCP:5173 -sTCP:LISTEN
   ```

4. Report: **Dashboard stopped. Ports 4242 and 5173 are free.**

If a process survives, name it from `lsof` output so the user can quit that terminal or kill the PID manually.
