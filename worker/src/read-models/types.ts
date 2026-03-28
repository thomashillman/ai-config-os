export type FreshnessState = 'fresh' | 'stale' | 'missing' | 'pending';

export interface SnapshotScope {
  repo_id: string;
  machine_id: string;
}

export interface SnapshotMeta {
  generated_at: string;
  publisher_surface: string;
  freshness_state: FreshnessState;
  scope: SnapshotScope;
  interpretation?: Record<string, unknown>;
  [key: string]: unknown;
}

export interface DashboardSnapshot {
  data: unknown;
  meta: SnapshotMeta;
  summary: string;
  updated_at: string;
  source_stamp: string;
}
