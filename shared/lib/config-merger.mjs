#!/usr/bin/env node
// Merge three-tier config: global < machine < project
// Outputs merged YAML to stdout
// Usage: node shared/lib/config-merger.mjs [--debug]
import { readFileSync, existsSync, mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { homedir, hostname } from "node:os";
import { createHash } from "node:crypto";
import { execSync } from "node:child_process";
import { parse as parseYaml, stringify as stringifyYaml } from "yaml";

const DEBUG = process.argv.includes("--debug");
const log = (msg) => {
  if (DEBUG) process.stderr.write(`[config-merger] ${msg}\n`);
};

// Resolve repo root
let REPO_ROOT;
try {
  REPO_ROOT = execSync("git rev-parse --show-toplevel", {
    encoding: "utf8",
  }).trim();
} catch {
  process.stderr.write("[error] Not inside a git repository\n");
  process.exit(1);
}

const CONFIG_DIR = join(REPO_ROOT, "runtime", "config");
const MACHINE_NAME = hostname();

const GLOBAL = join(CONFIG_DIR, "global.yaml");
const MACHINE = join(CONFIG_DIR, "machines", `${MACHINE_NAME}.yaml`);
const PROJECT = join(CONFIG_DIR, "project.yaml");

// Validate global config exists
if (!existsSync(GLOBAL)) {
  process.stderr.write(`[error] global.yaml not found at ${GLOBAL}\n`);
  process.exit(1);
}

// Collect files to load in priority order: global < machine < project
const filesToMerge = [GLOBAL];
log(`Loaded global config`);

if (existsSync(MACHINE)) {
  log(`Merging machine config: ${MACHINE}`);
  filesToMerge.push(MACHINE);
}

if (existsSync(PROJECT)) {
  log(`Merging project config: ${PROJECT}`);
  filesToMerge.push(PROJECT);
}

// Hash-based cache: skip merge when inputs haven't changed
const CACHE_DIR = join(homedir(), ".ai-config-os", "cache");
const CACHE_YAML = join(CACHE_DIR, "config-merged.yaml");
const CACHE_HASH = join(CACHE_DIR, "config-merged.hash");

const hashInput = filesToMerge.map((f) => `${f}:${readFileSync(f)}`).join("\n");
const currentHash = createHash("sha256").update(hashInput).digest("hex");

if (existsSync(CACHE_HASH) && existsSync(CACHE_YAML)) {
  const cachedHash = readFileSync(CACHE_HASH, "utf8").trim();
  if (cachedHash === currentHash) {
    log("Cache hit — returning cached merged config");
    process.stdout.write(readFileSync(CACHE_YAML, "utf8"));
    process.exit(0);
  }
}

// Load and parse each YAML file
function loadYaml(filePath) {
  let raw;
  try {
    raw = readFileSync(filePath, "utf8");
  } catch (err) {
    process.stderr.write(
      `[error] Could not read ${filePath}: ${err.message}\n`,
    );
    process.exit(1);
  }
  let data;
  try {
    data = parseYaml(raw);
  } catch (err) {
    process.stderr.write(
      `[error] YAML parse error in ${filePath}: ${err.message}\n`,
    );
    process.exit(1);
  }
  if ((data !== null && typeof data !== "object") || Array.isArray(data)) {
    process.stderr.write(
      `[error] ${filePath} must be a YAML mapping, not a scalar or list\n`,
    );
    process.exit(1);
  }
  return data ?? {};
}

// Merge layers: last-writer-wins for all keys; mcps uses field-level merge
function mergeConfigs(layers) {
  let result = {};
  for (const layer of layers) {
    const mergedMcps = { ...(result.mcps ?? {}), ...(layer.mcps ?? {}) };
    result = { ...result, ...layer, mcps: mergedMcps };
  }
  return result;
}

const layers = filesToMerge.map(loadYaml);
const merged = mergeConfigs(layers);
const output = stringifyYaml(merged);

// Write cache
try {
  mkdirSync(CACHE_DIR, { recursive: true });
  writeFileSync(CACHE_YAML, output, "utf8");
  writeFileSync(CACHE_HASH, currentHash, "utf8");
  log("Cache updated");
} catch {
  // Cache write failure is non-fatal
  log("Cache write failed (non-fatal)");
}

process.stdout.write(output);
