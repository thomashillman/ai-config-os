/**
 * capabilities-client.mjs — Reference client for the ai-config-os capability API.
 *
 * Works in Node.js (Claude Code CLI/Desktop) and browsers (Claude Code Web, iOS).
 * Zero dependencies; uses the global fetch API (Node 18+, all browsers).
 *
 * Usage (Node.js / session-start hook):
 *   import { CapabilityClient } from './adapters/claude/capabilities-client.mjs';
 *
 *   const client = new CapabilityClient({
 *     workerUrl: process.env.AI_CONFIG_WORKER,
 *     token: process.env.AI_CONFIG_TOKEN,
 *   });
 *
 *   const profile = await client.getPlatformCapabilities('claude-code');
 *   const skills  = await client.getCompatibleSkills(profile.capabilities.supported);
 *
 * Usage (browser / Claude Code Web):
 *   const client = new CapabilityClient({
 *     workerUrl: 'https://ai-config-os-main.tj-hillman.workers.dev',
 *     token: SESSION_TOKEN,          // injected by host app
 *     platform: 'claude-web',        // explicit override for browser
 *     cache: 'localstorage',         // optional: persist across reloads
 *   });
 *
 *   // One call covers everything — recommended for session start
 *   const { profile, skills } = await client.getSessionStartData();
 */

// ─── Constants ────────────────────────────────────────────────────────────────

const DEFAULT_WORKER_URL = "https://ai-config-os-main.tj-hillman.workers.dev";
const DEFAULT_TIMEOUT_MS = 5_000;
const CACHE_KEY_PREFIX = "ai-config-os:cap:";
const CACHE_TTL_MS = 60 * 60 * 1000; // 1 hour (Worker responses are immutable by version anyway)

// ─── Errors ───────────────────────────────────────────────────────────────────

export class CapabilityClientError extends Error {
  constructor(message, { code, status, hint } = {}) {
    super(message);
    this.name = "CapabilityClientError";
    this.code = code ?? "CLIENT_ERROR";
    this.status = status ?? null;
    this.hint = hint ?? null;
  }
}

// ─── Cache adapters ───────────────────────────────────────────────────────────

class MemoryCache {
  #store = new Map();
  get(key) {
    const entry = this.#store.get(key);
    if (!entry) return null;
    if (Date.now() > entry.expiresAt) {
      this.#store.delete(key);
      return null;
    }
    return entry.value;
  }
  set(key, value, ttlMs) {
    this.#store.set(key, { value, expiresAt: Date.now() + ttlMs });
  }
}

class LocalStorageCache {
  get(key) {
    try {
      const raw = globalThis.localStorage?.getItem(CACHE_KEY_PREFIX + key);
      if (!raw) return null;
      const entry = JSON.parse(raw);
      if (Date.now() > entry.expiresAt) {
        this.delete(key);
        return null;
      }
      return entry.value;
    } catch {
      return null;
    }
  }
  set(key, value, ttlMs) {
    try {
      globalThis.localStorage?.setItem(
        CACHE_KEY_PREFIX + key,
        JSON.stringify({ value, expiresAt: Date.now() + ttlMs }),
      );
    } catch {
      /* storage full or unavailable — degrade silently */
    }
  }
  delete(key) {
    try {
      globalThis.localStorage?.removeItem(CACHE_KEY_PREFIX + key);
    } catch {
      /* ignore */
    }
  }
}

function makeCache(strategy) {
  if (strategy === "localstorage") return new LocalStorageCache();
  return new MemoryCache(); // default: in-process memory
}

// ─── CapabilityClient ─────────────────────────────────────────────────────────

export class CapabilityClient {
  #workerUrl;
  #token;
  #platform;
  #timeoutMs;
  #cache;

  /**
   * @param {object} opts
   * @param {string} [opts.workerUrl]   - Worker base URL (defaults to production)
   * @param {string} opts.token         - Bearer auth token
   * @param {string} [opts.platform]    - Explicit platform override (e.g. 'claude-web')
   * @param {number} [opts.timeoutMs]   - Request timeout (default 5000ms)
   * @param {'memory'|'localstorage'} [opts.cache] - Cache strategy
   */
  constructor({ workerUrl, token, platform, timeoutMs, cache } = {}) {
    if (!token) throw new CapabilityClientError("token is required");
    this.#workerUrl = (workerUrl ?? DEFAULT_WORKER_URL).replace(/\/$/, "");
    this.#token = token;
    this.#platform = platform ?? null;
    this.#timeoutMs = timeoutMs ?? DEFAULT_TIMEOUT_MS;
    this.#cache = makeCache(cache ?? "memory");
  }

  // ─── Public API ─────────────────────────────────────────────────────────────

  /**
   * Detect the current platform from environment hints.
   * Returns an explicit override if set in constructor.
   */
  detectPlatform() {
    if (this.#platform) return this.#platform;

    // Node.js environment signals
    if (typeof process !== "undefined") {
      if (process.env.CLAUDE_CODE_REMOTE === "true") return "claude-code";
      if (process.env.CLAUDE_CODE || process.env.CLAUDE_CODE_REMOTE)
        return "claude-code";
      if (process.env.CURSOR_SESSION) return "cursor";
      if (process.env.CODEX_CLI) return "codex";
    }

    // Browser environment
    if (typeof navigator !== "undefined") {
      const ua = navigator.userAgent ?? "";
      if (/iPhone|iPad|iPod/i.test(ua)) return "claude-ios";
      return "claude-web";
    }

    return "claude-code"; // safe default for CLI
  }

  /**
   * Fetch capability profile for a platform.
   * Response is immutably cached (Cloudflare edge + local cache).
   *
   * @param {string} [platform] - Platform ID (default: auto-detect)
   * @returns {Promise<import('./types').CapabilityPlatformResponse>}
   */
  async getPlatformCapabilities(platform) {
    const pid = platform ?? this.detectPlatform();
    const cacheKey = `platform:${pid}`;

    const cached = this.#cache.get(cacheKey);
    if (cached) return cached;

    const data = await this.#get(
      `/v1/capabilities/platform/${encodeURIComponent(pid)}`,
    );
    this.#cache.set(cacheKey, data, CACHE_TTL_MS);
    return data;
  }

  /**
   * Fetch skills compatible with a given capability set.
   * Response is immutably cached by capability set + manifest version.
   *
   * @param {string[]} capabilities - Capability IDs (e.g. ['network.http', 'fs.read'])
   * @returns {Promise<import('./types').CompatibleSkillsResponse>}
   */
  async getCompatibleSkills(capabilities) {
    if (!Array.isArray(capabilities) || capabilities.length === 0) {
      throw new CapabilityClientError(
        "capabilities must be a non-empty array of capability IDs",
        { code: "INVALID_ARGUMENT" },
      );
    }

    const sorted = [...capabilities].sort();
    const cacheKey = `compatible:${sorted.join(",")}`;

    const cached = this.#cache.get(cacheKey);
    if (cached) return cached;

    const caps = sorted.join(",");
    const data = await this.#get(
      `/v1/skills/compatible?caps=${encodeURIComponent(caps)}`,
    );
    this.#cache.set(cacheKey, data, CACHE_TTL_MS);
    return data;
  }

  /**
   * Convenience: fetch everything needed at session start in one logical call.
   * Runs platform detection + compatible skills fetch concurrently where possible.
   *
   * @param {string} [platform] - Override platform detection
   * @returns {Promise<{ platform: string, profile: object, skills: object[] }>}
   */
  async getSessionStartData(platform) {
    const pid = platform ?? this.detectPlatform();

    // Fetch profile; use supported caps to filter skills
    const profile = await this.getPlatformCapabilities(pid);
    const supported = profile.capabilities?.supported ?? [];

    // If no supported caps known, return all zero-requirement skills
    const skills = await this.getCompatibleSkills(
      supported.length > 0 ? supported : ["network.http"],
    );

    return { platform: pid, profile, skills };
  }

  // ─── Internal ───────────────────────────────────────────────────────────────

  async #get(path) {
    const url = `${this.#workerUrl}${path}`;
    let response;

    try {
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), this.#timeoutMs);

      try {
        response = await fetch(url, {
          method: "GET",
          headers: {
            Authorization: `Bearer ${this.#token}`,
            Accept: "application/json",
          },
          signal: controller.signal,
        });
      } finally {
        clearTimeout(timer);
      }
    } catch (err) {
      if (err.name === "AbortError") {
        throw new CapabilityClientError(
          `Request to ${path} timed out after ${this.#timeoutMs}ms`,
          { code: "TIMEOUT" },
        );
      }
      throw new CapabilityClientError(
        `Network error fetching ${path}: ${err.message}`,
        { code: "NETWORK_ERROR" },
      );
    }

    if (!response.ok) {
      let errorBody;
      try {
        errorBody = await response.json();
      } catch {
        errorBody = null;
      }
      throw new CapabilityClientError(
        errorBody?.error?.message ??
          `Request failed with status ${response.status}`,
        {
          code: errorBody?.error?.code ?? "HTTP_ERROR",
          status: response.status,
          hint: errorBody?.error?.hint ?? null,
        },
      );
    }

    try {
      return await response.json();
    } catch {
      throw new CapabilityClientError(
        `Response from ${path} contained invalid JSON`,
        { code: "PARSE_ERROR", status: response.status },
      );
    }
  }
}
