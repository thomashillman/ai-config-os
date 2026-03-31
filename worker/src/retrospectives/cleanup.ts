/**
 * Post-Merge Retrospective — scheduled R2 cleanup (V1)
 *
 * Belt-and-suspenders companion to KV TTL expiry.
 * KV meta keys expire automatically via expirationTtl; this job deletes
 * the corresponding R2 objects and prunes the KV index.
 *
 * Invoked weekly via the Cloudflare scheduled handler in src/index.ts.
 */

import {
  artifactR2Key,
  artifactMetaKvKey,
  RETRO_INDEX_KV_KEY,
} from "./storage";

type KvStore = {
  get(key: string): Promise<string | null> | string | null;
  put(key: string, value: string): Promise<void>;
  delete(key: string): Promise<void>;
};

type R2Bucket = {
  delete(key: string): Promise<void>;
};

export interface CleanupResult {
  deleted: number;
  pruned_from_index: number;
}

/**
 * Delete R2 objects and KV meta entries older than retentionDays.
 * Rebuilds the KV index without expired entries.
 * Only touches the retrospective:* KV namespace and retrospectives/* R2 prefix.
 */
export async function cleanupExpiredRetrospectives(
  kv: KvStore,
  r2: R2Bucket,
  retentionDays: number,
): Promise<CleanupResult> {
  const raw = await kv.get(RETRO_INDEX_KV_KEY);
  if (!raw) return { deleted: 0, pruned_from_index: 0 };

  let index: string[];
  try {
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return { deleted: 0, pruned_from_index: 0 };
    index = parsed;
  } catch {
    return { deleted: 0, pruned_from_index: 0 };
  }

  const cutoffMs = Date.now() - retentionDays * 24 * 60 * 60 * 1000;
  const surviving: string[] = [];
  let deleted = 0;

  for (const id of index) {
    const metaRaw = await kv.get(artifactMetaKvKey(id));

    if (!metaRaw) {
      // Meta already expired via KV TTL — delete R2 object
      try {
        await r2.delete(artifactR2Key(id));
      } catch {
        /* best-effort */
      }
      deleted++;
      continue;
    }

    // Meta still present — check generated_at date directly
    let expired = false;
    try {
      const meta = JSON.parse(metaRaw) as { generated_at?: string };
      if (meta.generated_at) {
        const ts = Date.parse(meta.generated_at);
        if (Number.isFinite(ts) && ts < cutoffMs) {
          expired = true;
        }
      }
    } catch {
      expired = true; // Corrupt meta — treat as expired
    }

    if (expired) {
      await Promise.all([
        kv.delete(artifactMetaKvKey(id)).catch(() => {
          /* best-effort */
        }),
        r2.delete(artifactR2Key(id)).catch(() => {
          /* best-effort */
        }),
      ]);
      deleted++;
    } else {
      surviving.push(id);
    }
  }

  const pruned_from_index = index.length - surviving.length;
  if (pruned_from_index > 0) {
    await kv.put(RETRO_INDEX_KV_KEY, JSON.stringify(surviving));
  }

  return { deleted, pruned_from_index };
}
