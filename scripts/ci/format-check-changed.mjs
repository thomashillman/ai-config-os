#!/usr/bin/env node
/**
 * Run Prettier --check only on files changed vs the merge base (CI PRs) or
 * a given ref. Respects .prettierignore via Prettier. Uses --ignore-unknown
 * for mixed file lists. Invokes Prettier in batches to avoid OS argv limits
 * on very large PRs.
 *
 * Env:
 *   MERGE_BASE_REF — base branch name without refs/heads (e.g. main). Default: main.
 *
 * Usage: MERGE_BASE_REF=main node scripts/ci/format-check-changed.mjs
 */
import { spawnSync } from "child_process";
import { existsSync } from "fs";
import { createRequire } from "module";
import { resolve, dirname } from "path";
import { fileURLToPath } from "url";
import { chunkArray } from "./lib/chunk-array.mjs";

const __dirname = dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = resolve(__dirname, "..", "..");
const require = createRequire(import.meta.url);

/** Max paths per Prettier invocation (argv safety on huge PRs). */
const PRETTIER_PATH_BATCH = 50;

const baseRef = process.env.MERGE_BASE_REF || "main";
const mergeRange = `origin/${baseRef}...HEAD`;

function git(args) {
  const r = spawnSync("git", args, {
    cwd: REPO_ROOT,
    encoding: "utf8",
  });
  if (r.status !== 0) {
    console.error(r.stderr || r.stdout || `git ${args.join(" ")} failed`);
    process.exit(r.status ?? 1);
  }
  return r.stdout.trim();
}

const names = git(["diff", "--name-only", "--diff-filter=ACMRT", mergeRange])
  .split("\n")
  .map((s) => s.trim())
  .filter(Boolean)
  .filter((p) => existsSync(resolve(REPO_ROOT, p)));

if (names.length === 0) {
  console.log("format-check-changed: no changed files to check");
  process.exit(0);
}

let prettierEntry;
try {
  prettierEntry = require.resolve("prettier/bin/prettier.cjs");
} catch {
  console.error("format-check-changed: prettier not installed (run npm ci)");
  process.exit(1);
}

const batches = chunkArray(names, PRETTIER_PATH_BATCH);
for (let i = 0; i < batches.length; i++) {
  const batch = batches[i];
  if (batches.length > 1) {
    console.log(
      `format-check-changed: batch ${i + 1}/${batches.length} (${batch.length} file(s))`,
    );
  }
  const r = spawnSync(
    process.execPath,
    [prettierEntry, "--check", "--ignore-unknown", ...batch],
    {
      cwd: REPO_ROOT,
      stdio: "inherit",
      env: { ...process.env },
    },
  );
  if (r.status !== 0) {
    process.exit(r.status ?? 1);
  }
}
process.exit(0);
