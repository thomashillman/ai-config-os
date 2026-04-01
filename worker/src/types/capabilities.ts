/**
 * Capability discovery types — shared across handlers, validation, and tests.
 *
 * These types mirror the compiled registry shape. All capability data is
 * pre-computed at build time by the compiler and embedded in the Worker.
 * No runtime computation occurs against YAML source files.
 */

// ─── Capability status ────────────────────────────────────────────────────────

export type CapabilityStatus = "supported" | "unsupported" | "unknown";
export type CompatibilityStatus =
  | "supported"
  | "excluded"
  | "unverified"
  | "degraded";
export type FallbackMode = "none" | "manual" | "prompt-only";

// ─── Per-capability entry (from platform YAML definitions) ───────────────────

export interface CapabilityEntry {
  status: CapabilityStatus;
  confidence: "high" | "medium" | "low";
  source: string;
  verified_at?: string;
}

// ─── Platform profile (derived from platform YAML, embedded in registry) ──────

export interface PlatformProfile {
  id: string;
  name: string;
  surface: string;
  default_package: string;
  capabilities: Record<string, CapabilityEntry>;
  notes?: string;
}

// ─── Skill compatibility entry (pre-computed by compiler) ────────────────────

export interface SkillCompatibility {
  status: CompatibilityStatus;
  mode: string;
  package: string;
  notes?: string;
}

// ─── Skill entry from registry ───────────────────────────────────────────────

export interface RegistrySkill {
  id: string;
  version: string;
  description: string;
  type: string;
  status: string;
  invocation: string | null;
  tags: string[];
  capabilities: {
    required: string[];
    optional: string[];
    fallback_mode: FallbackMode | null;
  };
  compatibility: Record<string, SkillCompatibility>;
  platforms: string[];
  dependencies: {
    runtime: string[];
    optional: string[];
    skills: string[];
    models: string[];
  };
  /** Normalised resource policy when the skill declares `resource_budget` in frontmatter. */
  resource_budget?: Record<string, unknown>;
}

// ─── Error codes ─────────────────────────────────────────────────────────────

export type CapabilityErrorCode =
  | "INVALID_PLATFORM"
  | "INVALID_CAPABILITY_FORMAT"
  | "MISSING_CAPS_PARAM"
  | "EMPTY_CAPS_PARAM"
  | "PLATFORM_DATA_UNAVAILABLE"
  | "INTERNAL_ERROR";

export interface CapabilityError {
  code: CapabilityErrorCode;
  message: string;
  hint?: string;
}

// ─── API response shapes ─────────────────────────────────────────────────────

export interface CapabilityPlatformResponse {
  platform: string;
  name: string;
  surface: string;
  manifest_version: string;
  capabilities: {
    supported: string[];
    unsupported: string[];
    unknown: string[];
  };
  capability_detail: Record<string, CapabilityEntry>;
  notes?: string;
}

export interface CompatibleSkillEntry {
  id: string;
  version: string;
  description: string;
  type: string;
  status: string;
  tags: string[];
  capabilities: {
    required: string[];
    optional: string[];
    fallback_mode: FallbackMode | null;
  };
  compatibility: Record<string, SkillCompatibility>;
}

export interface CompatibleSkillsResponse {
  manifest_version: string;
  requested_capabilities: string[];
  compatible_count: number;
  total_skills: number;
  skills: CompatibleSkillEntry[];
}

export interface ErrorResponse {
  error: CapabilityError;
}

// ─── Validation results ───────────────────────────────────────────────────────

export type ValidationResult<T> =
  | { ok: true; value: T }
  | { ok: false; error: CapabilityError; status: number };
