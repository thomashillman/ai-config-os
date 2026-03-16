// KV-backed task store for Worker persistence.
// Async interface — methods return Promises backed by Cloudflare KV.
// Compatible with task-control-plane-service.mjs (pass-through service layer).
// Falls back cleanly: if KV is not configured, caller should use task-store-worker.mjs.

import { transitionPortableTaskState, appendRouteSelection } from './portable-task-lifecycle-worker.mjs';
import { appendFindingToTask, transitionFindingsForRouteUpgrade } from './findings-ledger-worker.mjs';

export class TaskConflictError extends Error {
  constructor(message, details = {}) {
    super(message);
    this.name = 'TaskConflictError';
    this.code = 'task_version_conflict';
    this.details = details;
  }
}

export class TaskNotFoundError extends Error {
  constructor(taskId) {
    super(`Task not found: ${taskId}`);
    this.name = 'TaskNotFoundError';
    this.code = 'task_not_found';
    this.details = { taskId };
  }
}

function clone(value) {
  return JSON.parse(JSON.stringify(value));
}

function normaliseSlug(name) {
  return (name || '').toLowerCase().replace(/[^a-z0-9]+/g, '').slice(0, 32);
}

function generateShortCode(name, count) {
  const prefix = normaliseSlug(name).slice(0, 4) || 'task';
  return `${prefix}${count}`;
}

function summariseFindingsProvenance(findings = []) {
  return findings.reduce((summary, finding) => {
    const status = typeof finding?.provenance?.status === 'string'
      ? finding.provenance.status
      : 'unknown';
    summary[status] = (summary[status] ?? 0) + 1;
    return summary;
  }, {});
}

function toTaskReadinessView(task, progressEvents = []) {
  const totalSteps = task.progress?.total_steps ?? 0;
  const completedSteps = task.progress?.completed_steps ?? 0;
  return {
    task_id: task.task_id,
    task_type: task.task_type,
    current_route: task.current_route,
    state: task.state,
    next_action: task.next_action,
    route_history: task.route_history,
    readiness: {
      is_ready: task.state === 'active' && completedSteps < totalSteps,
      stronger_route_available: task.task_type === 'review_repository' && task.current_route !== 'local_repo',
      progress_ratio: totalSteps === 0 ? 1 : Number((completedSteps / totalSteps).toFixed(4)),
    },
    findings_provenance: summariseFindingsProvenance(Array.isArray(task.findings) ? task.findings : []),
    progress_event_count: progressEvents.length,
  };
}

function createSnapshot(task) {
  return {
    schema_version: '1.0.0',
    task_id: task.task_id,
    snapshot_version: task.version,
    created_at: task.updated_at,
    task,
  };
}

export class KvTaskStore {
  constructor(kv, handoffTokenService = null) {
    this.kv = kv;
    this.handoffTokenService = handoffTokenService;
  }

  // --- KV key helpers ---
  _taskKey(taskId) { return `task:${taskId}`; }
  _logKey(taskId) { return `task:${taskId}:log`; }
  _eventsKey(taskId) { return `task:${taskId}:events`; }
  _snapshotsKey(taskId) { return `task:${taskId}:snapshots`; }
  _shortCodeKey(code) { return `task:short:${code}`; }
  _nameSlugKey(slug) { return `task:name:${slug}`; }
  _indexKey() { return 'task:index'; }

  // --- Low-level KV helpers ---
  async _get(key) {
    const raw = await this.kv.get(key);
    if (raw === null || raw === undefined) return null;
    return JSON.parse(raw);
  }

  async _put(key, value) {
    await this.kv.put(key, JSON.stringify(value));
  }

  async _append(key, item) {
    const arr = (await this._get(key)) || [];
    arr.push(item);
    await this._put(key, arr);
  }

  async _updateIndex(taskId, meta) {
    const index = (await this._get(this._indexKey())) || [];
    const i = index.findIndex(t => t.task_id === taskId);
    if (i >= 0) {
      index[i] = { ...index[i], ...meta };
    } else {
      index.push({ task_id: taskId, ...meta });
    }
    index.sort((a, b) => (b.updated_at || '').localeCompare(a.updated_at || ''));
    await this._put(this._indexKey(), index.slice(0, 200));
  }

  // --- TaskStore interface (async) ---

  async create(task) {
    const validated = clone(task);
    const existing = await this._get(this._taskKey(validated.task_id));
    if (existing) {
      throw new TaskConflictError(`Task already exists: ${validated.task_id}`, { taskId: validated.task_id });
    }

    // Assign short code from name/goal
    const name = (validated.goal || validated.task_type || 'task').slice(0, 80);
    const index = (await this._get(this._indexKey())) || [];
    const prefix = normaliseSlug(name).slice(0, 4) || 'task';
    const samePrefix = index.filter(t => (t.short_code || '').startsWith(prefix)).length;
    const shortCode = generateShortCode(name, samePrefix + 1);

    validated.short_code = shortCode;
    validated.name = name;

    await this._put(this._taskKey(validated.task_id), validated);
    await this._put(this._shortCodeKey(shortCode), validated.task_id);

    const slug = normaliseSlug(name);
    if (slug) {
      await this._put(this._nameSlugKey(slug), validated.task_id);
    }

    await this._append(this._snapshotsKey(validated.task_id), createSnapshot(validated));
    await this._append(this._logKey(validated.task_id), {
      type: 'task_created',
      task_id: validated.task_id,
      created_at: validated.updated_at || new Date().toISOString(),
      data: { task_type: validated.task_type, route: validated.current_route, goal: validated.goal },
    });

    await this._updateIndex(validated.task_id, {
      name: validated.name,
      short_code: shortCode,
      task_type: validated.task_type,
      state: validated.state,
      current_route: validated.current_route,
      stronger_route_available: validated.task_type === 'review_repository' && validated.current_route !== 'local_repo',
      updated_at: validated.updated_at || new Date().toISOString(),
    });

    return clone(validated);
  }

  async load(taskId) {
    const task = await this._get(this._taskKey(taskId));
    if (!task) throw new TaskNotFoundError(taskId);
    return clone(task);
  }

  async loadByCode(shortCode) {
    const taskId = await this._get(this._shortCodeKey(shortCode));
    if (!taskId) throw new TaskNotFoundError(shortCode);
    return this.load(taskId);
  }

  async loadByName(nameOrSlug) {
    const slug = normaliseSlug(nameOrSlug);
    // Exact slug match first
    const taskId = await this._get(this._nameSlugKey(slug));
    if (taskId) return this.load(taskId);
    // Fallback: partial match in index
    const index = (await this._get(this._indexKey())) || [];
    const match = index.find(t => normaliseSlug(t.name || '').includes(slug.slice(0, 8)));
    if (!match) throw new TaskNotFoundError(nameOrSlug);
    return this.load(match.task_id);
  }

  async update(taskId, { expectedVersion, changes }) {
    const current = await this._get(this._taskKey(taskId));
    if (!current) throw new TaskNotFoundError(taskId);
    if (current.version !== expectedVersion) {
      throw new TaskConflictError(
        `Version conflict for ${taskId}: expected ${expectedVersion}, current ${current.version}`,
        { taskId, expectedVersion, currentVersion: current.version },
      );
    }
    const next = { ...current, ...clone(changes), version: current.version + 1 };
    await this._put(this._taskKey(taskId), next);
    await this._append(this._snapshotsKey(taskId), createSnapshot(next));
    await this._updateIndex(taskId, {
      state: next.state,
      current_route: next.current_route,
      stronger_route_available: next.task_type === 'review_repository' && next.current_route !== 'local_repo',
      updated_at: next.updated_at || new Date().toISOString(),
    });
    return clone(next);
  }

  async transitionState(taskId, { expectedVersion, nextState, nextAction, updatedAt, progress }) {
    const current = await this._get(this._taskKey(taskId));
    if (!current) throw new TaskNotFoundError(taskId);
    if (current.version !== expectedVersion) {
      throw new TaskConflictError(
        `Version conflict for ${taskId}: expected ${expectedVersion}, current ${current.version}`,
        { taskId, expectedVersion, currentVersion: current.version },
      );
    }
    const validated = transitionPortableTaskState({ task: current, expectedVersion, nextState, nextAction, updatedAt, progress });
    await this._put(this._taskKey(taskId), validated);
    await this._append(this._snapshotsKey(taskId), createSnapshot(validated));
    await this._append(this._eventsKey(taskId), {
      schema_version: '1.0.0',
      task_id: taskId,
      event_id: `evt_${validated.version}_state_change`,
      type: 'state_change',
      message: `Task transitioned to ${validated.state}.`,
      created_at: updatedAt,
      metadata: {
        next_state: validated.state,
        completed_steps: validated.progress.completed_steps,
        total_steps: validated.progress.total_steps,
      },
    });
    await this._append(this._logKey(taskId), {
      type: 'state_transitioned',
      task_id: taskId,
      created_at: updatedAt,
      data: { from_state: current.state, to_state: validated.state },
    });
    await this._updateIndex(taskId, { state: validated.state, updated_at: updatedAt });
    return clone(validated);
  }

  async appendFinding(taskId, { expectedVersion, finding, updatedAt }) {
    const current = await this._get(this._taskKey(taskId));
    if (!current) throw new TaskNotFoundError(taskId);
    if (current.version !== expectedVersion) {
      throw new TaskConflictError(
        `Version conflict for ${taskId}: expected ${expectedVersion}, current ${current.version}`,
        { taskId, expectedVersion, currentVersion: current.version },
      );
    }
    const next = appendFindingToTask({ task: current, expectedVersion, finding, updatedAt });
    await this._put(this._taskKey(taskId), next);
    await this._append(this._snapshotsKey(taskId), createSnapshot(next));
    const lastFinding = next.findings[next.findings.length - 1];
    await this._append(this._eventsKey(taskId), {
      schema_version: '1.0.0',
      task_id: taskId,
      event_id: `evt_${next.version}_finding_recorded`,
      type: 'finding_recorded',
      message: `Recorded finding ${lastFinding.finding_id}.`,
      created_at: updatedAt,
      metadata: { finding_id: lastFinding.finding_id, provenance_status: lastFinding.provenance.status },
    });
    await this._append(this._logKey(taskId), {
      type: 'finding_added',
      task_id: taskId,
      created_at: updatedAt,
      data: { finding_id: lastFinding.finding_id, status: lastFinding.provenance.status },
    });
    await this._updateIndex(taskId, { updated_at: updatedAt });
    return clone(next);
  }

  async transitionFindingsForRouteUpgrade(taskId, { expectedVersion, toRouteId, upgradedAt, toEquivalenceLevel }) {
    const current = await this._get(this._taskKey(taskId));
    if (!current) throw new TaskNotFoundError(taskId);
    if (current.version !== expectedVersion) {
      throw new TaskConflictError(
        `Version conflict for ${taskId}: expected ${expectedVersion}, current ${current.version}`,
        { taskId, expectedVersion, currentVersion: current.version },
      );
    }
    const transitionedFindings = transitionFindingsForRouteUpgrade({
      findings: current.findings, toRouteId, upgradedAt, toEquivalenceLevel,
    });
    const next = { ...clone(current), findings: transitionedFindings, version: current.version + 1, updated_at: upgradedAt };
    await this._put(this._taskKey(taskId), next);
    await this._append(this._snapshotsKey(taskId), createSnapshot(next));
    const reclassifiedCount = transitionedFindings.reduce((count, nf, idx) => {
      const pf = current.findings[idx];
      return (!pf || pf.provenance.status !== nf.provenance.status || pf.provenance.recorded_by_route !== nf.provenance.recorded_by_route)
        ? count + 1 : count;
    }, 0);
    await this._append(this._eventsKey(taskId), {
      schema_version: '1.0.0',
      task_id: taskId,
      event_id: `evt_${next.version}_finding_transitioned`,
      type: 'finding_transitioned',
      message: `Updated findings provenance for route upgrade to ${toRouteId}.`,
      created_at: upgradedAt,
      metadata: { route_id: toRouteId, reclassified_count: reclassifiedCount, equivalence_level: toEquivalenceLevel },
    });
    await this._append(this._logKey(taskId), {
      type: 'finding_transitioned',
      task_id: taskId,
      created_at: upgradedAt,
      data: { to_route: toRouteId, reclassified_count: reclassifiedCount, equivalence_level: toEquivalenceLevel },
    });
    await this._updateIndex(taskId, {
      current_route: toRouteId,
      stronger_route_available: next.task_type === 'review_repository' && toRouteId !== 'local_repo',
      updated_at: upgradedAt,
    });
    return clone(next);
  }

  async selectRoute(taskId, { routeId, expectedVersion, selectedAt }) {
    const current = await this._get(this._taskKey(taskId));
    if (!current) throw new TaskNotFoundError(taskId);
    if (current.version !== expectedVersion) {
      throw new TaskConflictError(
        `Version conflict for ${taskId}: expected ${expectedVersion}, current ${current.version}`,
        { taskId, expectedVersion, currentVersion: current.version },
      );
    }
    const next = appendRouteSelection({ task: current, routeId, expectedVersion, selectedAt });
    await this._put(this._taskKey(taskId), next);
    await this._append(this._snapshotsKey(taskId), createSnapshot(next));
    await this._append(this._eventsKey(taskId), {
      schema_version: '1.0.0',
      task_id: taskId,
      event_id: `evt_${next.version}_route_selected`,
      type: 'route_selected',
      message: `Selected route ${routeId}.`,
      created_at: selectedAt,
      metadata: { route_id: routeId },
    });
    await this._append(this._logKey(taskId), {
      type: 'route_upgraded',
      task_id: taskId,
      created_at: selectedAt,
      data: { from_route: current.current_route, to_route: routeId },
    });
    await this._updateIndex(taskId, {
      current_route: routeId,
      stronger_route_available: next.task_type === 'review_repository' && routeId !== 'local_repo',
      updated_at: selectedAt,
    });
    return clone(next);
  }

  async listProgressEvents(taskId) {
    const task = await this._get(this._taskKey(taskId));
    if (!task) throw new TaskNotFoundError(taskId);
    return (await this._get(this._eventsKey(taskId))) || [];
  }

  async getReadinessView(taskId) {
    const task = await this._get(this._taskKey(taskId));
    if (!task) throw new TaskNotFoundError(taskId);
    const events = (await this._get(this._eventsKey(taskId))) || [];
    return clone(toTaskReadinessView(task, events));
  }

  async createContinuationPackage(taskId, { handoffToken, effectiveExecutionContract, createdAt = new Date().toISOString() }) {
    const task = await this._get(this._taskKey(taskId));
    if (!task) throw new TaskNotFoundError(taskId);

    const validatedHandoffToken = clone(handoffToken);
    if (validatedHandoffToken.task_id !== taskId) {
      throw new Error(`handoffToken.task_id must match taskId '${taskId}'`);
    }
    const validatedExecutionContract = clone(effectiveExecutionContract);
    if (validatedExecutionContract.task_id !== taskId) {
      throw new Error(`effectiveExecutionContract.task_id must match taskId '${taskId}'`);
    }
    if (validatedExecutionContract.task_type !== task.task_type) {
      throw new Error(`effectiveExecutionContract.task_type must match task task_type '${task.task_type}'`);
    }

    const events = (await this._get(this._eventsKey(taskId))) || [];
    const tokenId = validatedHandoffToken.token_id;
    const existingEvent = events.find(e =>
      e.type === 'continuation_created' && e.metadata?.handoff_token_id === tokenId,
    );
    const canonicalCreatedAt = existingEvent?.metadata?.continuation_package_created_at
      || existingEvent?.created_at
      || createdAt;

    if (existingEvent) {
      return clone({
        schema_version: '1.0.0',
        task: clone(task),
        effective_execution_contract: validatedExecutionContract,
        handoff_token_id: tokenId,
        created_at: canonicalCreatedAt,
      });
    }

    if (!this.handoffTokenService) {
      throw new Error('handoffTokenService is not configured');
    }

    this.handoffTokenService.verifyToken({
      token: validatedHandoffToken,
      expectedTaskId: taskId,
      now: createdAt,
    });

    this.handoffTokenService.consumeToken({
      tokenId: validatedHandoffToken.token_id,
      nonce: validatedHandoffToken.replay_nonce,
      now: createdAt,
      expiresAt: validatedHandoffToken.expires_at,
    });

    const pkg = {
      schema_version: '1.0.0',
      task: clone(task),
      effective_execution_contract: validatedExecutionContract,
      handoff_token_id: tokenId,
      created_at: canonicalCreatedAt,
    };

    await this._append(this._eventsKey(taskId), {
      schema_version: '1.0.0',
      task_id: taskId,
      event_id: `evt_continuation_${tokenId}`,
      type: 'continuation_created',
      message: 'Continuation package created.',
      created_at: canonicalCreatedAt,
      metadata: {
        handoff_token_id: tokenId,
        continuation_package_created_at: canonicalCreatedAt,
      },
    });
    await this._append(this._logKey(taskId), {
      type: 'handoff_issued',
      task_id: taskId,
      created_at: canonicalCreatedAt,
      data: { token_id: tokenId, expires_at: validatedHandoffToken.expires_at },
    });

    return clone(pkg);
  }

  async listSnapshots(taskId) {
    const task = await this._get(this._taskKey(taskId));
    if (!task) throw new TaskNotFoundError(taskId);
    return (await this._get(this._snapshotsKey(taskId))) || [];
  }

  async getSnapshot(taskId, version) {
    const snapshots = await this.listSnapshots(taskId);
    const snapshot = snapshots.find(s => s.snapshot_version === version);
    if (!snapshot) throw new TaskNotFoundError(`snapshot version ${version} for task ${taskId}`);
    return clone(snapshot);
  }

  // --- Extra methods for task hub and session-start hook ---

  async listRecentTasks({ status, limit = 10, updatedWithinSeconds } = {}) {
    const index = (await this._get(this._indexKey())) || [];
    let filtered = index;
    if (status) {
      filtered = filtered.filter(t => t.state === status);
    }
    if (updatedWithinSeconds) {
      const cutoff = new Date(Date.now() - updatedWithinSeconds * 1000).toISOString();
      filtered = filtered.filter(t => (t.updated_at || '') >= cutoff);
    }
    return filtered.slice(0, limit);
  }

  async getLatestActiveTask() {
    const tasks = await this.listRecentTasks({ status: 'active', limit: 1 });
    if (!tasks.length) return null;
    return this.load(tasks[0].task_id);
  }

  async getCheckpointLog(taskId) {
    const task = await this._get(this._taskKey(taskId));
    if (!task) throw new TaskNotFoundError(taskId);
    return (await this._get(this._logKey(taskId))) || [];
  }
}
