# Distribution Layer

Skills are compiled and distributed via a GitHub-authored, CI-built, Cloudflare-served pipeline.

## Build commands

```bash
npm install                                        # first time only
node scripts/build/compile.mjs                     # validate + resolve compatibility + emit dist/
node scripts/build/compile.mjs --validate-only     # full validation, no file output
node scripts/build/compile.mjs --release           # emit with provenance (CI/release only)
node scripts/lint/skill.mjs shared/skills/*/SKILL.md        # schema + custom rules
node scripts/lint/platform.mjs shared/targets/platforms/*.yaml  # schema validation
```

The compiler reads the release version from `VERSION`. Local builds are deterministic (no timestamps, no git metadata). Provenance (`built_at`, `build_id`, `source_commit`) is only added in release mode (`--release` flag or `AI_CONFIG_RELEASE=1`).

Output: `dist/clients/<platform>/` (claude-code, cursor) + `dist/registry/index.json`

## Skill capability contract

Skills declare structured capability requirements in YAML frontmatter:

```yaml
capabilities:
  required: [git.read, shell.exec]     # must be supported for skill to work
  optional: [fs.write]                 # enhances skill but not essential
  fallback_mode: prompt-only           # none | manual | prompt-only
  fallback_notes: "User can paste git output manually"
```

Platform overrides are thin and optional (most skills need none):

```yaml
platforms:
  cursor:
    package: rules                     # override default package format
    mode: degraded                     # native | degraded | excluded
    notes: "No hook surface in Cursor"
  claude-web:
    allow_unverified: true             # emit even for unverified capabilities
```

Skills without a `platforms:` block are emitted to all platforms where required capabilities are supported. See `schemas/skill.schema.json` for the full contract.

## Platform definitions

Platform capability states live in `shared/targets/platforms/*.yaml`. Each capability has a status (`supported`/`unsupported`/`unknown`), evidence date, confidence level, and source. The compiler resolves skill-platform compatibility from these.

The registry includes `platform_definitions`: full capability definitions embedded at build time, letting the Worker serve canonical capability data without YAML file access. See `docs/CAPABILITY_API.md`.

## Capability Discovery API

The Worker exposes two CORS-enabled endpoints for all platforms (web, iOS, desktop):

```
GET /v1/capabilities/platform/{platform}   -> capability profile (immutable by platform)
GET /v1/skills/compatible?caps=cap1,cap2   -> filtered skills (immutable by version+caps)
```

Reference client: `adapters/claude/capabilities-client.mjs`
Full API docs: `docs/CAPABILITY_API.md`
Web integration guide: `docs/WEB_INTEGRATION.md`

## Worker deployment

```bash
cd worker
wrangler secret put AUTH_TOKEN         # set bearer token
wrangler deploy                        # deploy to Cloudflare

# Deploy executor Worker first (Phase 1 path)
cd worker/executor && npm install && wrangler deploy
cd ../ && wrangler deploy              # main Worker (includes service binding)
```

See `worker/executor/README.md` for the executor Worker: tools, architecture, and local development.

## Fetching from Worker (local)

```bash
export AI_CONFIG_TOKEN=<your-token>
export AI_CONFIG_WORKER=https://ai-config-os.workers.dev  # or local URL
bash adapters/claude/materialise.sh         # fetch + cache
bash adapters/claude/materialise.sh status  # compare local vs remote version
```
