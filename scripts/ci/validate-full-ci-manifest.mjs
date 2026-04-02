#!/usr/bin/env node
/**
 * Ensures shared/ci/full-ci-globs.json matches the full_ci glob list embedded in
 * .github/workflows/pr-mergeability-gate.yml (dorny/paths-filter filters block).
 */
import { readFileSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { parse as parseYaml } from "yaml";

const __dirname = dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = resolve(__dirname, "..", "..");

const MANIFEST = resolve(REPO_ROOT, "shared", "ci", "full-ci-globs.json");
const WORKFLOW = resolve(
  REPO_ROOT,
  ".github",
  "workflows",
  "pr-mergeability-gate.yml",
);

function sortStrings(a) {
  return [...a].sort((x, y) => x.localeCompare(y, "en"));
}

/**
 * Extract full_ci glob strings from parsed workflow YAML.
 * @param {object} wf
 * @returns {string[]}
 */
export function extractFullCiGlobsFromWorkflow(wf) {
  const steps = wf.jobs?.changes?.steps ?? [];
  const pf = steps.find(
    (s) => typeof s.uses === "string" && s.uses.includes("dorny/paths-filter"),
  );
  if (!pf?.with?.filters || typeof pf.with.filters !== "string") {
    throw new Error(
      "pr-mergeability-gate.yml: changes job must have dorny/paths-filter with string filters",
    );
  }
  const parsed = parseYaml(pf.with.filters);
  const list = parsed?.full_ci;
  if (!Array.isArray(list) || list.some((x) => typeof x !== "string")) {
    throw new Error(
      "pr-mergeability-gate.yml: filters must parse to { full_ci: string[] }",
    );
  }
  return list;
}

/**
 * @returns {{ ok: true } | { ok: false, message: string }}
 */
export function validateFullCiManifest() {
  const manifestRaw = readFileSync(MANIFEST, "utf8");
  const manifest = JSON.parse(manifestRaw);
  if (!Array.isArray(manifest) || manifest.some((x) => typeof x !== "string")) {
    return {
      ok: false,
      message: `${MANIFEST} must be a JSON array of strings`,
    };
  }

  const wfSrc = readFileSync(WORKFLOW, "utf8");
  const wf = parseYaml(wfSrc);
  let yamlGlobs;
  try {
    yamlGlobs = extractFullCiGlobsFromWorkflow(wf);
  } catch (e) {
    return { ok: false, message: String(e?.message ?? e) };
  }

  const a = sortStrings(manifest);
  const b = sortStrings(yamlGlobs);
  if (a.length !== b.length) {
    return {
      ok: false,
      message:
        `full_ci glob count mismatch: manifest has ${a.length}, workflow has ${b.length}\n` +
        `  manifest: ${JSON.stringify(a)}\n` +
        `  workflow: ${JSON.stringify(b)}`,
    };
  }
  for (let i = 0; i < a.length; i++) {
    if (a[i] !== b[i]) {
      return {
        ok: false,
        message:
          `full_ci glob mismatch at sorted index ${i}:\n` +
          `  manifest: ${a[i]}\n` +
          `  workflow: ${b[i]}\n` +
          `  (update shared/ci/full-ci-globs.json and pr-mergeability-gate.yml together)`,
      };
    }
  }
  return { ok: true };
}

function main() {
  const r = validateFullCiManifest();
  if (!r.ok) {
    console.error(r.message);
    process.exit(1);
  }
  console.log(
    "validate-full-ci-manifest: OK (manifest matches workflow full_ci globs)",
  );
}

if (
  process.argv[1] &&
  import.meta.url === pathToFileURL(resolve(process.argv[1])).href
) {
  main();
}
