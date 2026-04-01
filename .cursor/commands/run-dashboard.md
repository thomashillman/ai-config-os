# Run AI Config OS dashboard (local)

Start the local dashboard stack. Repo root is the ai-config-os workspace folder.

## Steps

1. **Env file:** Confirm `dashboard/.env.local` exists and has non-empty `VITE_WORKER_URL` and `VITE_AUTH_TOKEN`. If not, tell the user to create it — do not claim the stack is ready.

2. **Ports:** `ops/dashboard-start.sh` already frees **4242** and **5173** at startup (any listener on those ports). You do **not** need a separate kill loop unless you must clear a stuck process **before** the script runs; if so, use `lsof -iTCP:PORT` without `-i4` so IPv4 and IPv6 listeners are included.

3. **Start orchestrator** with the Shell tool in the background (`block_until_ms: 0`):

   ```bash
   cd <repo-root> && bash ops/dashboard-start.sh
   ```

4. **Success criteria:** Poll the terminal output every 2 seconds for up to **45 seconds**. Treat as **ready** only when this line appears:

   ```
   [dashboard] Stack is ready.
   ```

   Do **not** treat older text like `Stack is up` as success — the script prints **`Stack is ready`** only after Vite responds on `http://127.0.0.1:5173`.

5. **If startup errors:** Report `[dashboard] ERROR:` lines, publish failures, or missing **`curl`**, **`lsof`**, or **`yq`** (surface install hints from the script output). If publish was skipped because `yq` is missing, say: install with `brew install yq` and re-run the script (or run `node runtime/publish-dashboard-state.mjs` after installing).

6. **When ready:** Tell the user:
   - Open **http://localhost:5173** (or **http://127.0.0.1:5173**)
   - The script may have opened the browser automatically
   - To stop: **`/ai-config-os/stop-dashboard`** or Ctrl+C in the terminal running the script

Do not claim success until **`[dashboard] Stack is ready.`** appears.
