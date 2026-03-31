#!/usr/bin/env node
/**
 * sync-release-version.mjs
 *
 * Mirrors the canonical VERSION file into:
 *   - package.json
 *   - plugins/core-skills/.claude-plugin/plugin.json
 *
 * Does NOT touch dist/. Building and syncing source metadata are separate operations.
 *
 * Usage: node scripts/build/sync-release-version.mjs
 */
import { readFileSync, writeFileSync } from "fs";
import { join, resolve, dirname } from "path";
import { fileURLToPath } from "url";
import {
  readReleaseVersion,
  validateReleaseVersion,
} from "./lib/versioning.mjs";

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(__dirname, "..", "..");

const version = validateReleaseVersion(readReleaseVersion(ROOT));

const targets = [
  join(ROOT, "package.json"),
  join(ROOT, "plugins", "core-skills", ".claude-plugin", "plugin.json"),
];

let changed = 0;

for (const filePath of targets) {
  const raw = readFileSync(filePath, "utf8");
  const json = JSON.parse(raw);
  if (json.version === version) {
    console.log(`  [ok]   ${filePath} already at ${version}`);
    continue;
  }
  const oldVersion = json.version;
  json.version = version;
  writeFileSync(filePath, JSON.stringify(json, null, 2) + "\n");
  console.log(`  [sync] ${filePath}: ${oldVersion} → ${version}`);
  changed++;
}

if (changed === 0) {
  console.log(`\nAll files already at ${version}. Nothing to do.`);
} else {
  console.log(`\nSynced ${changed} file(s) to ${version}.`);
}
