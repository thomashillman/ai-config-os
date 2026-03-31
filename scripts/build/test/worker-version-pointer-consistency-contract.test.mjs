/**
 * worker-version-pointer-consistency-contract.test.mjs
 *
 * Contract gate: worker responses must source the published version pointer
 * from dist/registry/index.json (single source of truth), not hardcoded values.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join, resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = resolve(__dirname, "..", "..", "..");

function workerSource(path) {
  return readFileSync(join(REPO_ROOT, "worker", "src", path), "utf8");
}

test("worker version-pointer contract: entrypoint injects registry into shared handler", () => {
  const src = workerSource("index.ts");
  assert.match(
    src,
    /import REGISTRY_JSON from '\.\.\/\.\.\/dist\/registry\/index\.json';/,
  );
  assert.match(src, /createWorkerHandler\(REGISTRY_JSON/);
});

test("worker version-pointer contract: health/client/skill handlers use injected registry version", () => {
  const src = workerSource("handlers/artifacts.ts");
  assert.match(src, /version:\s*registry\.version/);
  assert.match(src, /built_at:\s*registry\.built_at/);
});
