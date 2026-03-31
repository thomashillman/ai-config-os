#!/usr/bin/env node
/**
 * Materialiser CLI
 *
 * Downloads (or loads from local dist/) and materializes skill packages.
 * This is the user-facing command for extracting emitted packages.
 *
 * Usage:
 *   node scripts/build/materialise.mjs <package-path> [--dest <destination>] [--dry-run]
 *   node scripts/build/materialise.mjs --help
 */

import { resolve } from "path";
import { existsSync } from "fs";
import {
  materializePackage,
  getPackageStats,
} from "./lib/materialise-client.mjs";

// ─── Argument parsing ───

const args = process.argv.slice(2);

if (args.includes("--help") || args.includes("-h")) {
  console.log(`
Materialiser CLI — Extract and validate skill packages

Usage:
  node scripts/build/materialise.mjs <package-path> [--dest <destination>] [--dry-run] [--verbose]

Arguments:
  <package-path>      Path to emitted package root (dist/clients/claude-code/)

Options:
  --dest <path>       Destination directory for materialized skills (default: ~/.ai-config-os/cache)
  --dry-run          Validate without extracting files
  --verbose          Show detailed materialization progress
  --help              Show this help text

Examples:
  node scripts/build/materialise.mjs ./dist/clients/claude-code/
  node scripts/build/materialise.mjs ./dist/clients/claude-code/ --dest ~/my-skills --verbose
  node scripts/build/materialise.mjs ./dist/clients/claude-code/ --dry-run
`);
  process.exit(0);
}

const packagePath = args[0];

if (!packagePath) {
  console.error("Error: <package-path> is required");
  console.error("Use --help for usage information");
  process.exit(1);
}

// Parse options
let destPath = null;
let dryRun = false;
let verbose = false;

for (let i = 1; i < args.length; i++) {
  if (args[i] === "--dest" && args[i + 1]) {
    destPath = args[i + 1];
    i++;
  } else if (args[i] === "--dry-run") {
    dryRun = true;
  } else if (args[i] === "--verbose") {
    verbose = true;
  }
}

// Default destination: ~/.ai-config-os/cache
if (!destPath) {
  const homeDir = process.env.HOME || process.env.USERPROFILE || ".";
  destPath = resolve(homeDir, ".ai-config-os", "cache");
}

// ─── Execute materialization ───

const resolvedPackagePath = resolve(packagePath);

if (!existsSync(resolvedPackagePath)) {
  console.error(`Error: Package path does not exist: ${packagePath}`);
  process.exit(1);
}

try {
  if (verbose) {
    console.log(`\nMaterialising package: ${resolvedPackagePath}`);
    console.log(`Destination: ${destPath}`);
  }

  // Get package stats first (validation + info)
  const stats = getPackageStats(resolvedPackagePath);

  if (verbose) {
    console.log(`Package version: ${stats.packageVersion}`);
    console.log(`Skills to materialize: ${stats.skillCount}`);
    console.log(`Total size: ${(stats.totalSize / 1024).toFixed(1)} KB`);
  }

  // Materialize
  const result = materializePackage(resolvedPackagePath, destPath, {
    dryRun,
    verbose,
  });

  if (verbose) {
    console.log(`\nMaterialised ${result.skillsExtracted.length} skills`);
    result.skillsExtracted.forEach((skill) => {
      console.log(`  ✓ ${skill.name} (${skill.version})`);
    });
  }

  console.log(
    `${dryRun ? "[dry-run] " : ""}Materialisation complete: ${destPath}`,
  );
  process.exit(0);
} catch (err) {
  console.error(`Error: ${err.message}`);
  if (err.context && Object.keys(err.context).length > 0) {
    console.error("Context:", JSON.stringify(err.context, null, 2));
  }
  process.exit(1);
}
