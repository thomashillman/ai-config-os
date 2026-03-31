#!/usr/bin/env node
/**
 * check-version-parity.mjs
 *
 * Asserts that VERSION, package.json, and plugins/core-skills/.claude-plugin/plugin.json
 * all contain the same valid semver version. Exits non-zero on any mismatch.
 *
 * Usage: node scripts/build/check-version-parity.mjs
 */
import { readFileSync } from "fs";
import { join, resolve, dirname } from "path";
import { fileURLToPath } from "url";
import {
  readReleaseVersion,
  validateReleaseVersion,
  assertVersionParity,
} from "./lib/versioning.mjs";

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(__dirname, "..", "..");

try {
  const version = validateReleaseVersion(readReleaseVersion(ROOT));
  console.log(`VERSION: ${version}`);

  const pkgJson = JSON.parse(readFileSync(join(ROOT, "package.json"), "utf8"));
  assertVersionParity(version, pkgJson.version, "package.json");
  console.log(`package.json: ${pkgJson.version} — ok`);

  const pluginJson = JSON.parse(
    readFileSync(
      join(ROOT, "plugins", "core-skills", ".claude-plugin", "plugin.json"),
      "utf8",
    ),
  );
  assertVersionParity(
    version,
    pluginJson.version,
    "plugins/core-skills/.claude-plugin/plugin.json",
  );
  console.log(`plugin.json: ${pluginJson.version} — ok`);

  console.log("\nVersion parity check passed.");
} catch (err) {
  console.error(`\nVersion parity check FAILED: ${err.message}`);
  process.exit(1);
}
