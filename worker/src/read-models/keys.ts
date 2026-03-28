// KV key shape: dashboard:{resource}:{repo_id}:{machine_id}
export function snapshotKey(resource: string, repoId: string, machineId: string): string {
  return `dashboard:${resource}:${repoId}:${machineId}`;
}

// List prefix for a resource across all scopes (for admin/debug use)
export function snapshotPrefix(resource: string): string {
  return `dashboard:${resource}:`;
}
