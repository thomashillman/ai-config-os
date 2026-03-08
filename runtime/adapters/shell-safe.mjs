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

import { resolve, join, isAbsolute } from 'node:path';
import { existsSync, lstatSync } from 'node:fs';
import { platform } from 'node:os';

/**
 * Escape a string for safe use in shell commands.
 * Wraps in single quotes and escapes embedded single quotes.
 *
 * @param {string} str - String to escape
 * @returns {string} Escaped string safe for shell
 */
export function shellEscape(str) {
  if (typeof str !== 'string') {
    return '';
  }

  // Remove null bytes (cannot be escaped in shell)
  str = str.replace(/\x00/g, '');

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
    return '';
  }

  return args.map((arg) => shellEscape(String(arg))).join(' ');
}

/**
 * Sanitize a file path to prevent directory traversal attacks.
 * Removes leading ../ sequences and null bytes.
 *
 * @param {string} path - Path to sanitize
 * @returns {string} Sanitized path
 */
export function sanitizePath(path) {
  if (typeof path !== 'string') {
    return '';
  }

  // Remove null bytes
  path = path.replace(/\x00/g, '');

  // Remove leading traversal sequences
  while (path.startsWith('../')) {
    path = path.slice(3);
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
  if (typeof untrustedPath !== 'string' || typeof boundary !== 'string') {
    return false;
  }

  // Reject absolute paths that escape boundary
  if (isAbsolute(untrustedPath)) {
    return untrustedPath.startsWith(boundary);
  }

  // Reject relative paths with traversal
  if (untrustedPath.includes('/../') || untrustedPath.startsWith('../')) {
    return false;
  }

  return true;
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
    throw new Error('Boundary directory must be absolute');
  }

  if (!validatePathBoundary(relPath, boundary)) {
    return null;
  }

  const resolved = resolve(join(boundary, relPath));

  // Verify resolved path actually starts with boundary
  // (resolving may have escaped via symlinks)
  if (!resolved.startsWith(boundary)) {
    return null;
  }

  return resolved;
}

/**
 * Check if a path is safe to operate on (not a symlink escape attempt).
 * Walks up path components checking for symlinks that point outside boundary.
 *
 * @param {string} fullPath - Full absolute path to check
 * @param {string} boundary - Boundary directory
 * @returns {boolean} True if path is safe (no escaping symlinks)
 */
export function isPathSafe(fullPath, boundary) {
  if (!isAbsolute(fullPath) || !isAbsolute(boundary)) {
    return false;
  }

  if (!fullPath.startsWith(boundary)) {
    return false;
  }

  // Walk up path components checking for symlinks
  const parts = fullPath.split(/[\\/]/);
  let current = platform() === 'win32' ? parts[0] + '\\' : '/';

  for (let i = 1; i < parts.length; i++) {
    current = join(current, parts[i]);

    // Check if this component is a symlink
    if (existsSync(current)) {
      try {
        const stat = lstatSync(current);
        if (stat.isSymbolicLink()) {
          // Verify the symlink target stays within boundary
          // This is a simplified check; real code might use readlinkSync
          return false; // Conservative: reject symlinks in path
        }
      } catch {
        // If we can't stat it, reject it
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
  if (typeof cmd !== 'string' || cmd.length === 0) {
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
  if (typeof cmdLine !== 'string') {
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
  if (typeof path !== 'string') {
    return '';
  }

  return path.replace(/\\/g, '/');
}

/**
 * Normalize line endings to LF across platforms.
 * Converts CRLF (Windows) to LF (Unix).
 *
 * @param {string} text - Text to normalize
 * @returns {string} Text with normalized line endings
 */
export function normalizeLineEndings(text) {
  if (typeof text !== 'string') {
    return '';
  }

  return text.replace(/\r\n/g, '\n');
}

/**
 * Escape shell metacharacters for safe use in double quotes.
 * Used when single quotes are not suitable.
 *
 * @param {string} str - String to escape
 * @returns {string} Escaped for use in double quotes
 */
export function escapeForDoubleQuotes(str) {
  if (typeof str !== 'string') {
    return '';
  }

  // Remove null bytes
  str = str.replace(/\x00/g, '');

  // Escape special characters in double-quoted strings
  return str.replace(/[\\"$`!]/g, '\\$&');
}

/**
 * Check if a string contains shell metacharacters that need escaping.
 *
 * @param {string} str - String to check
 * @returns {boolean} True if string needs escaping
 */
export function needsEscaping(str) {
  if (typeof str !== 'string') {
    return false;
  }

  // Check for shell metacharacters
  return /[!@#$%^&*()=+[\]{};:'"<>,.?/\\|`~\s]/.test(str);
}
