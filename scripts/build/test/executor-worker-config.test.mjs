import { test } from 'node:test';
import assert from 'node:assert/strict';
import * as TOML from '@iarna/toml';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(__dirname, '../../..');
const executorWranglerPath = path.join(repoRoot, 'worker/executor/wrangler.toml');

/**
 * Test suite for executor Worker configuration
 *
 * Verifies that worker/executor/ is configured correctly for deployment
 */

test('executor Worker: wrangler.toml exists', () => {
  assert.ok(fs.existsSync(executorWranglerPath), 'worker/executor/wrangler.toml must exist');
});

test('executor Worker: wrangler.toml is valid TOML', () => {
  const content = fs.readFileSync(executorWranglerPath, 'utf8');
  const parsed = TOML.parse(content);

  assert.ok(parsed, 'Must parse as valid TOML');
  assert.equal(typeof parsed, 'object', 'Parsed config must be an object');
});

test('executor Worker: wrangler.toml has required fields', () => {
  const content = fs.readFileSync(executorWranglerPath, 'utf8');
  const config = TOML.parse(content);

  assert.equal(config.name, 'ai-config-os-executor', 'name must be ai-config-os-executor');
  assert.equal(config.main, 'src/index.ts', 'main must be src/index.ts');
  assert.ok(config.compatibility_date, 'compatibility_date must be set');
});

test('executor Worker: wrangler.toml has KV binding for MANIFEST_KV', () => {
  const content = fs.readFileSync(executorWranglerPath, 'utf8');
  const config = TOML.parse(content);

  const kvBindings = config.kv_namespaces || [];
  const manifestKv = kvBindings.find(b => b.binding === 'MANIFEST_KV');

  assert.ok(manifestKv, 'Must have MANIFEST_KV binding');
  assert.ok(manifestKv.id, 'MANIFEST_KV binding must have an id (can be placeholder)');
});

test('executor Worker: wrangler.toml has R2 binding for ARTEFACTS_R2', () => {
  const content = fs.readFileSync(executorWranglerPath, 'utf8');
  const config = TOML.parse(content);

  const r2Bindings = config.r2_buckets || [];
  const artefactsR2 = r2Bindings.find(b => b.binding === 'ARTEFACTS_R2');

  assert.ok(artefactsR2, 'Must have ARTEFACTS_R2 binding');
  assert.ok(artefactsR2.bucket_name, 'ARTEFACTS_R2 binding must have a bucket_name');
});

test('executor Worker: wrangler.toml has staging environment config', () => {
  const content = fs.readFileSync(executorWranglerPath, 'utf8');
  const config = TOML.parse(content);

  assert.ok(config.env, 'Must have env section');
  assert.ok(config.env.staging, 'Must have staging environment');
  assert.ok(config.env.staging.vars, 'Staging must have vars');
  assert.equal(config.env.staging.vars.ENVIRONMENT, 'staging', 'Staging ENVIRONMENT must be "staging"');
});

test('executor Worker: package.json exists', () => {
  const packagePath = path.join(repoRoot, 'worker/executor/package.json');
  assert.ok(fs.existsSync(packagePath), 'worker/executor/package.json must exist');
});

test('executor Worker: package.json is valid JSON', () => {
  const packagePath = path.join(repoRoot, 'worker/executor/package.json');
  const content = fs.readFileSync(packagePath, 'utf8');
  const pkg = JSON.parse(content);

  assert.equal(pkg.name, 'ai-config-os-executor', 'package.json name must match');
  assert.ok(pkg.version, 'package.json must have version');
});

test('executor Worker: tsconfig.json exists and is valid', () => {
  const tsconfigPath = path.join(repoRoot, 'worker/executor/tsconfig.json');
  assert.ok(fs.existsSync(tsconfigPath), 'worker/executor/tsconfig.json must exist');

  const content = fs.readFileSync(tsconfigPath, 'utf8');
  const tsconfig = JSON.parse(content);

  assert.ok(tsconfig.extends, 'tsconfig must extend base config');
  assert.ok(tsconfig.compilerOptions, 'tsconfig must have compilerOptions');
});

test('executor Worker: source files exist', () => {
  const srcPath = path.join(repoRoot, 'worker/executor/src');
  assert.ok(fs.existsSync(srcPath), 'worker/executor/src directory must exist');

  const files = ['index.ts', 'handler.ts', 'phase1-tools.ts'];
  for (const file of files) {
    const filePath = path.join(srcPath, file);
    assert.ok(fs.existsSync(filePath), `${file} must exist in src/`);
  }
});

test('executor Worker: README.md exists and documents Phase 1', () => {
  const readmePath = path.join(repoRoot, 'worker/executor/README.md');
  assert.ok(fs.existsSync(readmePath), 'worker/executor/README.md must exist');

  const content = fs.readFileSync(readmePath, 'utf8');
  assert.match(content, /Phase 1/, 'README must mention Phase 1');
  assert.match(content, /health_check/, 'README must document health_check tool');
  assert.match(content, /not.*support|NOT.*support|unavailable/i, 'README must document what is not supported');
});
