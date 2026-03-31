/**
 * versioning.mjs
 * Read-only versioning utility. Reads and validates the canonical VERSION file,
 * computes optional build provenance, and checks parity across mirrored files.
 */
import { readFileSync } from "fs";
import { join } from "path";
import { execFileSync } from "child_process";

const SEMVER_RE = /^\d+\.\d+\.\d+$/;
const FEATURE_FLAG_KEYS = [
  "outcome_resolution_enabled",
  "effective_contract_required",
  "remote_executor_enabled",
];

/**
 * Read and trim the VERSION file from the repo root.
 * @param {string} root - repo root path
 * @returns {string} trimmed version string
 */
export function readReleaseVersion(root) {
  const versionPath = join(root, "VERSION");
  return readFileSync(versionPath, "utf8").trim();
}

/**
 * Validate that a string is a valid semver (major.minor.patch, no pre-release).
 * @param {string} version
 * @returns {string} the version if valid
 * @throws {Error} if not valid semver
 */
export function validateReleaseVersion(version) {
  if (!SEMVER_RE.test(version)) {
    throw new Error(
      `Invalid release version "${version}": must be semver (e.g. 1.2.3)`,
    );
  }
  return version;
}

/**
 * Get build provenance metadata. Only populated in release mode.
 * @param {object} opts
 * @param {boolean} opts.releaseMode - whether to include provenance
 * @param {object} [opts.env] - environment variables (defaults to process.env)
 * @param {string} [opts.cwd] - working directory for git commands
 * @returns {{ builtAt?: string, buildId?: string, sourceCommit?: string } | null}
 */
export function getBuildProvenance({ releaseMode, env, cwd }) {
  if (!releaseMode) return null;

  const effectiveEnv = env || process.env;

  const builtAt = new Date().toISOString();
  const buildId = effectiveEnv.GITHUB_RUN_ID || effectiveEnv.BUILD_ID || null;

  let sourceCommit = effectiveEnv.GITHUB_SHA || null;
  if (!sourceCommit && cwd) {
    try {
      sourceCommit = execFileSync("git", ["rev-parse", "HEAD"], {
        cwd,
        encoding: "utf8",
        timeout: 5000,
      }).trim();
    } catch {
      // git not available or not a git repo — leave null
    }
  }

  return { builtAt, buildId, sourceCommit };
}

/**
 * Assert that an actual version matches the expected release version.
 * @param {string} expectedVersion - the canonical version from VERSION
 * @param {string} actualVersion - the version found in a mirrored file
 * @param {string} fileLabel - human-readable label for error messages
 * @throws {Error} if versions don't match
 */
export function assertVersionParity(expectedVersion, actualVersion, fileLabel) {
  if (actualVersion !== expectedVersion) {
    throw new Error(
      `Version mismatch in ${fileLabel}: expected "${expectedVersion}" (from VERSION), got "${actualVersion}"`,
    );
  }
}

/**
 * Validate manifest-controlled runtime feature flags.
 * Any missing key defaults to false for safe rollout.
 *
 * @param {object} [flags] - raw manifest feature_flags object
 * @returns {{ outcome_resolution_enabled: boolean, effective_contract_required: boolean, remote_executor_enabled: boolean }}
 */
export function validateManifestFeatureFlags(flags = {}) {
  const normalized = {};

  for (const key of FEATURE_FLAG_KEYS) {
    const value = flags[key];
    if (value === undefined || value === null) {
      normalized[key] = false;
      continue;
    }
    if (typeof value !== "boolean") {
      throw new Error(
        `Invalid manifest feature flag "${key}": expected boolean, got ${typeof value}`,
      );
    }
    normalized[key] = value;
  }

  return normalized;
}
