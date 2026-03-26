import { describe, test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, readFileSync, rmSync, writeFileSync, existsSync, readdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';

const __dirname = dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = resolve(__dirname, '..', '..', '..');
const SCRIPT_PATH = join(REPO_ROOT, 'scripts', 'build', 'materialise-project-instructions.mjs');
const SAMPLE_OVERLAY = join(
  REPO_ROOT,
  'scripts',
  'build',
  'fixtures',
  'project-instructions',
  'sample-external-repo-overlay'
);
const DOCTRINE_BASE_DIR = join(REPO_ROOT, 'shared', 'agent-doctrine', 'base');

function run(args) {
  return spawnSync('node', [SCRIPT_PATH, ...args], {
    cwd: REPO_ROOT,
    encoding: 'utf8',
  });
}

function getFirstBaseHeading() {
  const baseFiles = readdirSync(DOCTRINE_BASE_DIR)
    .filter(name => name.endsWith('.md'))
    .sort((a, b) => (a < b ? -1 : a > b ? 1 : 0));
  const firstBase = readFileSync(join(DOCTRINE_BASE_DIR, baseFiles[0]), 'utf8');
  return firstBase.split('\n').find(line => line.startsWith('# '));
}

describe('materialise-project-instructions CLI', () => {
  test('writes CLAUDE.md and AGENTS.md using overlay directory', () => {
    const target = mkdtempSync(join(tmpdir(), 'proj-instructions-target-'));

    try {
      const result = run([target, '--overlay', SAMPLE_OVERLAY]);
      assert.equal(result.status, 0, result.stderr);

      const claude = readFileSync(join(target, 'CLAUDE.md'), 'utf8');
      const agents = readFileSync(join(target, 'AGENTS.md'), 'utf8');
      const firstBaseHeading = getFirstBaseHeading();

      assert.ok(firstBaseHeading, 'expected doctrine base to include a heading');
      assert.match(claude, new RegExp(`^${firstBaseHeading.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}`, 'm'));
      assert.match(claude, /## Surface Adapter: Claude/);
      assert.match(claude, /Sample Repo Overlay \(Claude\)/);

      assert.match(agents, new RegExp(`^${firstBaseHeading.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}`, 'm'));
      assert.match(agents, /## Surface Adapter: Codex/);
      assert.match(agents, /Sample Repo Overlay \(Codex\)/);
    } finally {
      rmSync(target, { recursive: true, force: true });
    }
  });

  test('supports dry-run without writing files', () => {
    const target = mkdtempSync(join(tmpdir(), 'proj-instructions-dry-run-'));

    try {
      const result = run([target, '--overlay', SAMPLE_OVERLAY, '--dry-run']);
      assert.equal(result.status, 0, result.stderr);
      assert.match(result.stdout, /\[dry-run\] would write/);
      assert.equal(existsSync(join(target, 'CLAUDE.md')), false);
      assert.equal(existsSync(join(target, 'AGENTS.md')), false);
    } finally {
      rmSync(target, { recursive: true, force: true });
    }
  });

  test('supports explicit overlay files and surface filters', () => {
    const target = mkdtempSync(join(tmpdir(), 'proj-instructions-filter-'));
    const baseFile = join(target, 'overlay-base.md');
    const codexFile = join(target, 'overlay-codex.md');

    try {
      writeFileSync(baseFile, '## explicit base overlay\n');
      writeFileSync(codexFile, '## explicit codex overlay\n');

      const result = run([
        target,
        '--codex-only',
        '--base-overlay-file',
        baseFile,
        '--codex-overlay-file',
        codexFile,
      ]);

      assert.equal(result.status, 0, result.stderr);
      assert.equal(existsSync(join(target, 'CLAUDE.md')), false);
      assert.equal(existsSync(join(target, 'AGENTS.md')), true);

      const agents = readFileSync(join(target, 'AGENTS.md'), 'utf8');
      assert.match(agents, /explicit base overlay/);
      assert.match(agents, /explicit codex overlay/);
    } finally {
      rmSync(target, { recursive: true, force: true });
    }
  });

  test('supports repeatable --overlay-file entries', () => {
    const target = mkdtempSync(join(tmpdir(), 'proj-instructions-overlay-file-'));
    const baseFile = join(target, 'overlay-base.md');
    const claudeFile = join(target, 'overlay-claude.md');

    try {
      writeFileSync(baseFile, '## base via overlay-file\n');
      writeFileSync(claudeFile, '## claude via overlay-file\n');

      const result = run([
        target,
        '--claude-only',
        '--overlay-file',
        `base=${baseFile}`,
        '--overlay-file',
        `claude=${claudeFile}`,
      ]);

      assert.equal(result.status, 0, result.stderr);
      const claude = readFileSync(join(target, 'CLAUDE.md'), 'utf8');
      assert.match(claude, /base via overlay-file/);
      assert.match(claude, /claude via overlay-file/);
    } finally {
      rmSync(target, { recursive: true, force: true });
    }
  });

  test('fails fast when an option value is missing', () => {
    const target = mkdtempSync(join(tmpdir(), 'proj-instructions-missing-value-'));

    try {
      const result = run([target, '--overlay']);
      assert.notEqual(result.status, 0);
      assert.match(result.stderr, /--overlay requires a value/);
    } finally {
      rmSync(target, { recursive: true, force: true });
    }
  });

});
