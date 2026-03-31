/**
 * manifest-flags.mjs
 *
 * Reads runtime feature flags from runtime/manifest.yaml for Node.js consumers.
 * Uses a simple line-by-line parser — no npm YAML dependency required.
 * Falls back to safe all-false defaults if the file is missing or unreadable.
 */
import { readFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { validateManifestFeatureFlags } from "../../scripts/build/lib/versioning.mjs";

const __dirname = dirname(fileURLToPath(import.meta.url));
const DEFAULT_MANIFEST_PATH = join(__dirname, "..", "manifest.yaml");

let _cached = null;

/**
 * Parse the feature_flags block from a manifest YAML string.
 * Recognises lines of the form `  key: true` or `  key: false` (2-space indent).
 *
 * @param {string} content - YAML file content
 * @returns {{ [key: string]: boolean }} raw flags object
 */
export function readManifestYaml(content) {
  const flags = {};
  let inFlagsBlock = false;
  for (const line of content.split("\n")) {
    if (line.trimEnd() === "feature_flags:") {
      inFlagsBlock = true;
      continue;
    }
    if (inFlagsBlock) {
      // Direct children of feature_flags: have exactly 2-space indent
      const match = line.match(/^  (\w+):\s*(true|false)\s*$/);
      if (match) {
        flags[match[1]] = match[2] === "true";
        continue;
      }
      // Any non-empty line without 2-space indent ends the block
      if (line.trim() && !line.startsWith("  ")) {
        break;
      }
    }
  }
  return flags;
}

/**
 * Read and validate manifest feature flags from a YAML file.
 * Falls back to all-false defaults if the file is missing or unreadable.
 *
 * @param {string} [manifestPath] - path to manifest.yaml (defaults to runtime/manifest.yaml)
 * @returns {{ outcome_resolution_enabled: boolean, effective_contract_required: boolean, remote_executor_enabled: boolean }}
 */
export function loadManifestFlags(manifestPath = DEFAULT_MANIFEST_PATH) {
  let rawFlags = {};
  try {
    const content = readFileSync(manifestPath, "utf8");
    rawFlags = readManifestYaml(content);
  } catch {
    // File missing or unreadable — use safe defaults
  }
  return validateManifestFeatureFlags(rawFlags);
}

/**
 * Cached manifest flags reader. Reads once per process lifecycle.
 * Call _resetCache() in tests to clear between runs.
 *
 * @param {string} [manifestPath] - overrides the default path (only used on first call)
 * @returns {{ outcome_resolution_enabled: boolean, effective_contract_required: boolean, remote_executor_enabled: boolean }}
 */
export function getManifestFlags(manifestPath) {
  if (_cached === null) {
    _cached = loadManifestFlags(manifestPath);
  }
  return _cached;
}

/**
 * Reset the module-level cache. For testing only.
 */
export function _resetCache() {
  _cached = null;
}
