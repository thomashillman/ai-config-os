# Staging Durable Object Migration Runbook (Rollout Step 2)

## 1) Purpose and scope

Step 2 manually applies the **staging** Durable Object migration for `TaskObject` so Cloudflare registers the class before automated Workers Builds rollout steps. This step only runs the one-time migration deploy to staging and records evidence.

## 2) Preconditions

- You are on the rollout branch that includes the migration script and `TaskObject` changes.
- You are authenticated for Wrangler (`npx wrangler whoami` succeeds) and have staging deploy permissions.
- Repo dependencies are installed (`npm install` already completed).
- `worker/wrangler.toml` still has the DO binding commented out and `TASK_DO_DUAL_WRITE` still set to `"false"`.

## 3) Exact commands to run

From repository root:

```bash
set -euo pipefail
mkdir -p evidence/do-migration

# Optional operator context capture
(date -u '+%Y-%m-%dT%H:%M:%SZ'; git rev-parse --short HEAD) \
  | tee evidence/do-migration/staging-step2-context.log

npm run build 2>&1 | tee evidence/do-migration/staging-step2-build.log
bash scripts/deploy/apply-do-migration.sh staging 2>&1 \
  | tee evidence/do-migration/staging-step2-migration.log
```

## 4) Evidence capture requirements

Save and retain these files:

- `evidence/do-migration/staging-step2-context.log`
- `evidence/do-migration/staging-step2-build.log`
- `evidence/do-migration/staging-step2-migration.log`

The migration log must include both:

- `Migration applied successfully (env: staging)`
- `Restored wrangler.toml to pre-migration state`

## 5) What success looks like

- Build command exits `0`.
- Migration command exits `0`.
- Migration log includes the success markers above.
- `git status --short worker/wrangler.toml` shows no persistent diff from the script run.

## 6) What failure looks like

Any of the following is a failure:

- `npm run build` exits non-zero.
- `bash scripts/deploy/apply-do-migration.sh staging` exits non-zero.
- Migration log is missing the success marker or restoration marker.
- `worker/wrangler.toml` remains modified after the script returns.

On failure: stop rollout, attach the three evidence logs, and escalate before retrying.

## 7) Do not do this yet

In Step 2, do **not**:

- uncomment the Durable Object binding in `worker/wrangler.toml`
- enable `TASK_DO_DUAL_WRITE`
- change runtime code

## 8) Exit criteria for handoff to next rollout step

Hand off to the next rollout step only when all are true:

- Preconditions were met.
- Build and migration commands both succeeded.
- Required evidence logs were captured and shared.
- `worker/wrangler.toml` is restored (no lingering changes from migration injection).
- No binding/flag/runtime-code changes were made during this step.
