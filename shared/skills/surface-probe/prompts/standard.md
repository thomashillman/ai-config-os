# Surface Probe — Standard Investigation

The user has manually stated their surface or corrected an incorrect detection. Your job is to investigate all available environment signals and produce a structured report.

## Step 1: Acknowledge and compare

State the user's declared surface and what the current probe report says. Check whether `~/.ai-config-os/probe-report.json` exists and read it if possible. Note the `platform_hint` and `surface_hint` values.

## Step 2: Investigate environment signals

**If `shell.exec` is available**, run the following and capture all output:

```bash
env | grep -iE 'claude|cursor|codex|term|surface|platform|entrypoint|remote|mobile|web|app' | sort
```

Also check:
- `echo $CLAUDE_CODE_ENTRYPOINT` — the primary surface signal (known values: `remote_mobile`, `web`, `sdk-py`)
- `echo $CLAUDE_CODE_REMOTE` — true for all remote sessions
- `echo $CLAUDE_CODE_REMOTE_ENVIRONMENT_TYPE` — may indicate cloud vs local
- `echo $TERM_PROGRAM` — terminal identifier (iTerm2, Apple_Terminal, vscode, etc.)
- `echo $CURSOR_SESSION`, `echo $CODEX_CLI` — IDE/tool signals

**If `shell.exec` is NOT available** (mobile/web platform), investigate from observable context:
- What does the session-start output show for `platform_hint` and `surface_hint`?
- Are there any other session metadata clues visible?
- Note that from a cloud execution environment, many signals are unavailable — document this as a gap.

## Step 3: Produce a structured report

Output the following fields clearly:

```
stated_surface: <what the user said>
detected_platform: <platform_hint from probe report>
detected_surface: <surface_hint from probe report>
match: yes | no | partial

new_signals:
  - name: <env var or signal name>
    value: <current value>
    reliability: high | medium | low
    notes: <why this is or isn't a reliable detector>

recommendation:
  type: probe_update | workaround | no_change | open_issue
  detail: <concrete action — e.g. "Add case 'remote_mobile' to detect_platform() in ops/capability-probe.sh before the CLAUDE_CODE_REMOTE check">

workaround:
  command: CLAUDE_SURFACE=<value>
  notes: <when to use this>
```

## Step 4: Flag for future improvement

If a new reliable signal is found:
- State exactly which lines in `ops/capability-probe.sh` would change
- Note which `CLAUDE_CODE_ENTRYPOINT` value (or other var) was observed
- Confirm this should be filed as a probe improvement

If no signal is found:
- State this clearly: the mobile browser vs desktop browser distinction is not detectable from within the remote shell
- Recommend the `CLAUDE_SURFACE` workaround
- Recommend opening an issue if this gap affects workflow
