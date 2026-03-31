/**
 * Post-Merge Retrospective — schema and validation (V1)
 *
 * One RetrospectiveArtifact is produced per session after a PR merge.
 * Fields are intentionally narrow; secrets are never accepted.
 */

// ── Types ─────────────────────────────────────────────────────────────────────

export type FrictionSignalType =
  | "error"
  | "correction"
  | "loop"
  | "assumption_failure"
  | "missing_context"
  | "inefficiency"
  | "capability_gap";

export type ImpactLevel = "low" | "medium" | "high";
export type RecommendationPriority = "high" | "medium" | "low";
export type EstimatedReuse = "once" | "occasional" | "frequent";
export type RecommendationCategory =
  | "library-api-reference"
  | "product-verification"
  | "data-fetching"
  | "business-automation"
  | "scaffolding"
  | "code-quality"
  | "ci-cd"
  | "runbook";

export interface FrictionSignal {
  type: FrictionSignalType;
  turn_index: number;
  description: string;
  impact: ImpactLevel;
  repeatable: boolean;
}

export interface SkillRecommendation {
  name: string;
  category: RecommendationCategory;
  rationale: string;
  trigger_description: string;
  priority: RecommendationPriority;
  estimated_reuse: EstimatedReuse;
}

export interface SessionStats {
  turn_count: number;
  tool_calls: number;
  duration_hint: string;
}

export interface ArtifactSummary {
  total_signals: number;
  high_impact_signals: number;
  recommendation_count: number;
}

export interface RetrospectiveArtifact {
  schema_version: "1.0";
  generated_at: string;
  pr_ref: string;
  session_stats: SessionStats;
  friction_signals: FrictionSignal[];
  skill_recommendations: SkillRecommendation[];
  summary: ArtifactSummary;
}

export type ValidationResult =
  | { ok: true; value: RetrospectiveArtifact }
  | { ok: false; error: string };

// ── Deny-list: field names that must never appear in a retrospective ──────────

const FORBIDDEN_FIELD_NAMES = new Set([
  "authorization",
  "token",
  "cookie",
  "secret",
  "password",
  "passwd",
  "credential",
  "credentials",
  "api_key",
  "apikey",
  "private_key",
  "privatekey",
  "auth",
]);

const MAX_MESSAGE_LENGTH = 2048;
const MAX_FRICTION_SIGNALS = 50;
const MAX_RECOMMENDATIONS = 20;

// ── Helpers ───────────────────────────────────────────────────────────────────

function isObject(v: unknown): v is Record<string, unknown> {
  return typeof v === "object" && v !== null && !Array.isArray(v);
}

function isIsoDateTime(v: unknown): v is string {
  return typeof v === "string" && Number.isFinite(Date.parse(v));
}

function hasForbiddenField(obj: Record<string, unknown>): string | null {
  for (const key of Object.keys(obj)) {
    if (FORBIDDEN_FIELD_NAMES.has(key.toLowerCase())) {
      return key;
    }
  }
  return null;
}

// ── Sub-validators ────────────────────────────────────────────────────────────

const VALID_SIGNAL_TYPES: FrictionSignalType[] = [
  "error",
  "correction",
  "loop",
  "assumption_failure",
  "missing_context",
  "inefficiency",
  "capability_gap",
];
const VALID_IMPACT_LEVELS: ImpactLevel[] = ["low", "medium", "high"];

function validateFrictionSignal(
  s: unknown,
  index: number,
): { ok: true; value: FrictionSignal } | { ok: false; error: string } {
  if (!isObject(s))
    return { ok: false, error: `friction_signals[${index}] must be an object` };

  if (!VALID_SIGNAL_TYPES.includes(s.type as FrictionSignalType)) {
    return {
      ok: false,
      error: `friction_signals[${index}].type must be one of: ${VALID_SIGNAL_TYPES.join(", ")}`,
    };
  }
  if (
    typeof s.turn_index !== "number" ||
    !Number.isInteger(s.turn_index) ||
    s.turn_index < 0
  ) {
    return {
      ok: false,
      error: `friction_signals[${index}].turn_index must be a non-negative integer`,
    };
  }
  if (typeof s.description !== "string" || s.description.length === 0) {
    return {
      ok: false,
      error: `friction_signals[${index}].description must be a non-empty string`,
    };
  }
  if (s.description.length > MAX_MESSAGE_LENGTH) {
    return {
      ok: false,
      error: `friction_signals[${index}].description exceeds ${MAX_MESSAGE_LENGTH} characters`,
    };
  }
  if (!VALID_IMPACT_LEVELS.includes(s.impact as ImpactLevel)) {
    return {
      ok: false,
      error: `friction_signals[${index}].impact must be one of: ${VALID_IMPACT_LEVELS.join(", ")}`,
    };
  }
  if (typeof s.repeatable !== "boolean") {
    return {
      ok: false,
      error: `friction_signals[${index}].repeatable must be a boolean`,
    };
  }

  return {
    ok: true,
    value: {
      type: s.type as FrictionSignalType,
      turn_index: s.turn_index,
      description: s.description,
      impact: s.impact as ImpactLevel,
      repeatable: s.repeatable,
    },
  };
}

const VALID_CATEGORIES: RecommendationCategory[] = [
  "library-api-reference",
  "product-verification",
  "data-fetching",
  "business-automation",
  "scaffolding",
  "code-quality",
  "ci-cd",
  "runbook",
];
const VALID_PRIORITIES: RecommendationPriority[] = ["high", "medium", "low"];
const VALID_REUSE: EstimatedReuse[] = ["once", "occasional", "frequent"];
const KEBAB_CASE_RE = /^[a-z0-9-]+$/;

function validateSkillRecommendation(
  r: unknown,
  index: number,
): { ok: true; value: SkillRecommendation } | { ok: false; error: string } {
  if (!isObject(r))
    return {
      ok: false,
      error: `skill_recommendations[${index}] must be an object`,
    };

  if (typeof r.name !== "string" || r.name.length === 0) {
    return {
      ok: false,
      error: `skill_recommendations[${index}].name must be a non-empty string`,
    };
  }
  if (!KEBAB_CASE_RE.test(r.name)) {
    return {
      ok: false,
      error: `skill_recommendations[${index}].name must be kebab-case (lowercase letters, digits, hyphens only)`,
    };
  }
  if (!VALID_CATEGORIES.includes(r.category as RecommendationCategory)) {
    return {
      ok: false,
      error: `skill_recommendations[${index}].category must be one of: ${VALID_CATEGORIES.join(", ")}`,
    };
  }
  for (const field of ["rationale", "trigger_description"] as const) {
    if (typeof r[field] !== "string" || (r[field] as string).length === 0) {
      return {
        ok: false,
        error: `skill_recommendations[${index}].${field} must be a non-empty string`,
      };
    }
    if ((r[field] as string).length > MAX_MESSAGE_LENGTH) {
      return {
        ok: false,
        error: `skill_recommendations[${index}].${field} exceeds ${MAX_MESSAGE_LENGTH} characters`,
      };
    }
  }
  if (!VALID_PRIORITIES.includes(r.priority as RecommendationPriority)) {
    return {
      ok: false,
      error: `skill_recommendations[${index}].priority must be one of: ${VALID_PRIORITIES.join(", ")}`,
    };
  }
  if (!VALID_REUSE.includes(r.estimated_reuse as EstimatedReuse)) {
    return {
      ok: false,
      error: `skill_recommendations[${index}].estimated_reuse must be one of: ${VALID_REUSE.join(", ")}`,
    };
  }

  return {
    ok: true,
    value: {
      name: r.name,
      category: r.category as RecommendationCategory,
      rationale: r.rationale as string,
      trigger_description: r.trigger_description as string,
      priority: r.priority as RecommendationPriority,
      estimated_reuse: r.estimated_reuse as EstimatedReuse,
    },
  };
}

// ── Public API ─────────────────────────────────────────────────────────────────

/**
 * Validate an untrusted payload as a RetrospectiveArtifact.
 * Rejects missing required fields, invalid types, overlong messages,
 * forbidden field names, and cross-field consistency violations.
 */
export function validateRetrospectiveArtifact(
  payload: unknown,
): ValidationResult {
  if (!isObject(payload)) {
    return { ok: false, error: "Payload must be a JSON object" };
  }

  const forbidden = hasForbiddenField(payload);
  if (forbidden !== null) {
    return {
      ok: false,
      error: `Field '${forbidden}' is not permitted in a retrospective`,
    };
  }

  if (payload.schema_version !== "1.0") {
    return { ok: false, error: "Field 'schema_version' must be '1.0'" };
  }

  if (!isIsoDateTime(payload.generated_at)) {
    return {
      ok: false,
      error: "Field 'generated_at' must be a valid ISO 8601 timestamp",
    };
  }

  if (typeof payload.pr_ref !== "string" || payload.pr_ref.length === 0) {
    return { ok: false, error: "Field 'pr_ref' must be a non-empty string" };
  }
  if (payload.pr_ref.length > 256) {
    return { ok: false, error: "Field 'pr_ref' exceeds 256 characters" };
  }

  // session_stats
  if (!isObject(payload.session_stats)) {
    return { ok: false, error: "Field 'session_stats' must be an object" };
  }
  const stats = payload.session_stats;
  if (
    typeof stats.turn_count !== "number" ||
    !Number.isInteger(stats.turn_count) ||
    stats.turn_count < 0
  ) {
    return {
      ok: false,
      error: "session_stats.turn_count must be a non-negative integer",
    };
  }
  if (
    typeof stats.tool_calls !== "number" ||
    !Number.isInteger(stats.tool_calls) ||
    stats.tool_calls < 0
  ) {
    return {
      ok: false,
      error: "session_stats.tool_calls must be a non-negative integer",
    };
  }
  if (typeof stats.duration_hint !== "string") {
    return { ok: false, error: "session_stats.duration_hint must be a string" };
  }
  if (stats.duration_hint.length > 128) {
    return {
      ok: false,
      error: "session_stats.duration_hint exceeds 128 characters",
    };
  }

  // friction_signals
  if (!Array.isArray(payload.friction_signals)) {
    return { ok: false, error: "Field 'friction_signals' must be an array" };
  }
  if (payload.friction_signals.length > MAX_FRICTION_SIGNALS) {
    return {
      ok: false,
      error: `Field 'friction_signals' exceeds maximum of ${MAX_FRICTION_SIGNALS} entries`,
    };
  }
  const frictionSignals: FrictionSignal[] = [];
  for (let i = 0; i < payload.friction_signals.length; i++) {
    const result = validateFrictionSignal(payload.friction_signals[i], i);
    if (!result.ok) return result;
    frictionSignals.push(result.value);
  }

  // skill_recommendations
  if (!Array.isArray(payload.skill_recommendations)) {
    return {
      ok: false,
      error: "Field 'skill_recommendations' must be an array",
    };
  }
  if (payload.skill_recommendations.length > MAX_RECOMMENDATIONS) {
    return {
      ok: false,
      error: `Field 'skill_recommendations' exceeds maximum of ${MAX_RECOMMENDATIONS} entries`,
    };
  }
  const skillRecommendations: SkillRecommendation[] = [];
  for (let i = 0; i < payload.skill_recommendations.length; i++) {
    const result = validateSkillRecommendation(
      payload.skill_recommendations[i],
      i,
    );
    if (!result.ok) return result;
    skillRecommendations.push(result.value);
  }

  // summary
  if (!isObject(payload.summary)) {
    return { ok: false, error: "Field 'summary' must be an object" };
  }
  const sum = payload.summary;
  for (const field of [
    "total_signals",
    "high_impact_signals",
    "recommendation_count",
  ] as const) {
    if (
      typeof sum[field] !== "number" ||
      !Number.isInteger(sum[field] as number) ||
      (sum[field] as number) < 0
    ) {
      return {
        ok: false,
        error: `summary.${field} must be a non-negative integer`,
      };
    }
  }

  // Cross-field consistency checks
  if ((sum.total_signals as number) !== frictionSignals.length) {
    return {
      ok: false,
      error: `summary.total_signals (${sum.total_signals}) must equal friction_signals.length (${frictionSignals.length})`,
    };
  }
  if ((sum.recommendation_count as number) !== skillRecommendations.length) {
    return {
      ok: false,
      error: `summary.recommendation_count (${sum.recommendation_count}) must equal skill_recommendations.length (${skillRecommendations.length})`,
    };
  }

  return {
    ok: true,
    value: {
      schema_version: "1.0",
      generated_at: payload.generated_at as string,
      pr_ref: payload.pr_ref,
      session_stats: {
        turn_count: stats.turn_count,
        tool_calls: stats.tool_calls,
        duration_hint: stats.duration_hint,
      },
      friction_signals: frictionSignals,
      skill_recommendations: skillRecommendations,
      summary: {
        total_signals: sum.total_signals as number,
        high_impact_signals: sum.high_impact_signals as number,
        recommendation_count: sum.recommendation_count as number,
      },
    },
  };
}
