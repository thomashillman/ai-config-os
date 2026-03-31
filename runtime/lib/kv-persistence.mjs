// KV persistence layer: key builders, low-level helpers, and index management.
// Extracted from KvTaskStore to separate infrastructure from task lifecycle.

export function normaliseSlug(name) {
  return (name || "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "")
    .slice(0, 32);
}

export function generateShortCode(name, count) {
  const prefix = normaliseSlug(name).slice(0, 4) || "task";
  return `${prefix}${count}`;
}

export class KvPersistence {
  constructor(kv) {
    this.kv = kv;
    this._indexCache = null;
    this._indexDirty = false;
  }

  // --- Key builders ---
  _taskKey(taskId) {
    return `task:${taskId}`;
  }
  _logKey(taskId) {
    return `task:${taskId}:log`;
  }
  _eventsKey(taskId) {
    return `task:${taskId}:events`;
  }
  _snapshotsKey(taskId) {
    return `task:${taskId}:snapshots`;
  }
  _shortCodeKey(code) {
    return `task:short:${code}`;
  }
  _nameSlugKey(slug) {
    return `task:name:${slug}`;
  }
  _indexKey() {
    return "task:index";
  }

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

  // --- Index management ---

  // Load index from KV on first call; subsequent calls use in-memory cache.
  async _loadIndex() {
    if (this._indexCache === null) {
      this._indexCache = (await this._get(this._indexKey())) || [];
    }
    return this._indexCache;
  }

  // Write the dirty cache back to KV. Call at the end of each mutating method.
  async _flushIndex() {
    if (this._indexDirty && this._indexCache !== null) {
      await this._put(this._indexKey(), this._indexCache.slice(0, 200));
      this._indexDirty = false;
    }
  }

  async _updateIndex(taskId, meta) {
    const index = await this._loadIndex();
    const i = index.findIndex((t) => t.task_id === taskId);
    if (i >= 0) {
      index[i] = { ...index[i], ...meta };
    } else {
      index.push({ task_id: taskId, ...meta });
    }
    index.sort((a, b) =>
      (b.updated_at || "").localeCompare(a.updated_at || ""),
    );
    if (index.length > 200) index.length = 200;
    this._indexDirty = true;
  }
}
