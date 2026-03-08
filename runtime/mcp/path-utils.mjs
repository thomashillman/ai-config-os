/**
 * path-utils.mjs
 *
 * Tiny path-resolution helpers for the MCP server.
 * Kept in a standalone module so they can be unit-tested without
 * importing the full server (which has Express / MCP SDK side effects).
 */
import path from 'node:path';
import { validatePathBoundary } from '../adapters/shell-safe.mjs';

/**
 * Resolve a script path relative to repoRoot and validate it stays inside.
 *
 * @param {string} script   - Relative script path (e.g. "runtime/sync.sh")
 * @param {string} repoRoot - Absolute path to the repository root
 * @returns {string|null}   - Resolved absolute path when safe, null when it escapes
 */
export function resolveRepoScriptPath(script, repoRoot) {
  if (typeof script !== 'string' || script.includes('\x00')) {
    return null;
  }
  const resolvedScriptPath = path.resolve(repoRoot, script);
  if (!validatePathBoundary(resolvedScriptPath, repoRoot)) {
    return null;
  }
  return resolvedScriptPath;
}
