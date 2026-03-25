import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
  statSync,
} from 'node:fs';
import { join, resolve, dirname } from 'node:path';
import { tmpdir } from 'node:os';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import crypto from 'node:crypto';

const __dirname = dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = resolve(__dirname, '..', '..', '..');
const COMPILE_MJS = join(REPO_ROOT, 'scripts', 'build', 'compile.mjs');

const ROOT_CLAUDE = join(REPO_ROOT, 'CLAUDE.md');
const ROOT_VERSION = join(REPO_ROOT, 'VERSION');
const CODEX_AGENTS = join(REPO_ROOT, 'dist', 'clients', 'codex', 'AGENTS.md');
const CLAUDE_PLUGIN = join(REPO_ROOT, 'dist', 'clients', 'claude-code', '.claude-plugin', 'plugin.json');

function runCompile() {
  const result = spawnSync(process.execPath, [COMPILE_MJS], {
    cwd: REPO_ROOT,
    encoding: 'utf8',
  });
  assert.equal(result.status, 0, `compile failed:\n${result.stdout}\n${result.stderr}`);
}

function sha256(filePath) {
  const buf = readFileSync(filePath);
  return crypto.createHash('sha256').update(buf).digest('hex');
}

function readArtifacts() {
  const claude = readFileSync(ROOT_CLAUDE, 'utf8');
  const version = readFileSync(ROOT_VERSION, 'utf8').trim();
  const agents = readFileSync(CODEX_AGENTS, 'utf8');
  const plugin = JSON.parse(readFileSync(CLAUDE_PLUGIN, 'utf8'));
  return { claude, version, agents, plugin };
}

function getSizeWarnings(files, thresholdBytes) {
  return files
    .map((file) => ({ file, size: statSync(file).size }))
    .filter(({ size }) => size > thresholdBytes)
    .map(({ file, size }) => `[warn] ${file} is ${size} bytes (> ${thresholdBytes})`);
}


function gitChangedFiles(files) {
  const result = spawnSync('git', ['diff', '--name-only', '--', ...files], {
    cwd: REPO_ROOT,
    encoding: 'utf8',
  });
  assert.equal(result.status, 0, `git diff failed:\n${result.stderr}`);
  return result.stdout
    .split('\n')
    .map((line) => line.trim())
    .filter(Boolean);
}

// Build once up-front for this suite; individual tests only recompile when required.
runCompile();

test('generation sync (root files stale check)', () => {
  const trackedEntrypoints = ['CLAUDE.md', 'dist/clients/codex/AGENTS.md', 'dist/clients/claude-code/.claude-plugin/plugin.json'];

  runCompile();
  const changed = gitChangedFiles(trackedEntrypoints);

  assert.deepEqual(changed, [], 'generator run should not leave stale tracked entrypoints');

  const { claude, version, agents, plugin } = readArtifacts();
  assert.match(claude, /^# AI Config OS/m);
  assert.match(agents, /^# AI Config OS — Codex Agent Instructions/m);

  const agentsVersion = agents.match(/^# Version: (.+)$/m)?.[1]?.trim();
  assert.equal(plugin.version, version, 'claude plugin version must be in sync with VERSION');
  assert.equal(agentsVersion, version, 'codex AGENTS version header must be in sync with VERSION');
});

test('deterministic output (run generator twice, assert byte-identical)', () => {
  runCompile();
  const first = {
    agents: sha256(CODEX_AGENTS),
    plugin: sha256(CLAUDE_PLUGIN),
  };

  runCompile();
  const second = {
    agents: sha256(CODEX_AGENTS),
    plugin: sha256(CLAUDE_PLUGIN),
  };

  assert.deepEqual(second, first, 'compile output should be byte-identical across consecutive runs');
});

test('composition (base doctrine appears in both surfaces where expected)', () => {
  const { claude, agents } = readArtifacts();

  const doctrineAnchors = ['KISS', 'TDD'];
  for (const phrase of doctrineAnchors) {
    assert.ok(claude.includes(phrase), `CLAUDE.md should include doctrine anchor: ${phrase}`);
    assert.ok(agents.includes(phrase), `AGENTS.md should include doctrine anchor: ${phrase}`);
  }

  assert.deepEqual(doctrineAnchors, ['KISS', 'TDD']); // small snapshot
});

test('separation (ai-config-os local rules absent from base-only external materialisation)', () => {
  const { claude, agents } = readArtifacts();

  const localOnlyMarker = '## Workflow - Local Proxy Environment';
  assert.ok(claude.includes(localOnlyMarker), 'CLAUDE.md should retain repo-local operational guidance');
  assert.equal(agents.includes(localOnlyMarker), false, 'AGENTS.md should not include repo-local operational guidance');
});

test('materialisation fixture (writes valid CLAUDE.md and AGENTS.md into temp target repo)', () => {
  const { claude, agents, version } = readArtifacts();
  const tmpRepo = mkdtempSync(join(tmpdir(), 'entrypoint-materialisation-'));

  try {
    const targetClaude = join(tmpRepo, 'CLAUDE.md');
    const targetAgents = join(tmpRepo, 'AGENTS.md');

    writeFileSync(targetClaude, claude, 'utf8');
    writeFileSync(targetAgents, agents, 'utf8');

    const writtenClaude = readFileSync(targetClaude, 'utf8');
    const writtenAgents = readFileSync(targetAgents, 'utf8');

    assert.match(writtenClaude, /^# AI Config OS/m);
    assert.match(writtenAgents, /^# AI Config OS — Codex Agent Instructions/m);
    assert.ok(writtenAgents.includes(`# Version: ${version}`), 'AGENTS.md should carry the expected version header');
    assert.match(writtenAgents, /^# Skills: \d+/m);
  } finally {
    rmSync(tmpRepo, { recursive: true, force: true });
  }
});

test('size sanity warning (non-failing warning threshold for oversized root entrypoints)', () => {
  const warnings = getSizeWarnings([ROOT_CLAUDE, CODEX_AGENTS], 1_024);

  assert.ok(Array.isArray(warnings));
  assert.ok(warnings.length >= 1, 'low threshold should emit at least one warning');
  assert.equal(warnings.every((warning) => warning.startsWith('[warn] ')), true);
});
