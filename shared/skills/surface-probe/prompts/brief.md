# Surface Probe — Brief Investigation

The user stated their surface. Quickly check the key signals and summarise in one paragraph.

Check in this order:
1. `$CLAUDE_CODE_ENTRYPOINT` — primary surface signal (`remote_mobile` = iOS, `web` = web app)
2. `$CLAUDE_CODE_REMOTE` — true for all remote sessions
3. `$CURSOR_SESSION`, `$CODEX_CLI` — IDE/tool signals
4. Current `probe-report.json` values if available

Produce a brief paragraph covering:
- Stated surface vs detected surface
- Whether a matching env var signal was found
- One-line recommendation (probe update, CLAUDE_SURFACE workaround, or no action needed)
