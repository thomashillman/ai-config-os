import test from 'node:test';
import assert from 'node:assert/strict';
import { writeFileSync, mkdtempSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';

import { readManifestYaml, loadManifestFlags, getManifestFlags, _resetCache } from './manifest-flags.mjs';

const VALID_MANIFEST = `# ai-config-os runtime manifest
created_at: "2026-03-11T21:29:35Z"
last_synced: null
device: "(none)"
tools: {}
feature_flags:
  outcome_resolution_enabled: false
  effective_contract_required: false
  remote_executor_enabled: false
`;

// --- readManifestYaml (pure YAML parser) ---

test('readManifestYaml: returns empty object for empty string', () => {
  assert.deepEqual(readManifestYaml(''), {});
});

test('readManifestYaml: parses feature_flags block with all-false values', () => {
  const result = readManifestYaml(VALID_MANIFEST);
  assert.deepEqual(result, {
    outcome_resolution_enabled: false,
    effective_contract_required: false,
    remote_executor_enabled: false,
  });
});

test('readManifestYaml: reads true values correctly', () => {
  const yaml = `feature_flags:\n  remote_executor_enabled: true\n  outcome_resolution_enabled: false\n  effective_contract_required: false\n`;
  const result = readManifestYaml(yaml);
  assert.equal(result.remote_executor_enabled, true);
  assert.equal(result.outcome_resolution_enabled, false);
});

test('readManifestYaml: stops reading at next top-level key', () => {
  const yaml = `feature_flags:\n  outcome_resolution_enabled: true\ntools: {}\n`;
  const result = readManifestYaml(yaml);
  assert.equal(result.outcome_resolution_enabled, true);
  assert.ok(!('tools' in result), 'should not include top-level keys as flags');
});

test('readManifestYaml: returns empty object when feature_flags block is absent', () => {
  const yaml = `created_at: "2026-01-01"\ntools: {}\n`;
  assert.deepEqual(readManifestYaml(yaml), {});
});

// --- loadManifestFlags (file reader, uncached) ---

test('loadManifestFlags: returns all-false defaults when manifest file is missing', () => {
  const flags = loadManifestFlags('/nonexistent/path/no-such-file.yaml');
  assert.deepEqual(flags, {
    outcome_resolution_enabled: false,
    effective_contract_required: false,
    remote_executor_enabled: false,
  });
});

test('loadManifestFlags: reads outcome_resolution_enabled=true from file', () => {
  const dir = mkdtempSync(join(tmpdir(), 'manifest-flags-test-'));
  try {
    const manifestPath = join(dir, 'manifest.yaml');
    writeFileSync(manifestPath, `feature_flags:\n  outcome_resolution_enabled: true\n  effective_contract_required: false\n  remote_executor_enabled: false\n`);
    const flags = loadManifestFlags(manifestPath);
    assert.equal(flags.outcome_resolution_enabled, true);
    assert.equal(flags.effective_contract_required, false);
    assert.equal(flags.remote_executor_enabled, false);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('loadManifestFlags: reads effective_contract_required=true from file', () => {
  const dir = mkdtempSync(join(tmpdir(), 'manifest-flags-test-'));
  try {
    const manifestPath = join(dir, 'manifest.yaml');
    writeFileSync(manifestPath, `feature_flags:\n  outcome_resolution_enabled: false\n  effective_contract_required: true\n  remote_executor_enabled: false\n`);
    const flags = loadManifestFlags(manifestPath);
    assert.equal(flags.effective_contract_required, true);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('loadManifestFlags: reads remote_executor_enabled=true from file', () => {
  const dir = mkdtempSync(join(tmpdir(), 'manifest-flags-test-'));
  try {
    const manifestPath = join(dir, 'manifest.yaml');
    writeFileSync(manifestPath, `feature_flags:\n  outcome_resolution_enabled: false\n  effective_contract_required: false\n  remote_executor_enabled: true\n`);
    const flags = loadManifestFlags(manifestPath);
    assert.equal(flags.remote_executor_enabled, true);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('loadManifestFlags: returns safe defaults when feature_flags block is absent from file', () => {
  const dir = mkdtempSync(join(tmpdir(), 'manifest-flags-test-'));
  try {
    const manifestPath = join(dir, 'manifest.yaml');
    writeFileSync(manifestPath, `created_at: "2026-01-01"\ntools: {}\n`);
    const flags = loadManifestFlags(manifestPath);
    assert.deepEqual(flags, {
      outcome_resolution_enabled: false,
      effective_contract_required: false,
      remote_executor_enabled: false,
    });
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

// --- getManifestFlags (cached wrapper) ---

test('getManifestFlags: caches result — second call returns same object reference', () => {
  _resetCache();
  const dir = mkdtempSync(join(tmpdir(), 'manifest-flags-test-'));
  try {
    const manifestPath = join(dir, 'manifest.yaml');
    writeFileSync(manifestPath, `feature_flags:\n  outcome_resolution_enabled: false\n  effective_contract_required: false\n  remote_executor_enabled: false\n`);
    const first = getManifestFlags(manifestPath);
    const second = getManifestFlags(manifestPath);
    assert.equal(first, second, 'cached result must be the same object reference');
  } finally {
    _resetCache();
    rmSync(dir, { recursive: true, force: true });
  }
});
