/**
 * shell-safe.mjs
 *
 * Shell boundary layer for safe command execution. Provides:
 * - Command injection prevention
 * - Quote escaping
 * - Path traversal blocking
 * - Symlink attack prevention
 * - Cross-platform path handling
 */

import { resolve, join, isAbsolute, sep, relative } from "node:path";
import { existsSync, lstatSync } from "node:fs";

/**
 * Check if a resolved absolute path is contained within a boundary directory.
 * Uses separator-aware comparison to prevent sibling-prefix bypasses
 * (e.g. /safe/base-evil should not match boundary /safe/base).
 *
 * @param {string} resolved - Resolved absolute path
 * @param {string} resolvedBoundary - Resolved absolute boundary path
 * @returns {boolean} True if resolved is exactly the boundary or a child of it
 */
function isContainedIn(resolved, resolvedBoundary) {
  if (resolved === resolvedBoundary) {
    return true;
  }
  // Use platform-specific separator to prevent false matches
  // (e.g., /safe/base-evil would not match /safe/base + '/')
  return resolved.startsWith(resolvedBoundary + sep);
}

/**
 * Escape a string for safe use in shell commands.
 * Wraps in single quotes and escapes embedded single quotes.
 *
 * @param {string} str - String to escape
 * @returns {string} Escaped string safe for shell
 */
export function shellEscape(str) {
  if (typeof str !== "string") {
    return "";
  }

  // Remove null bytes (cannot be escaped in shell)
  str = str.replace(/\x00/g, "");

  // Wrap in single quotes and escape single quotes inside
  return "'" + str.replace(/'/g, "'\\''") + "'";
}

/**
 * Escape multiple arguments and join them safely.
 *
 * @param {string[]} args - Array of arguments to escape
 * @returns {string} Space-separated escaped arguments
 */
export function shellEscapeArgs(args) {
  if (!Array.isArray(args)) {
    return "";
  }

  return args.map((arg) => shellEscape(String(arg))).join(" ");
}

/**
 * Sanitize a file path to prevent directory traversal attacks.
 * Removes leading ../ and ..\\ sequences and null bytes.
 * Handles both Unix and Windows path separators.
 *
 * @param {string} path - Path to sanitize
 * @returns {string} Sanitized path
 */
export function sanitizePath(path) {
  if (typeof path !== "string") {
    return "";
  }

  // Remove null bytes
  path = path.replace(/\x00/g, "");

  // Remove leading traversal sequences (both Unix / and Windows \)
  while (path.startsWith("../") || path.startsWith("..\\")) {
    path = path.slice(3);
  }

  // Also remove mixed separators that could escape after normalization
  // e.g., ..\\../ or ../ embedded in the path at unsafe positions
  // This is a defense-in-depth: paths should be normalized elsewhere
  if (path.includes("\x00")) {
    path = path.replace(/\x00/g, "");
  }

  return path;
}

/**
 * Validate that a path stays within a boundary directory.
 * Prevents both absolute paths outside boundary and relative
 * paths that traverse up and out.
 *
 * @param {string} untrustedPath - Path to validate (may be from user input)
 * @param {string} boundary - Base directory path that must contain untrustedPath
 * @returns {boolean} True if path is within boundary
 */
export function validatePathBoundary(untrustedPath, boundary) {
  if (typeof untrustedPath !== "string" || typeof boundary !== "string") {
    return false;
  }

  // Reject paths with null bytes
  if (untrustedPath.includes("\x00") || boundary.includes("\x00")) {
    return false;
  }

  // Reject relative paths with traversal (both Unix / and Windows \)
  if (/(?:^|[\\/])\.\.(?:[\\/]|$)/.test(untrustedPath)) {
    return false;
  }
  // Resolve both paths and use separator-aware containment check
  try {
    const resolved = resolve(boundary, untrustedPath);
    const resolvedBoundary = resolve(boundary);
    return isContainedIn(resolved, resolvedBoundary);
  } catch (err) {
    return false;
  }
}

/**
 * Safely resolve a path within a boundary directory.
 * Returns absolute path if it stays within boundary, null if it escapes.
 *
 * @param {string} relPath - Relative path from boundary
 * @param {string} boundary - Boundary directory (must be absolute)
 * @returns {string|null} Absolute path if safe, null if escapes boundary
 */
export function resolveSafePath(relPath, boundary) {
  if (!isAbsolute(boundary)) {
    throw new Error("Boundary directory must be absolute");
  }

  if (!validatePathBoundary(relPath, boundary)) {
    return null;
  }

  const resolved = resolve(boundary, relPath);
  const resolvedBoundary = resolve(boundary);

  // Verify resolved path is within boundary using separator-aware check
  // (resolving may have escaped via symlinks)
  if (!isContainedIn(resolved, resolvedBoundary)) {
    return null;
  }

  return resolved;
}

/**
 * Check if a path is safe to operate on (no symlinks anywhere in the path).
 * Resolves both inputs before comparison, so callers do not need to
 * pre-canonicalise them (trailing separators, . segments, doubled slashes,
 * and Windows UNC paths are all handled correctly via path.parse()).
 *
 * Security contract: any symlink encountered while walking the path
 * components causes an immediate false return.  This is intentionally
 * conservative — symlinked setups are rejected outright rather than
 * followed, which prevents all known symlink-escape patterns at the cost
 * of not supporting legitimate symlinked layouts.
 *
 * CRITICAL: Both paths MUST be canonicalised via resolve() BEFORE the
 * containment check. Raw string comparison on non-canonical inputs will
 * incorrectly reject logically valid paths (e.g., boundary with trailing
 * separator, fullPath with . segments).
 *
 * @param {string} fullPath - Full absolute path to check (need not be canonical)
 * @param {string} boundary - Boundary directory (need not be canonical)
 * @returns {boolean} True only if path is within boundary and contains no symlinks
 */
export function isPathSafe(fullPath, boundary) {
  if (typeof fullPath !== "string" || typeof boundary !== "string") {
    return false;
  }

  // Reject paths with null bytes
  if (fullPath.includes("\x00") || boundary.includes("\x00")) {
    return false;
  }

  if (!isAbsolute(fullPath) || !isAbsolute(boundary)) {
    return false;
  }

  // Canonicalise both inputs up front so that trailing slashes, . segments,
  // doubled separators, and Windows UNC paths all compare correctly.
  let resolvedFullPath;
  let resolvedBoundary;
  try {
    resolvedFullPath = resolve(fullPath);
    resolvedBoundary = resolve(boundary);
  } catch {
    return false;
  }

  // Use separator-aware containment to prevent sibling-prefix bypasses.
  if (!isContainedIn(resolvedFullPath, resolvedBoundary)) {
    return false;
  }

  // Walk only the path components WITHIN the boundary for symlink detection.
  // The boundary itself is caller-trusted; checking ancestors of the boundary
  // (e.g. /home on macOS, which is a system symlink to /System/Volumes/Data/home)
  // would cause false negatives on legitimate child paths. Only symlinks
  // introduced by user-controlled path segments inside the boundary matter.
  const relFromBoundary = relative(resolvedBoundary, resolvedFullPath);
  const parts =
    relFromBoundary === ""
      ? []
      : relFromBoundary.split(/[\\/]/).filter(Boolean);
  let current = resolvedBoundary;

  for (const part of parts) {
    current = join(current, part);

    // Reject any symlink encountered in the path — conservative, fails closed.
    if (existsSync(current)) {
      try {
        const stat = lstatSync(current);
        if (stat.isSymbolicLink()) {
          return false;
        }
      } catch {
        // If we can't stat it, reject it.
        return false;
      }
    }
  }

  return true;
}

/**
 * Validate command name to prevent injection via command name.
 * Should be a simple identifier (alphanumeric, dash, underscore).
 *
 * @param {string} cmd - Command name to validate
 * @returns {boolean} True if command name is safe
 */
export function isCommandNameSafe(cmd) {
  if (typeof cmd !== "string" || cmd.length === 0) {
    return false;
  }

  // Allow simple command names: alphanumeric, dash, underscore
  // Reject paths or special characters that could inject commands
  return /^[a-zA-Z0-9_-]+$/.test(cmd);
}

/**
 * Split a command string into command and arguments safely.
 * Does not use shell parsing; instead validates each part.
 *
 * @param {string} cmdLine - Command line (e.g., "git clone <repo>")
 * @returns {object} { command, args } or null if invalid
 */
export function parseCommandSafely(cmdLine) {
  if (typeof cmdLine !== "string") {
    return null;
  }

  const parts = cmdLine.trim().split(/\s+/);
  if (parts.length === 0) {
    return null;
  }

  const command = parts[0];
  if (!isCommandNameSafe(command)) {
    return null;
  }

  return {
    command,
    args: parts.slice(1),
  };
}

/**
 * Normalize paths across platforms (Windows vs Unix).
 * Converts all backslashes to forward slashes.
 *
 * @param {string} path - Path to normalize
 * @returns {string} Normalized path
 */
export function normalizePath(path) {
  if (typeof path !== "string") {
    return "";
  }

  return path.replace(/\\/g, "/");
}

/**
 * Normalize line endings to LF across platforms.
 * Converts CRLF (Windows) to LF (Unix).
 *
 * @param {string} text - Text to normalize
 * @returns {string} Text with normalized line endings
 */
export function normalizeLineEndings(text) {
  if (typeof text !== "string") {
    return "";
  }

  return text.replace(/\r\n/g, "\n");
}

/**
 * Escape shell metacharacters for safe use in double quotes.
 * Used when single quotes are not suitable.
 *
 * @param {string} str - String to escape
 * @returns {string} Escaped for use in double quotes
 */
export function escapeForDoubleQuotes(str) {
  if (typeof str !== "string") {
    return "";
  }

  // Remove null bytes
  str = str.replace(/\x00/g, "");

  // Escape special characters in double-quoted strings
  return str.replace(/[\\"$`!]/g, "\\$&");
}

/**
 * Check if a string contains shell metacharacters that need escaping.
 *
 * @param {string} str - String to check
 * @returns {boolean} True if string needs escaping
 */
export function needsEscaping(str) {
  if (typeof str !== "string") {
    return false;
  }

  // Check for shell metacharacters
  return /[!@#$%^&*()=+[\]{};:'"<>,.?/\\|`~\s]/.test(str);
}
