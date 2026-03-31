/**
 * Input validation for capability discovery endpoints.
 *
 * All validation is pure (no I/O) and returns typed results.
 * Known platforms are validated against the registry at call time,
 * not hardcoded here, so the list stays in sync with compiled output.
 */

import type { CapabilityError, ValidationResult } from "../types/capabilities";

/** Capability IDs must follow the pattern: word.word[.word]* */
const CAPABILITY_ID_RE = /^[a-z][a-z0-9]*(\.[a-z][a-z0-9]*)+$/;

/** Maximum number of capability IDs accepted in one request */
const MAX_CAPS = 50;

/**
 * Validate and normalise a platform identifier.
 * Checks against the set of known platforms from the compiled registry.
 */
export function validatePlatform(
  raw: string,
  knownPlatforms: Set<string>,
): ValidationResult<string> {
  const trimmed = raw.trim().toLowerCase();

  if (!trimmed) {
    return {
      ok: false,
      status: 404,
      error: {
        code: "INVALID_PLATFORM",
        message: "Platform identifier is empty.",
        hint: `Known platforms: ${[...knownPlatforms].join(", ")}`,
      },
    };
  }

  // Block path traversal and injection attempts
  if (
    trimmed.includes("/") ||
    trimmed.includes("..") ||
    trimmed.includes("\0")
  ) {
    return {
      ok: false,
      status: 404,
      error: {
        code: "INVALID_PLATFORM",
        message: `Unknown platform: '${trimmed}'.`,
        hint: `Known platforms: ${[...knownPlatforms].join(", ")}`,
      },
    };
  }

  if (!knownPlatforms.has(trimmed)) {
    return {
      ok: false,
      status: 404,
      error: {
        code: "INVALID_PLATFORM",
        message: `Unknown platform: '${trimmed}'.`,
        hint: `Known platforms: ${[...knownPlatforms].join(", ")}`,
      },
    };
  }

  return { ok: true, value: trimmed };
}

/**
 * Parse and validate the ?caps= query parameter.
 * Accepts comma-separated capability IDs: fs.read,shell.exec,network.http
 */
export function validateCapabilitiesParam(
  raw: string | null,
): ValidationResult<string[]> {
  if (raw === null) {
    return {
      ok: false,
      status: 400,
      error: {
        code: "MISSING_CAPS_PARAM",
        message: "Missing required query parameter: 'caps'.",
        hint: "Provide a comma-separated list of capability IDs, e.g. ?caps=network.http,fs.read",
      },
    };
  }

  const parts = raw
    .split(",")
    .map((c) => c.trim().toLowerCase())
    .filter(Boolean);

  if (parts.length === 0) {
    return {
      ok: false,
      status: 400,
      error: {
        code: "EMPTY_CAPS_PARAM",
        message:
          "Query parameter 'caps' must contain at least one capability ID.",
        hint: "Provide a comma-separated list of capability IDs, e.g. ?caps=network.http,fs.read",
      },
    };
  }

  if (parts.length > MAX_CAPS) {
    return {
      ok: false,
      status: 400,
      error: {
        code: "INVALID_CAPABILITY_FORMAT",
        message: `Too many capabilities: ${parts.length} provided, maximum is ${MAX_CAPS}.`,
      },
    };
  }

  const invalid = parts.filter((c) => !CAPABILITY_ID_RE.test(c));
  if (invalid.length > 0) {
    return {
      ok: false,
      status: 400,
      error: {
        code: "INVALID_CAPABILITY_FORMAT",
        message: `Invalid capability ID format: ${invalid.map((c) => `'${c}'`).join(", ")}.`,
        hint: "Capability IDs must match pattern: word.word (e.g. fs.read, shell.exec, network.http)",
      },
    };
  }

  // Deduplicate while preserving order
  const seen = new Set<string>();
  const deduped = parts.filter((c) => {
    if (seen.has(c)) return false;
    seen.add(c);
    return true;
  });

  return { ok: true, value: deduped };
}

/** Build a stable cache key from a sorted capability list */
export function capabilitiesCacheKey(caps: string[]): string {
  return [...caps].sort().join(",");
}

/** Build error detail for a CapabilityError */
export function makeError(
  error: CapabilityError,
  status: number,
): { body: { error: CapabilityError }; status: number } {
  return { body: { error }, status };
}
