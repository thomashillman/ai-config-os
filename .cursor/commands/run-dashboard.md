# Run AI Config OS dashboard (local)

Run the dashboard stack for this repository. Assume workspace folder is the ai-config-os repo root.

1. **API (MCP + dashboard API):** In a terminal from repo root, start the server (default `127.0.0.1:4242`):
   - `bash runtime/mcp/start.sh`
   - Run in the background or in a dedicated terminal so it keeps running.

2. **UI (Vite):** In a second terminal:
   - `cd dashboard`
   - If dependencies are missing: `npm install` or `npm ci`
   - `npm run dev`

3. **Open** the URL Vite prints (typically `http://localhost:5173`).

4. If something fails: confirm nothing else is bound to ports **4242** or **5173**, and that **Node 18+** is in use.

For non-loopback access, configure tunnel/CORS per README (e.g. `DASHBOARD_PUBLIC_ORIGINS`); see repository README Step 3.

Do not claim success until both processes are running and the browser loads the app.
