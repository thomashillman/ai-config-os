/**
 * Post-Merge Retrospective — storage helpers (V1)
 *
 * Storage layout:
 *   KV  retrospective:<id>:meta          → enriched RetroMeta (60-day TTL)
 *   KV  retrospective:index              → JSON array of ids (newest first, max 100)
 *   R2  retrospectives/<id>/artifact.json → full RetrospectiveArtifact (canonical)
 *
 * The enriched KV meta includes signal_types and recommendations_compact, enabling
 * Claude to query for skill-creation signals without fetching R2 objects.
 * R2 holds the canonical full record; KV is the searchable index.
 *
 * Retention: KV meta keys expire automatically after 60 days via expirationTtl.
 * listRetrospectives prunes stale index entries lazily and deletes their R2 objects.
 * A weekly cron via cleanupExpiredRetrospectives provides belt-and-suspenders R2 cleanup.
 */

import type { RetrospectiveArtifact } from "./schema";
import { sanitizeRecord } from "../observability/sanitize";

// ── Types ─────────────────────────────────────────────────────────────────────

/** Enriched summary stored in KV for efficient list/aggregate operations. */
export interface RetroMeta {
  id: string;
  pr_ref: string;
  generated_at: string;
  schema_version: string;
  total_signals: number;
  high_impact_signals: number;
  recommendation_count: number;
  /** Deduplicated signal types for filtering without R2 access. */
  signal_types: string[];
  /** Compact recommendation data for aggregate queries without R2 access. */
  recommendations_compact: Array<{
    name: string;
    category: string;
    priority: string;
  }>;
}

/** Aggregated view across all recent retrospectives for skill-signal discovery. */
export interface RetroAggregate {
  artifact_count: number;
  signal_breakdown: Record<string, number>;
  top_recommendations: Array<{
    name: string;
    category: string;
    occurrences: number;
    priority_distribution: Record<string, number>;
  }>;
}

/** Result of a successful write. */
export interface WriteRetroResult {
  id: string;
  r2_key: string;
  kv_meta_key: string;
}

// ── KV/R2 type aliases ────────────────────────────────────────────────────────

type KvStore = {
  get(key: string): Promise<string | null> | string | null;
  put(
    key: string,
    value: string,
    options?: { expirationTtl?: number },
  ): Promise<void>;
  delete(key: string): Promise<void>;
};

type R2Bucket = {
  put(key: string, value: string): Promise<void>;
  get(
    key: string,
  ):
    | Promise<{ text(): Promise<string> } | null>
    | { text(): Promise<string> }
    | null;
  delete(key: string): Promise<void>;
};

// ── Constants ─────────────────────────────────────────────────────────────────

/** 60-day TTL applied to all KV meta keys. */
export const RETENTION_TTL_SECONDS = 60 * 24 * 60 * 60;

const MAX_INDEX_SIZE = 100;

// ── Path helpers ──────────────────────────────────────────────────────────────

export function artifactR2Key(id: string): string {
  return `retrospectives/${id}/artifact.json`;
}

export function artifactMetaKvKey(id: string): string {
  return `retrospective:${id}:meta`;
}

export const RETRO_INDEX_KV_KEY = "retrospective:index";

// ── ID derivation ─────────────────────────────────────────────────────────────

/**
 * Derive a deterministic, idempotent ID from pr_ref and generated_at.
 * Re-running for the same PR on the same date overwrites the previous artifact.
 *
 * Examples:
 *   "42", "2026-03-23T10:00:00Z" → "2026-03-23-42"
 *   "feat/my-branch", "2026-03-23T..."  → "2026-03-23-feat-my-branch"
 */
export function deriveRetrospectiveId(
  prRef: string,
  generatedAt: string,
): string {
  const date = generatedAt.slice(0, 10); // 'YYYY-MM-DD'
  const normalized = prRef
    .toLowerCase()
    .replace(/[^a-z0-9-]/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "");
  return `${date}-${normalized}`;
}

// ── Meta builder ──────────────────────────────────────────────────────────────

function buildRetroMeta(
  id: string,
  artifact: RetrospectiveArtifact,
): RetroMeta {
  const signalTypes = [
    ...new Set(artifact.friction_signals.map((s) => s.type)),
  ];
  const recommendationsCompact = artifact.skill_recommendations.map((r) => ({
    name: r.name,
    category: r.category,
    priority: r.priority,
  }));
  return {
    id,
    pr_ref: artifact.pr_ref,
    generated_at: artifact.generated_at,
    schema_version: artifact.schema_version,
    total_signals: artifact.summary.total_signals,
    high_impact_signals: artifact.summary.high_impact_signals,
    recommendation_count: artifact.summary.recommendation_count,
    signal_types: signalTypes,
    recommendations_compact: recommendationsCompact,
  };
}

// ── Write ─────────────────────────────────────────────────────────────────────

/**
 * Persist a validated RetrospectiveArtifact.
 *
 * - Sanitizes all string fields before storage (OWASP Logging CS)
 * - Writes full artifact to R2 (canonical, immutable by id)
 * - Writes enriched meta to KV with 60-day expirationTtl
 * - Updates the retrospective index in KV
 */
export async function writeRetrospectiveArtifact(
  artifact: RetrospectiveArtifact,
  kv: KvStore,
  r2: R2Bucket,
): Promise<WriteRetroResult> {
  const sanitized = sanitizeRecord(artifact) as RetrospectiveArtifact;
  const id = deriveRetrospectiveId(sanitized.pr_ref, sanitized.generated_at);
  const r2Key = artifactR2Key(id);
  const metaKey = artifactMetaKvKey(id);

  // Write full artifact to R2
  await r2.put(r2Key, JSON.stringify(sanitized, null, 2));

  // Write enriched meta to KV with 60-day TTL
  const meta = buildRetroMeta(id, sanitized);
  await kv.put(metaKey, JSON.stringify(meta), {
    expirationTtl: RETENTION_TTL_SECONDS,
  });

  // Update index (prepend, deduplicate, cap at MAX_INDEX_SIZE)
  await updateRetroIndex(kv, id);

  return { id, r2_key: r2Key, kv_meta_key: metaKey };
}

async function updateRetroIndex(kv: KvStore, id: string): Promise<void> {
  const raw = await kv.get(RETRO_INDEX_KV_KEY);
  let index: string[] = [];
  if (raw) {
    try {
      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed)) index = parsed;
    } catch {
      index = [];
    }
  }
  index = [id, ...index.filter((existing) => existing !== id)].slice(
    0,
    MAX_INDEX_SIZE,
  );
  await kv.put(RETRO_INDEX_KV_KEY, JSON.stringify(index));
}

// ── Read ──────────────────────────────────────────────────────────────────────

/**
 * List recent retrospective metas from KV (newest first).
 *
 * Lazily prunes entries whose KV meta has expired: deletes the corresponding
 * R2 object and rewrites the index without the stale ids.
 *
 * @param limit Maximum number of metas to return (1–100). Default: 20.
 */
export async function listRetrospectives(
  kv: KvStore,
  r2: R2Bucket,
  limit = 20,
): Promise<RetroMeta[]> {
  const safeLimit = Math.max(1, Math.min(limit, MAX_INDEX_SIZE));

  const raw = await kv.get(RETRO_INDEX_KV_KEY);
  if (!raw) return [];

  let index: string[];
  try {
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    index = parsed;
  } catch {
    return [];
  }

  const metas: RetroMeta[] = [];
  const staleIds: string[] = [];

  for (const id of index) {
    const metaRaw = await kv.get(artifactMetaKvKey(id));
    if (!metaRaw) {
      // KV TTL expired — clean up R2 object too
      staleIds.push(id);
      try {
        await r2.delete(artifactR2Key(id));
      } catch {
        /* best-effort */
      }
      continue;
    }
    try {
      const meta = JSON.parse(metaRaw) as RetroMeta;
      metas.push(meta);
    } catch {
      staleIds.push(id);
    }
  }

  // Prune stale entries from index
  if (staleIds.length > 0) {
    const staleSet = new Set(staleIds);
    const pruned = index.filter((id) => !staleSet.has(id));
    await kv.put(RETRO_INDEX_KV_KEY, JSON.stringify(pruned));
  }

  return metas.slice(0, safeLimit);
}

/**
 * Read the full artifact for a specific id from R2.
 * Returns null if not found.
 */
export async function getRetrospectiveArtifact(
  id: string,
  r2: R2Bucket,
): Promise<RetrospectiveArtifact | null> {
  const obj = await r2.get(artifactR2Key(id));
  if (!obj) return null;
  try {
    const text = await obj.text();
    return JSON.parse(text) as RetrospectiveArtifact;
  } catch {
    return null;
  }
}

/**
 * Aggregate skill-signal data across all recent retrospectives.
 *
 * Operates entirely from KV metas — no R2 access — for efficient querying.
 * Suitable for Claude to call when identifying which skills to create next.
 *
 * @param limit Maximum metas to include. Default: 100 (full 60-day window).
 */
export async function aggregateRetrospectives(
  kv: KvStore,
  r2: R2Bucket,
  limit = 100,
): Promise<RetroAggregate> {
  const metas = await listRetrospectives(kv, r2, limit);

  const signalBreakdown: Record<string, number> = {};
  const recMap: Map<
    string,
    {
      category: string;
      occurrences: number;
      priority_distribution: Record<string, number>;
    }
  > = new Map();

  for (const meta of metas) {
    for (const signalType of meta.signal_types) {
      signalBreakdown[signalType] = (signalBreakdown[signalType] ?? 0) + 1;
    }
    for (const rec of meta.recommendations_compact) {
      const existing = recMap.get(rec.name);
      if (existing) {
        existing.occurrences += 1;
        existing.priority_distribution[rec.priority] =
          (existing.priority_distribution[rec.priority] ?? 0) + 1;
      } else {
        recMap.set(rec.name, {
          category: rec.category,
          occurrences: 1,
          priority_distribution: { [rec.priority]: 1 },
        });
      }
    }
  }

  const topRecommendations = Array.from(recMap.entries())
    .map(([name, data]) => ({ name, ...data }))
    .sort((a, b) => b.occurrences - a.occurrences);

  return {
    artifact_count: metas.length,
    signal_breakdown: signalBreakdown,
    top_recommendations: topRecommendations,
  };
}
