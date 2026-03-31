// Shared runtime helper: reads the canonical release version from VERSION file.
// Consumed by runtime/mcp/server.js so the MCP server's advertised version
// always matches the build system's authoritative source.
// This helper validates the version using the same rules as the build path.
import { readFileSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import {
  readReleaseVersion,
  validateReleaseVersion,
} from "../../scripts/build/lib/versioning.mjs";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..", "..");

/**
 * Get the release version from a specific root directory.
 * Validates using the same rules as the build path.
 * @param {string} root - repo root path
 * @returns {string} validated release version
 * @throws {Error} if VERSION is malformed
 */
export function getReleaseVersionFromRoot(root) {
  return validateReleaseVersion(readReleaseVersion(root));
}

/**
 * Get the release version from the canonical repo root.
 * @returns {string} validated release version
 * @throws {Error} if VERSION is malformed
 */
export function getReleaseVersion() {
  return getReleaseVersionFromRoot(ROOT);
}
