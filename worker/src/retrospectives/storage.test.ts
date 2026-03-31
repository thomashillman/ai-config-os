/**
 * Regression tests for retrospectives/storage.ts
 *
 * Uses plain in-memory mock objects satisfying the KvStore / R2Bucket interfaces.
 * No miniflare or Cloudflare Workers runtime needed — all storage functions are
 * pure async logic with no Workers-specific APIs.
 */

import { describe, it, expect, beforeEach } from "vitest";
import type { RetrospectiveArtifact } from "./schema";
import {
  deriveRetrospectiveId,
  artifactR2Key,
  artifactMetaKvKey,
  RETRO_INDEX_KV_KEY,
  writeRetrospectiveArtifact,
  listRetrospectives,
  getRetrospectiveArtifact,
  aggregateRetrospectives,
} from "./storage";

// ── In-memory mock factories ──────────────────────────────────────────────────

function makeMockKv(initial: Record<string, string> = {}) {
  const store: Record<string, string> = { ...initial };
  return {
    async get(key: string) {
      return store[key] ?? null;
    },
    async put(key: string, value: string) {
      store[key] = value;
    },
    async delete(key: string) {
      delete store[key];
    },
    _store: store,
  };
}

function makeMockR2(initial: Record<string, string> = {}) {
  const store: Record<string, string> = { ...initial };
  return {
    async put(key: string, value: string) {
      store[key] = value;
    },
    async get(key: string) {
      if (!(key in store)) return null;
      const text = store[key];
      return {
        async text() {
          return text;
        },
      };
    },
    async delete(key: string) {
      delete store[key];
    },
    _store: store,
  };
}

// ── Minimal valid artifact fixture ────────────────────────────────────────────

function makeArtifact(
  overrides: Partial<RetrospectiveArtifact> = {},
): RetrospectiveArtifact {
  return {
    schema_version: "1.0",
    generated_at: "2026-03-23T10:00:00Z",
    pr_ref: "42",
    session_stats: { turn_count: 5, tool_calls: 12, duration_hint: "10m" },
    friction_signals: [
      {
        type: "loop",
        turn_index: 2,
        description: "Repeated the same read",
        impact: "low",
        repeatable: true,
      },
      {
        type: "error",
        turn_index: 4,
        description: "Type error on assignment",
        impact: "high",
        repeatable: false,
      },
    ],
    skill_recommendations: [
      {
        name: "git-ops",
        category: "code-quality",
        rationale: "Automates rebase checks",
        trigger_description: "Before rebasing onto main",
        priority: "high",
        estimated_reuse: "frequent",
      },
    ],
    summary: {
      total_signals: 2,
      high_impact_signals: 1,
      recommendation_count: 1,
    },
    ...overrides,
  };
}

// ── deriveRetrospectiveId ─────────────────────────────────────────────────────

describe("deriveRetrospectiveId", () => {
  it("uses YYYY-MM-DD prefix from generated_at", () => {
    const id = deriveRetrospectiveId("42", "2026-03-23T10:00:00Z");
    expect(id).toMatch(/^2026-03-23-/);
  });

  it("normalises a numeric PR ref", () => {
    expect(deriveRetrospectiveId("42", "2026-03-23T10:00:00Z")).toBe(
      "2026-03-23-42",
    );
  });

  it("converts slashes and special chars in branch-style refs to hyphens", () => {
    expect(
      deriveRetrospectiveId("feat/my-branch", "2026-03-23T10:00:00Z"),
    ).toBe("2026-03-23-feat-my-branch");
  });

  it("collapses consecutive separators and trims leading/trailing hyphens", () => {
    const id = deriveRetrospectiveId(
      "--fix--something--",
      "2026-01-01T00:00:00Z",
    );
    expect(id).toBe("2026-01-01-fix-something");
  });

  it("is deterministic — same inputs always produce the same ID", () => {
    const a = deriveRetrospectiveId("feat/add-widget", "2026-06-15T08:30:00Z");
    const b = deriveRetrospectiveId("feat/add-widget", "2026-06-15T08:30:00Z");
    expect(a).toBe(b);
  });
});

// ── writeRetrospectiveArtifact ────────────────────────────────────────────────

describe("writeRetrospectiveArtifact", () => {
  it("writes full artifact to R2 at the expected key", async () => {
    const kv = makeMockKv();
    const r2 = makeMockR2();
    const artifact = makeArtifact();

    const result = await writeRetrospectiveArtifact(artifact, kv, r2);

    expect(result.r2_key).toBe(artifactR2Key(result.id));
    expect(r2._store[result.r2_key]).toBeDefined();
    const stored = JSON.parse(r2._store[result.r2_key]);
    expect(stored.pr_ref).toBe("42");
    expect(stored.schema_version).toBe("1.0");
  });

  it("writes enriched meta to KV at the expected key", async () => {
    const kv = makeMockKv();
    const r2 = makeMockR2();
    const artifact = makeArtifact();

    const result = await writeRetrospectiveArtifact(artifact, kv, r2);

    expect(result.kv_meta_key).toBe(artifactMetaKvKey(result.id));
    const meta = JSON.parse(kv._store[result.kv_meta_key]);
    expect(meta.id).toBe(result.id);
    expect(meta.total_signals).toBe(2);
    expect(meta.signal_types).toContain("loop");
    expect(meta.signal_types).toContain("error");
    expect(meta.recommendations_compact[0].name).toBe("git-ops");
  });

  it("prepends the new id to the KV index", async () => {
    const kv = makeMockKv({
      [RETRO_INDEX_KV_KEY]: JSON.stringify(["2025-01-01-old"]),
    });
    const r2 = makeMockR2();

    const result = await writeRetrospectiveArtifact(makeArtifact(), kv, r2);

    const index = JSON.parse(kv._store[RETRO_INDEX_KV_KEY]);
    expect(index[0]).toBe(result.id);
    expect(index).toContain("2025-01-01-old");
  });

  it("deduplicates the index when re-writing the same artifact", async () => {
    const kv = makeMockKv();
    const r2 = makeMockR2();
    const artifact = makeArtifact();

    await writeRetrospectiveArtifact(artifact, kv, r2);
    await writeRetrospectiveArtifact(artifact, kv, r2);

    const index = JSON.parse(kv._store[RETRO_INDEX_KV_KEY]);
    const id = deriveRetrospectiveId(artifact.pr_ref, artifact.generated_at);
    expect(index.filter((x: string) => x === id).length).toBe(1);
  });
});

// ── listRetrospectives ────────────────────────────────────────────────────────

describe("listRetrospectives", () => {
  it("returns an empty array when index is absent", async () => {
    const kv = makeMockKv();
    const r2 = makeMockR2();
    expect(await listRetrospectives(kv, r2)).toEqual([]);
  });

  it("returns metas for live entries and prunes stale ones", async () => {
    const liveId = "2026-03-23-42";
    const staleId = "2025-01-01-old";

    const liveMeta = JSON.stringify({
      id: liveId,
      pr_ref: "42",
      generated_at: "2026-03-23T10:00:00Z",
      schema_version: "1.0",
      total_signals: 1,
      high_impact_signals: 0,
      recommendation_count: 0,
      signal_types: ["loop"],
      recommendations_compact: [],
    });

    const kv = makeMockKv({
      [RETRO_INDEX_KV_KEY]: JSON.stringify([liveId, staleId]),
      [artifactMetaKvKey(liveId)]: liveMeta,
      // staleId has NO meta key (simulating KV TTL expiry)
    });
    const r2 = makeMockR2({
      [artifactR2Key(staleId)]: JSON.stringify({ pr_ref: staleId }),
    });

    const metas = await listRetrospectives(kv, r2);

    expect(metas.length).toBe(1);
    expect(metas[0].id).toBe(liveId);

    // Stale R2 object deleted
    expect(r2._store[artifactR2Key(staleId)]).toBeUndefined();

    // Index pruned
    const newIndex = JSON.parse(kv._store[RETRO_INDEX_KV_KEY]);
    expect(newIndex).not.toContain(staleId);
    expect(newIndex).toContain(liveId);
  });

  it("respects the limit parameter", async () => {
    const ids = ["2026-03-23-a", "2026-03-23-b", "2026-03-23-c"];
    const initial: Record<string, string> = {
      [RETRO_INDEX_KV_KEY]: JSON.stringify(ids),
    };
    for (const id of ids) {
      initial[artifactMetaKvKey(id)] = JSON.stringify({
        id,
        pr_ref: id,
        generated_at: "2026-03-23T00:00:00Z",
        schema_version: "1.0",
        total_signals: 0,
        high_impact_signals: 0,
        recommendation_count: 0,
        signal_types: [],
        recommendations_compact: [],
      });
    }
    const kv = makeMockKv(initial);
    const r2 = makeMockR2();

    const metas = await listRetrospectives(kv, r2, 2);
    expect(metas.length).toBe(2);
  });
});

// ── getRetrospectiveArtifact ──────────────────────────────────────────────────

describe("getRetrospectiveArtifact", () => {
  it("returns null for a missing key", async () => {
    const r2 = makeMockR2();
    expect(await getRetrospectiveArtifact("nonexistent", r2)).toBeNull();
  });

  it("returns the parsed artifact for a present key", async () => {
    const artifact = makeArtifact();
    const id = deriveRetrospectiveId(artifact.pr_ref, artifact.generated_at);
    const r2 = makeMockR2({ [artifactR2Key(id)]: JSON.stringify(artifact) });

    const result = await getRetrospectiveArtifact(id, r2);
    expect(result).not.toBeNull();
    expect(result?.pr_ref).toBe("42");
  });
});

// ── aggregateRetrospectives ───────────────────────────────────────────────────

describe("aggregateRetrospectives", () => {
  let kv: ReturnType<typeof makeMockKv>;
  let r2: ReturnType<typeof makeMockR2>;

  beforeEach(() => {
    const id1 = "2026-03-01-pr-10";
    const id2 = "2026-03-15-pr-20";

    const meta1 = JSON.stringify({
      id: id1,
      pr_ref: "pr-10",
      generated_at: "2026-03-01T00:00:00Z",
      schema_version: "1.0",
      total_signals: 2,
      high_impact_signals: 1,
      recommendation_count: 1,
      signal_types: ["loop", "error"],
      recommendations_compact: [
        { name: "git-ops", category: "code-quality", priority: "high" },
      ],
    });
    const meta2 = JSON.stringify({
      id: id2,
      pr_ref: "pr-20",
      generated_at: "2026-03-15T00:00:00Z",
      schema_version: "1.0",
      total_signals: 1,
      high_impact_signals: 0,
      recommendation_count: 2,
      signal_types: ["loop"],
      recommendations_compact: [
        { name: "git-ops", category: "code-quality", priority: "medium" },
        { name: "debug", category: "code-quality", priority: "low" },
      ],
    });

    kv = makeMockKv({
      [RETRO_INDEX_KV_KEY]: JSON.stringify([id1, id2]),
      [artifactMetaKvKey(id1)]: meta1,
      [artifactMetaKvKey(id2)]: meta2,
    });
    r2 = makeMockR2();
  });

  it("counts artifact_count correctly", async () => {
    const agg = await aggregateRetrospectives(kv, r2);
    expect(agg.artifact_count).toBe(2);
  });

  it("accumulates signal_breakdown across metas", async () => {
    const agg = await aggregateRetrospectives(kv, r2);
    // loop appears in both metas → 2; error only in meta1 → 1
    expect(agg.signal_breakdown.loop).toBe(2);
    expect(agg.signal_breakdown.error).toBe(1);
  });

  it("merges top_recommendations by name and counts occurrences", async () => {
    const agg = await aggregateRetrospectives(kv, r2);
    const gitOps = agg.top_recommendations.find((r) => r.name === "git-ops");
    expect(gitOps).toBeDefined();
    expect(gitOps?.occurrences).toBe(2);
  });

  it("sorts top_recommendations by occurrences descending", async () => {
    const agg = await aggregateRetrospectives(kv, r2);
    const occurrences = agg.top_recommendations.map((r) => r.occurrences);
    const sorted = [...occurrences].sort((a, b) => b - a);
    expect(occurrences).toEqual(sorted);
  });

  it("builds priority_distribution correctly", async () => {
    const agg = await aggregateRetrospectives(kv, r2);
    const gitOps = agg.top_recommendations.find((r) => r.name === "git-ops");
    expect(gitOps?.priority_distribution.high).toBe(1);
    expect(gitOps?.priority_distribution.medium).toBe(1);
  });

  it("returns empty aggregate when no metas exist", async () => {
    const emptyKv = makeMockKv();
    const agg = await aggregateRetrospectives(emptyKv, r2);
    expect(agg.artifact_count).toBe(0);
    expect(agg.signal_breakdown).toEqual({});
    expect(agg.top_recommendations).toEqual([]);
  });
});
