import { snapshotKey } from './keys';
import type { DashboardSnapshot, SnapshotMeta, SnapshotScope } from './types';

type KV = NonNullable<import('../types').Env['MANIFEST_KV']>;

export async function readSnapshot(
  kv: KV,
  resource: string,
  scope: SnapshotScope,
): Promise<DashboardSnapshot | null> {
  const key = snapshotKey(resource, scope.repo_id, scope.machine_id);
  const raw = await kv.get(key);
  if (!raw) return null;
  try {
    return JSON.parse(raw) as DashboardSnapshot;
  } catch {
    return null;
  }
}

export async function writeSnapshot(
  kv: KV,
  resource: string,
  scope: SnapshotScope,
  snapshot: DashboardSnapshot,
): Promise<void> {
  const key = snapshotKey(resource, scope.repo_id, scope.machine_id);
  await kv.put(key, JSON.stringify(snapshot));
}

export function missingMeta(scope: SnapshotScope): SnapshotMeta {
  return {
    generated_at: new Date().toISOString(),
    publisher_surface: 'worker',
    freshness_state: 'missing',
    scope,
  };
}
