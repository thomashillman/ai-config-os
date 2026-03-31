/**
 * sync-loop-etag-version-contract.test.mjs
 *
 * Contract gate: sync/fetch path must resolve version metadata from the worker
 * payload and persist it in the local latest.json cache file.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join, resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = resolve(__dirname, "..", "..", "..");

test("sync loop contract: materialise fetch uses the latest worker endpoint", () => {
  const script = readFileSync(
    join(REPO_ROOT, "adapters", "claude", "materialise.sh"),
    "utf8",
  );

  assert.match(script, /\/v1\/client\/claude-code\/latest/);
});

test("sync loop contract: cached payload is persisted to latest.json", () => {
  const script = readFileSync(
    join(REPO_ROOT, "adapters", "claude", "materialise.sh"),
    "utf8",
  );

  assert.match(script, /latest\.json/);
  assert.match(script, /cp "\$\{payload_file\}" "\$\{latest_tmp\}"/);
  assert.match(script, /mv "\$\{latest_tmp\}" "\$\{CACHE_DIR\}\/latest\.json"/);
});

test("sync loop contract: version is read from cached payload", () => {
  const script = readFileSync(
    join(REPO_ROOT, "adapters", "claude", "materialise.sh"),
    "utf8",
  );

  // Version is now extracted with jq instead of python3
  assert.match(script, /jq -r '\.version/);
});
