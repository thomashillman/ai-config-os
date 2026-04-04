/**
 * Diagnostic Payload Capture
 *
 * Captures raw hook event payloads with redaction for debugging.
 * One-shot behavior: writes only once per machine unless sentinel is removed.
 * Never throws; all failures are swallowed and never affect hook execution.
 */

import fs from "node:fs";
import path from "node:path";
import os from "node:os";

/**
 * Redacts sensitive values from an object recursively.
 * Redacts by key name (case-insensitive) and by value pattern matching.
 * @param {any} obj - Object to redact
 * @param {Set<string>} seen - Track visited objects to prevent infinite loops
 * @returns {any} - Redacted object (same structure, sensitive values replaced)
 */
function redactSensitive(obj, seen = new Set()) {
  if (obj === null || obj === undefined) return obj;

  // Prevent circular reference loops
  if (typeof obj === "object") {
    if (seen.has(obj)) return "[CIRCULAR]";
    seen.add(obj);
  }

  // Sensitive key names (case-insensitive, normalized by removing underscores)
  const sensitiveKeys = new Set([
    "authorization",
    "token",
    "auth",
    "secret",
    "password",
    "passwd",
    "apikey",
    "api_key",
    "access_token",
    "refresh_token",
    "cookie",
    "set-cookie",
    "credential",
    "credentials",
    "bearer",
  ]);

  // Pattern matching for key names (case-insensitive)
  const sensitiveKeyPatterns = [
    /secret/i, // Catches secret, secret_key, etc.
    /token/i,
    /auth/i,
    /password/i,
    /credential/i,
    /api.?key/i,
    /access.?token/i,
    /refresh.?token/i,
  ];

  // Patterns that look like bearer tokens or opaque secrets (rough heuristics)
  const secretPatterns = [
    /^bearer\s+\S+$/i, // Bearer tokens
    /^[a-z0-9]{40,}$/i, // Long hex strings (40+ chars)
    /^eyJ[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]*$/, // JWT-like
  ];

  if (typeof obj === "string") {
    // Check if the string value looks like a secret
    if (secretPatterns.some((pattern) => pattern.test(obj))) {
      return "[REDACTED]";
    }
    return obj;
  }

  if (Array.isArray(obj)) {
    return obj.map((item) => redactSensitive(item, seen));
  }

  if (typeof obj === "object") {
    const redacted = {};
    for (const [key, value] of Object.entries(obj)) {
      const lowerKey = key.toLowerCase().replace(/_/g, "");
      const isSensitive =
        sensitiveKeys.has(lowerKey) ||
        sensitiveKeyPatterns.some((pattern) => pattern.test(key));
      if (isSensitive) {
        redacted[key] = "[REDACTED]";
      } else {
        redacted[key] = redactSensitive(value, seen);
      }
    }
    return redacted;
  }

  return obj;
}

/**
 * Gets the top-level keys from a JSON object, for structure inspection.
 * @param {object} obj - Parsed object
 * @returns {string[]} - Array of top-level key names
 */
function getTopLevelKeys(obj) {
  if (typeof obj !== "object" || obj === null) return [];
  return Object.keys(obj);
}

/**
 * Determines the temp dir and paths for capture files.
 * @returns {object} - { tempDir, sentinelPath, payloadPath }
 */
function getPaths() {
  const tempDir = os.tmpdir();
  const sentinelPath = path.join(tempDir, ".acos-hook-capture.sentinel");
  const payloadPath = path.join(tempDir, ".acos-hook-payload.jsonl");
  return { tempDir, sentinelPath, payloadPath };
}

/**
 * Checks if a one-shot capture has already been performed.
 * @returns {boolean} - true if sentinel exists
 */
function hasCaptured() {
  try {
    const { sentinelPath } = getPaths();
    return fs.existsSync(sentinelPath);
  } catch {
    // Swallow errors; treat as "not captured"
    return false;
  }
}

/**
 * Writes the sentinel file to mark that capture has been completed.
 * @returns {boolean} - true if successful
 */
function writeSentinel() {
  try {
    const { sentinelPath } = getPaths();
    fs.writeFileSync(sentinelPath, `${Date.now()}\n`, "utf8");
    return true;
  } catch {
    // Swallow errors
    return false;
  }
}

/**
 * Captures and writes a redacted payload to disk.
 * Best-effort, never throws, never affects hook execution.
 *
 * @param {string} rawInput - Raw stdin payload
 * @returns {string|null} - Path to payload file if written, null otherwise
 */
export function capturePayload(rawInput) {
  try {
    // Check if we've already captured
    if (hasCaptured()) {
      return null;
    }

    // Parse the JSON to inspect structure
    let parseable = false;
    let parsed = null;
    let topLevelKeys = null;

    try {
      parsed = JSON.parse(rawInput);
      parseable = true;
      topLevelKeys = getTopLevelKeys(parsed);
    } catch {
      // Not valid JSON; we'll still capture as raw string
    }

    // Redact the payload
    let redacted;
    if (parseable && parsed) {
      // Preserve JSON structure for inspection
      redacted = redactSensitive(parsed);
    } else {
      // For non-JSON, just capture the raw string (redaction is limited)
      redacted = rawInput;
    }

    // Build the capture entry
    const entry = {
      captured_at: new Date().toISOString(),
      pid: process.pid,
      cwd: process.cwd(),
      claude_project_dir: process.env.CLAUDE_PROJECT_DIR || null,
      raw_stdin_redacted: parseable
        ? redacted
        : redacted.substring(0, 500) + "...", // Truncate non-JSON for safety
      parseable_json: parseable,
      parsed_top_level_keys: topLevelKeys,
    };

    // Write to payload file
    const { payloadPath } = getPaths();
    const entryJson = JSON.stringify(entry);
    fs.appendFileSync(payloadPath, entryJson + "\n", "utf8");

    // Write sentinel
    writeSentinel();

    return payloadPath;
  } catch {
    // Swallow all errors; never throw from capture logic
    return null;
  }
}

/**
 * Notifies the operator where the payload was written (once).
 * Only calls this after a successful capture.
 * Must never print the payload itself to stderr/stdout.
 *
 * @param {string|null} payloadPath - Path returned from capturePayload
 */
export function notifyCaptureLocation(payloadPath) {
  if (!payloadPath) return;

  try {
    // Write a short message to stderr so it's visible to the operator
    // Use a format that's easy to spot and copy
    const message = `[ai-config-os] Hook diagnostic payload captured: ${payloadPath}\n`;
    fs.writeSync(process.stderr.fd, message);
  } catch {
    // Swallow errors; don't break hook execution
  }
}
