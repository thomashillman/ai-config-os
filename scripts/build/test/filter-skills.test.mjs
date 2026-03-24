/**
 * filter-skills.test.mjs — Unit + integration tests for the skill classifier.
 *
 * Tests cover:
 *  - classifySkill: all four bucket conditions
 *  - classifyAll: null probe, mixed skill set
 *  - loadProbeResults: missing file, error-status caps
 *  - loadManifest: missing file
 *  - filterSkills: end-to-end with temp files
 *  - formatSummary: correct counts
 */

import { describe, test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, writeFileSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { fileURLToPath } from 'node:url';
import { resolve, dirname } from 'node:path';
import { pathToFileURL } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const REPO_ROOT  = resolve(__dirname, '../../..');
const MODULE_PATH = join(REPO_ROOT, 'adapters', 'claude', 'filter-skills.mjs');

// Import module under test — use pathToFileURL for Windows compatibility
// (bare path strings with drive letters fail on Windows in import())
const {
  classifySkill,
  classifyAll,
  loadProbeResults,
  loadManifest,
  resolveRegistryPlatformHint,
  filterSkills,
  formatSummary,
  formatText,
} = await import(pathToFileURL(MODULE_PATH).href);

// ─── Fixtures ─────────────────────────────────────────────────────────────────

const ALL_SUPPORTED = new Set(['fs.read', 'fs.write', 'shell.exec', 'git.read', 'git.write', 'env.read', 'network.http']);

function makeSkill(overrides = {}) {
  return {
    id:          overrides.id          ?? 'test-skill',
    description: overrides.description ?? 'A test skill',
    type:        overrides.type        ?? 'prompt',
    status:      overrides.status      ?? 'stable',
    capabilities: {
      required:      overrides.required      ?? [],
      optional:      overrides.optional      ?? [],
      fallback_mode: overrides.fallback_mode ?? null,
      ...overrides.caps,
    },
  };
}

// ─── classifySkill ────────────────────────────────────────────────────────────

describe('classifySkill — bucket assignment', () => {
  test('all required + all optional supported → available / native', () => {
    const skill = makeSkill({ required: ['fs.read'], optional: ['shell.exec'] });
    const result = classifySkill(skill, ALL_SUPPORTED);
    assert.equal(result.bucket, 'available');
    assert.equal(result.mode,   'native');
    assert.deepEqual(result.missingRequired, []);
    assert.deepEqual(result.missingOptional, []);
  });

  test('required met, optional missing → degraded', () => {
    const skill = makeSkill({ required: ['fs.read'], optional: ['mcp.client'] });
    const result = classifySkill(skill, ALL_SUPPORTED); // mcp.client not in ALL_SUPPORTED
    assert.equal(result.bucket, 'degraded');
    assert.equal(result.mode,   'degraded');
    assert.deepEqual(result.missingOptional, ['mcp.client']);
    assert.deepEqual(result.missingRequired, []);
  });

  test('required missing, fallback_mode present → excluded', () => {
    const skill = makeSkill({ required: ['mcp.client'], fallback_mode: 'prompt-only' });
    const result = classifySkill(skill, ALL_SUPPORTED);
    assert.equal(result.bucket, 'excluded');
    assert.equal(result.mode,   'prompt-only');
    assert.ok(result.missingRequired.includes('mcp.client'));
  });

  test('required missing, no fallback → unavailable', () => {
    const skill = makeSkill({ required: ['mcp.client'], fallback_mode: null });
    const result = classifySkill(skill, ALL_SUPPORTED);
    assert.equal(result.bucket, 'unavailable');
    assert.equal(result.mode,   'none');
    assert.ok(result.missingRequired.includes('mcp.client'));
  });

  test('empty required array → available (skill has no requirements)', () => {
    const skill = makeSkill({ required: [], optional: [] });
    const result = classifySkill(skill, ALL_SUPPORTED);
    assert.equal(result.bucket, 'available');
  });

  test('missing capabilities block → treated as no requirements (available)', () => {
    const skill = { id: 'bare', description: 'no caps', type: 'prompt', status: 'stable' };
    const result = classifySkill(skill, ALL_SUPPORTED);
    assert.equal(result.bucket, 'available');
  });
});

// ─── classifyAll ─────────────────────────────────────────────────────────────

describe('classifyAll — bulk classification', () => {
  test('null supported → all skills marked available', () => {
    const skills = [
      makeSkill({ id: 'a', required: ['mcp.client'] }),
      makeSkill({ id: 'b', required: ['git.read'] }),
    ];
    const results = classifyAll(skills, null);
    assert.equal(results.length, 2);
    assert.ok(results.every(r => r.bucket === 'available'));
  });

  test('mixed skill set → correct bucket distribution', () => {
    const skills = [
      makeSkill({ id: 'fully-supported',   required: ['fs.read'],    optional: ['git.read'] }),
      makeSkill({ id: 'optional-missing',  required: ['fs.read'],    optional: ['mcp.client'] }),
      makeSkill({ id: 'excluded-fallback', required: ['mcp.client'], fallback_mode: 'prompt-only' }),
      makeSkill({ id: 'unavailable',       required: ['mcp.client'], fallback_mode: null }),
    ];
    const results = classifyAll(skills, ALL_SUPPORTED);
    const byId = Object.fromEntries(results.map(r => [r.id, r]));

    assert.equal(byId['fully-supported'].bucket,  'available');
    assert.equal(byId['optional-missing'].bucket,  'degraded');
    assert.equal(byId['excluded-fallback'].bucket, 'excluded');
    assert.equal(byId['unavailable'].bucket,       'unavailable');
  });

  test('classifyAll returns one entry per input skill', () => {
    const skills = [makeSkill({ id: 'x' }), makeSkill({ id: 'y' }), makeSkill({ id: 'z' })];
    assert.equal(classifyAll(skills, ALL_SUPPORTED).length, 3);
  });
});

// ─── loadProbeResults ─────────────────────────────────────────────────────────

describe('loadProbeResults — edge cases', () => {
  test('missing probe file → supported is null + warning', () => {
    const result = loadProbeResults('/nonexistent/path/probe.json');
    assert.equal(result.supported, null);
    assert.ok(result.warning, 'should include a warning message');
  });

  test('probe with error-status cap → treated as unsupported', () => {
    const dir = mkdtempSync(join(tmpdir(), 'filter-skills-test-'));
    const probeFile = join(dir, 'probe.json');
    try {
      writeFileSync(probeFile, JSON.stringify({
        probe_version: '1.0.0',
        platform_hint: 'test',
        surface_hint:  'test',
        hostname:      'test-host',
        results: {
          'fs.read':    { status: 'supported' },
          'shell.exec': { status: 'error',       error: 'timeout' },
          'mcp.client': { status: 'unsupported' },
        },
      }));

      const result = loadProbeResults(probeFile);
      assert.ok(result.supported.has('fs.read'));
      assert.ok(!result.supported.has('shell.exec'), 'error status must be treated as unsupported');
      assert.ok(!result.supported.has('mcp.client'));
      assert.equal(result.warning, null);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  test('capability absent from probe results → treated as unsupported', () => {
    const dir = mkdtempSync(join(tmpdir(), 'filter-skills-test-'));
    const probeFile = join(dir, 'probe.json');
    try {
      writeFileSync(probeFile, JSON.stringify({
        probe_version: '1.0.0',
        platform_hint: 'test',
        surface_hint:  'test',
        hostname:      'test-host',
        results: { 'fs.read': { status: 'supported' } },
      }));

      const result = loadProbeResults(probeFile);
      assert.ok(result.supported.has('fs.read'));
      assert.ok(!result.supported.has('git.read'), 'absent cap must be treated as unsupported');
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  test('surface_hint and platform_hint preserved from probe', () => {
    const dir = mkdtempSync(join(tmpdir(), 'filter-skills-test-'));
    const probeFile = join(dir, 'probe.json');
    try {
      writeFileSync(probeFile, JSON.stringify({
        probe_version: '1.0.0',
        platform_hint: 'github-actions',
        surface_hint:  'ci-pipeline',
        hostname:      'runner',
        results: {},
      }));

      const result = loadProbeResults(probeFile);
      assert.equal(result.platform_hint, 'github-actions');
      assert.equal(result.surface_hint,  'ci-pipeline');
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  test('claude-ssh probe remains useful for classification, not just detection', () => {
    const dir = mkdtempSync(join(tmpdir(), 'filter-skills-test-'));
    const probeFile = join(dir, 'probe.json');
    try {
      writeFileSync(probeFile, JSON.stringify({
        probe_version: '1.0.0',
        platform_hint: 'claude-ssh',
        surface_hint:  'remote-shell',
        hostname:      'ssh-host',
        results: {
          'fs.read':    { status: 'supported' },
          'shell.exec': { status: 'supported' },
          'git.read':   { status: 'supported' },
        },
      }));

      const result = loadProbeResults(probeFile);
      assert.equal(result.platform_hint, 'claude-ssh');
      assert.equal(result.surface_hint, 'remote-shell');
      assert.ok(result.supported.has('shell.exec'));
      assert.ok(result.supported.has('git.read'));
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });
});

// ─── loadManifest ─────────────────────────────────────────────────────────────

describe('loadManifest — edge cases', () => {
  test('missing manifest file → empty skills + warning', () => {
    const result = loadManifest('/nonexistent/path/manifest.json');
    assert.deepEqual(result.skills, []);
    assert.ok(result.warning, 'should include a warning message');
  });

  test('valid manifest → skills array returned', () => {
    const dir = mkdtempSync(join(tmpdir(), 'filter-skills-test-'));
    const manifestFile = join(dir, 'manifest.json');
    try {
      writeFileSync(manifestFile, JSON.stringify({
        version: '0.5.4',
        skills: [
          makeSkill({ id: 'skill-a' }),
          makeSkill({ id: 'skill-b' }),
        ],
      }));

      const result = loadManifest(manifestFile);
      assert.equal(result.skills.length, 2);
      assert.equal(result.version, '0.5.4');
      assert.equal(result.warning, null);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });
});

// ─── resolveRegistryPlatformHint ─────────────────────────────────────────────

describe('resolveRegistryPlatformHint', () => {
  test('returns the probe platform when manifest already knows claude-ssh', () => {
    const result = resolveRegistryPlatformHint('claude-ssh', {
      platforms: ['claude-code', 'claude-ssh'],
      platform_definitions: {},
      skills: [],
    });

    assert.equal(result.registry_platform_hint, 'claude-ssh');
    assert.equal(result.warning, null);
  });

  test('normalises claude-code-remote to claude-code for registry compatibility', () => {
    const result = resolveRegistryPlatformHint('claude-code-remote', {
      platforms: ['claude-code', 'claude-ios'],
      platform_definitions: {},
      skills: [],
    });

    assert.equal(result.registry_platform_hint, 'claude-code');
    assert.equal(result.warning, null);
  });

  test('warns when probe platform is unknown to the manifest registry', () => {
    const result = resolveRegistryPlatformHint('mystery-shell', {
      platforms: ['claude-code'],
      platform_definitions: {},
      skills: [],
    });

    assert.equal(result.registry_platform_hint, 'unknown');
    assert.match(result.warning, /mystery-shell/);
  });
});

// ─── filterSkills end-to-end ──────────────────────────────────────────────────

describe('filterSkills — end-to-end with temp files', () => {
  test('probe missing → all skills available + warning', () => {
    const dir = mkdtempSync(join(tmpdir(), 'filter-skills-test-'));
    const manifestFile = join(dir, 'manifest.json');
    try {
      writeFileSync(manifestFile, JSON.stringify({
        version: '0.5.4',
        skills: [
          makeSkill({ id: 'needs-shell', required: ['shell.exec'] }),
          makeSkill({ id: 'needs-mcp',   required: ['mcp.client'] }),
        ],
      }));

      const result = filterSkills({
        probePath:    join(dir, 'nonexistent-probe.json'),
        manifestPath: manifestFile,
      });

      assert.ok(result.warning, 'should have a warning about missing probe');
      assert.equal(result.available.length, 2, 'all skills should be available when probe is missing');
      assert.equal(result.degraded.length,   0);
      assert.equal(result.excluded.length,   0);
      assert.equal(result.unavailable.length, 0);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  test('manifest missing → empty result + warning', () => {
    const dir = mkdtempSync(join(tmpdir(), 'filter-skills-test-'));
    const probeFile = join(dir, 'probe.json');
    try {
      writeFileSync(probeFile, JSON.stringify({
        probe_version: '1.0.0',
        platform_hint: 'claude-code',
        surface_hint:  'desktop-cli',
        hostname:      'host',
        results: { 'fs.read': { status: 'supported' } },
      }));

      const result = filterSkills({
        probePath:    probeFile,
        manifestPath: join(dir, 'nonexistent-manifest.json'),
      });

      assert.ok(result.warning, 'should have a warning about missing manifest');
      assert.equal(result.available.length,   0);
      assert.equal(result.degraded.length,    0);
      assert.equal(result.excluded.length,    0);
      assert.equal(result.unavailable.length, 0);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  test('full flow: probe + manifest → correct bucket counts', () => {
    const dir = mkdtempSync(join(tmpdir(), 'filter-skills-test-'));
    const probeFile    = join(dir, 'probe.json');
    const manifestFile = join(dir, 'manifest.json');
    try {
      writeFileSync(probeFile, JSON.stringify({
        probe_version: '1.0.0',
        platform_hint: 'claude-code',
        surface_hint:  'desktop-cli',
        hostname:      'host',
        results: {
          'fs.read':    { status: 'supported' },
          'git.read':   { status: 'supported' },
          'shell.exec': { status: 'supported' },
        },
      }));

      writeFileSync(manifestFile, JSON.stringify({
        version: '0.5.4',
        skills: [
          makeSkill({ id: 'a-available',  required: ['fs.read'],    optional: ['git.read'] }),
          makeSkill({ id: 'b-degraded',   required: ['fs.read'],    optional: ['mcp.client'] }),
          makeSkill({ id: 'c-excluded',   required: ['mcp.client'], fallback_mode: 'prompt-only' }),
          makeSkill({ id: 'd-unavailable',required: ['mcp.client'], fallback_mode: null }),
          makeSkill({ id: 'e-available2', required: [] }),
        ],
      }));

      const result = filterSkills({ probePath: probeFile, manifestPath: manifestFile });

      assert.equal(result.available.length,   2, 'should have 2 available');
      assert.equal(result.degraded.length,    1, 'should have 1 degraded');
      assert.equal(result.excluded.length,    1, 'should have 1 excluded');
      assert.equal(result.unavailable.length, 1, 'should have 1 unavailable');
      assert.equal(result.warning, null);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  test('claude-ssh probe does not crash or downgrade everything when platform is recognised', () => {
    const dir = mkdtempSync(join(tmpdir(), 'filter-skills-test-'));
    const probeFile    = join(dir, 'probe.json');
    const manifestFile = join(dir, 'manifest.json');
    try {
      writeFileSync(probeFile, JSON.stringify({
        probe_version: '1.0.0',
        platform_hint: 'claude-ssh',
        surface_hint:  'remote-shell',
        hostname:      'ssh-host',
        results: {
          'fs.read':    { status: 'supported' },
          'shell.exec': { status: 'supported' },
          'git.read':   { status: 'supported' },
        },
      }));

      writeFileSync(manifestFile, JSON.stringify({
        version: '0.5.4',
        platforms: ['claude-code', 'claude-ssh'],
        skills: [
          makeSkill({ id: 'ssh-native', required: ['shell.exec', 'git.read'] }),
          makeSkill({ id: 'ssh-degraded', required: ['fs.read'], optional: ['mcp.client'] }),
          makeSkill({ id: 'ssh-fallback', required: ['mcp.client'], fallback_mode: 'prompt-only' }),
        ],
      }));

      const result = filterSkills({ probePath: probeFile, manifestPath: manifestFile });
      assert.equal(result.platform_hint, 'claude-ssh');
      assert.equal(result.registry_platform_hint, 'claude-ssh');
      assert.equal(result.surface_hint, 'remote-shell');
      assert.deepEqual(result.available.map(skill => skill.id), ['ssh-native']);
      assert.deepEqual(result.degraded.map(skill => skill.id), ['ssh-degraded']);
      assert.deepEqual(result.excluded.map(skill => skill.id), ['ssh-fallback']);
      assert.deepEqual(result.unavailable, []);
      assert.equal(result.warning, null);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  test('claude-code-remote is normalised through the filtering path instead of treated as unknown', () => {
    const dir = mkdtempSync(join(tmpdir(), 'filter-skills-test-'));
    const probeFile    = join(dir, 'probe.json');
    const manifestFile = join(dir, 'manifest.json');
    try {
      writeFileSync(probeFile, JSON.stringify({
        probe_version: '1.0.0',
        platform_hint: 'claude-code-remote',
        surface_hint:  'desktop-cli',
        hostname:      'remote-host',
        results: {
          'shell.exec': { status: 'supported' },
        },
      }));

      writeFileSync(manifestFile, JSON.stringify({
        version: '0.5.4',
        platforms: ['claude-code'],
        skills: [
          makeSkill({ id: 'remote-shell', required: ['shell.exec'] }),
        ],
      }));

      const result = filterSkills({ probePath: probeFile, manifestPath: manifestFile });
      assert.equal(result.platform_hint, 'claude-code-remote');
      assert.equal(result.registry_platform_hint, 'claude-code');
      assert.equal(result.available.map(skill => skill.id)[0], 'remote-shell');
      assert.equal(result.warning, null);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  test('unknown probe platform warns instead of silently failing classification', () => {
    const dir = mkdtempSync(join(tmpdir(), 'filter-skills-test-'));
    const probeFile    = join(dir, 'probe.json');
    const manifestFile = join(dir, 'manifest.json');
    try {
      writeFileSync(probeFile, JSON.stringify({
        probe_version: '1.0.0',
        platform_hint: 'mystery-shell',
        surface_hint:  'remote-shell',
        hostname:      'mystery-host',
        results: {
          'shell.exec': { status: 'supported' },
        },
      }));

      writeFileSync(manifestFile, JSON.stringify({
        version: '0.5.4',
        platforms: ['claude-code'],
        skills: [
          makeSkill({ id: 'still-available', required: ['shell.exec'] }),
        ],
      }));

      const result = filterSkills({ probePath: probeFile, manifestPath: manifestFile });
      assert.equal(result.platform_hint, 'mystery-shell');
      assert.equal(result.registry_platform_hint, 'unknown');
      assert.equal(result.available.map(skill => skill.id)[0], 'still-available');
      assert.match(result.warning, /mystery-shell/);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });
});

// ─── formatSummary ────────────────────────────────────────────────────────────

describe('formatSummary', () => {
  test('all buckets populated → includes all counts', () => {
    const result = {
      available:   [1, 2, 3].map(i => makeSkill({ id: `a${i}` })),
      degraded:    [1].map(i => makeSkill({ id: `d${i}` })),
      excluded:    [1, 2].map(i => makeSkill({ id: `e${i}` })),
      unavailable: [1].map(i => makeSkill({ id: `u${i}` })),
    };
    const summary = formatSummary(result);
    assert.ok(summary.includes('3 available'),  `expected "3 available" in: ${summary}`);
    assert.ok(summary.includes('1 degraded'),   `expected "1 degraded" in: ${summary}`);
    assert.ok(summary.includes('2 excluded'),   `expected "2 excluded" in: ${summary}`);
    assert.ok(summary.includes('1 unavailable'),`expected "1 unavailable" in: ${summary}`);
  });

  test('empty buckets omitted from summary', () => {
    const result = {
      available:   [makeSkill({ id: 'x' })],
      degraded:    [],
      excluded:    [],
      unavailable: [],
    };
    const summary = formatSummary(result);
    assert.ok(summary.includes('1 available'));
    assert.ok(!summary.includes('degraded'),   'degraded should be omitted when empty');
    assert.ok(!summary.includes('excluded'),   'excluded should be omitted when empty');
    assert.ok(!summary.includes('unavailable'),'unavailable should be omitted when empty');
  });
});
