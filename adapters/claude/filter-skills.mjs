/**
 * filter-skills.mjs — Runtime skill classifier.
 *
 * Cross-references the capability probe report (~/.ai-config-os/probe-report.json)
 * against the skill manifest (~/.ai-config-os/cache/claude-code/latest.json) to
 * classify each skill into one of four buckets:
 *
 *   available   — all required + all optional caps supported
 *   degraded    — all required caps supported; ≥1 optional cap missing
 *   excluded    — required cap missing, but fallback_mode present
 *   unavailable — required cap missing; no fallback
 *
 * Zero dependencies beyond node:fs and node:path.
 * All functions are pure (no side effects) except loadProbeResults / loadManifest.
 */

import { readFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';

// ─── Default paths ────────────────────────────────────────────────────────────

const HOME = process.env.HOME || process.env.USERPROFILE || '/tmp';
const DEFAULT_PROBE_PATH    = join(HOME, '.ai-config-os', 'probe-report.json');
const DEFAULT_MANIFEST_PATH = join(HOME, '.ai-config-os', 'cache', 'claude-code', 'latest.json');

// ─── Types (JSDoc) ────────────────────────────────────────────────────────────

/**
 * @typedef {'available'|'degraded'|'excluded'|'unavailable'} Bucket
 *
 * @typedef {Object} ClassifiedSkill
 * @property {string}   id
 * @property {string}   description
 * @property {string}   type
 * @property {string}   status
 * @property {Bucket}   bucket
 * @property {string}   mode           — 'native' | 'degraded' | fallback_mode value | 'none'
 * @property {string[]} missingRequired
 * @property {string[]} missingOptional
 *
 * @typedef {Object} FilterResult
 * @property {ClassifiedSkill[]} available
 * @property {ClassifiedSkill[]} degraded
 * @property {ClassifiedSkill[]} excluded
 * @property {ClassifiedSkill[]} unavailable
 * @property {string|null}       warning
 * @property {string}            surface_hint
 * @property {string}            platform_hint
 */

// ─── Loaders ──────────────────────────────────────────────────────────────────

/**
 * Load and parse the capability probe report.
 * Returns { supported: Set<string>, surface_hint, platform_hint } or null + warning.
 *
 * Edge cases:
 *  - Missing file         → return null (caller treats all skills as available)
 *  - Cap status "error"   → treated as unsupported
 *  - Cap absent from JSON → treated as unsupported (conservative)
 */
export function loadProbeResults(probePath = DEFAULT_PROBE_PATH) {
  if (!existsSync(probePath)) {
    return {
      supported: null,
      surface_hint: 'unknown',
      platform_hint: 'unknown',
      warning: `Probe file not found: ${probePath}`,
    };
  }

  let data;
  try {
    data = JSON.parse(readFileSync(probePath, 'utf8'));
  } catch (err) {
    return {
      supported: null,
      surface_hint: 'unknown',
      platform_hint: 'unknown',
      warning: `Failed to parse probe file: ${err.message}`,
    };
  }

  const supported = new Set();
  const results = data.results || {};
  for (const [cap, entry] of Object.entries(results)) {
    if (entry && entry.status === 'supported') {
      supported.add(cap);
    }
    // 'error', 'unsupported', missing → not added (treated as unsupported)
  }

  return {
    supported,
    surface_hint:  data.surface_hint  || 'unknown',
    platform_hint: data.platform_hint || 'unknown',
    warning: null,
  };
}

/**
 * Load and parse the skill manifest (registry index.json from cache).
 * Returns { skills[], version } or { skills: [], warning }.
 */
export function loadManifest(manifestPath = DEFAULT_MANIFEST_PATH) {
  if (!existsSync(manifestPath)) {
    return {
      skills: [],
      version: null,
      warning: `Manifest not found: ${manifestPath}`,
    };
  }

  let data;
  try {
    data = JSON.parse(readFileSync(manifestPath, 'utf8'));
  } catch (err) {
    return {
      skills: [],
      version: null,
      warning: `Failed to parse manifest: ${err.message}`,
    };
  }

  return {
    skills:  data.skills  || [],
    version: data.version || null,
    warning: null,
  };
}

// ─── Classifier ───────────────────────────────────────────────────────────────

/**
 * Classify a single skill against the set of supported capabilities.
 *
 * @param {Object}      skill     — skill entry from manifest (registry index.json)
 * @param {Set<string>} supported — Set of supported capability IDs from probe
 * @returns {ClassifiedSkill}
 */
export function classifySkill(skill, supported) {
  const caps        = skill.capabilities || {};
  const required    = Array.isArray(caps.required) ? caps.required : [];
  const optional    = Array.isArray(caps.optional) ? caps.optional : [];
  const fallbackMode = caps.fallback_mode || null;

  const missingRequired = required.filter(c => !supported.has(c));
  const missingOptional = optional.filter(c => !supported.has(c));

  let bucket;
  let mode;

  if (missingRequired.length === 0) {
    if (missingOptional.length === 0) {
      bucket = 'available';
      mode   = 'native';
    } else {
      bucket = 'degraded';
      mode   = 'degraded';
    }
  } else {
    if (fallbackMode) {
      bucket = 'excluded';
      mode   = fallbackMode;
    } else {
      bucket = 'unavailable';
      mode   = 'none';
    }
  }

  return {
    id:              skill.id,
    description:     skill.description || '',
    type:            skill.type        || 'prompt',
    status:          skill.status      || 'stable',
    bucket,
    mode,
    missingRequired,
    missingOptional,
  };
}

/**
 * Classify all skills in the manifest.
 *
 * When supported is null (probe missing), all skills are returned as 'available'.
 *
 * @param {Object[]}    skills    — skill entries from manifest
 * @param {Set<string>|null} supported — from loadProbeResults; null = no probe data
 * @returns {ClassifiedSkill[]}
 */
export function classifyAll(skills, supported) {
  if (supported === null) {
    // No probe data — treat everything as available
    return skills.map(skill => ({
      id:              skill.id,
      description:     skill.description || '',
      type:            skill.type        || 'prompt',
      status:          skill.status      || 'stable',
      bucket:          'available',
      mode:            'native',
      missingRequired: [],
      missingOptional: [],
    }));
  }

  return skills.map(skill => classifySkill(skill, supported));
}

// ─── Formatters ───────────────────────────────────────────────────────────────

/**
 * Format classified skills as a grouped human-readable string.
 *
 * @param {FilterResult} result
 * @returns {string}
 */
export function formatText(result) {
  const { available, degraded, excluded, unavailable, surface_hint, platform_hint, warning } = result;
  const lines = [];

  if (warning) {
    lines.push(`[WARNING] ${warning}`);
    lines.push('');
  }

  lines.push(`Surface: ${surface_hint} (${platform_hint})`);
  lines.push('');

  if (available.length > 0) {
    lines.push(`AVAILABLE (${available.length})`);
    for (const s of available) {
      lines.push(`  • ${s.id} — ${s.description}`);
    }
    lines.push('');
  }

  if (degraded.length > 0) {
    lines.push(`DEGRADED — missing optional capabilities (${degraded.length})`);
    for (const s of degraded) {
      lines.push(`  • ${s.id} — ${s.description}`);
      lines.push(`    missing optional: ${s.missingOptional.join(', ')}`);
    }
    lines.push('');
  }

  if (excluded.length > 0) {
    lines.push(`EXCLUDED — fallback available (${excluded.length})`);
    for (const s of excluded) {
      lines.push(`  • ${s.id} — ${s.description}`);
      lines.push(`    missing: ${s.missingRequired.join(', ')} | fallback: ${s.mode}`);
    }
    lines.push('');
  }

  if (unavailable.length > 0) {
    lines.push(`UNAVAILABLE — required capabilities missing (${unavailable.length})`);
    for (const s of unavailable) {
      lines.push(`  • ${s.id} — missing: ${s.missingRequired.join(', ')}`);
    }
    lines.push('');
  }

  return lines.join('\n');
}

/**
 * Format a one-line summary of classified skills.
 *
 * @param {FilterResult} result
 * @returns {string}  e.g. "Skills: 18 available, 3 degraded, 4 excluded, 1 unavailable"
 */
export function formatSummary(result) {
  const { available, degraded, excluded, unavailable } = result;
  const parts = [];
  if (available.length  > 0) parts.push(`${available.length} available`);
  if (degraded.length   > 0) parts.push(`${degraded.length} degraded`);
  if (excluded.length   > 0) parts.push(`${excluded.length} excluded`);
  if (unavailable.length > 0) parts.push(`${unavailable.length} unavailable`);
  return `Skills: ${parts.join(', ')}`;
}

// ─── Main entry ───────────────────────────────────────────────────────────────

/**
 * Load probe + manifest, classify all skills, return a FilterResult.
 *
 * @param {Object} [opts]
 * @param {string} [opts.probePath]    — override probe JSON path
 * @param {string} [opts.manifestPath] — override manifest JSON path
 * @returns {FilterResult}
 */
export function filterSkills(opts = {}) {
  const { probePath, manifestPath } = opts;

  const probe    = loadProbeResults(probePath);
  const manifest = loadManifest(manifestPath);

  const warning = [probe.warning, manifest.warning].filter(Boolean).join('; ') || null;

  const classified = classifyAll(manifest.skills, probe.supported);

  const grouped = { available: [], degraded: [], excluded: [], unavailable: [] };
  for (const s of classified) {
    grouped[s.bucket].push(s);
  }

  return {
    ...grouped,
    warning,
    surface_hint:  probe.surface_hint,
    platform_hint: probe.platform_hint,
    version:       manifest.version,
  };
}
