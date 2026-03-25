import { test } from 'node:test';
import { strict as assert } from 'node:assert';
import { mkdtempSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { tmpdir } from 'node:os';
import { spawnSync } from 'node:child_process';

const REPO_ROOT = resolve(process.cwd());
const SCRIPT_PATH = join(REPO_ROOT, 'scripts', 'build', 'emit-agent-entrypoints.mjs');

function writeFixtureFile(rootDir, relativePath, content) {
  const fullPath = join(rootDir, relativePath);
  mkdirSync(join(fullPath, '..'), { recursive: true });
  writeFileSync(fullPath, content);
}

test('emit-agent-entrypoints composes deterministic outputs', () => {
  const repoDir = mkdtempSync(join(tmpdir(), 'agent-entrypoints-test-'));

  try {
    writeFixtureFile(repoDir, 'shared/agent-doctrine/base/20-second.md', 'Base B');
    writeFixtureFile(repoDir, 'shared/agent-doctrine/base/10-first.md', 'Base A');
    writeFixtureFile(repoDir, 'shared/agent-doctrine/surfaces/claude.md', 'Surface Claude');
    writeFixtureFile(repoDir, 'shared/agent-doctrine/surfaces/codex.md', 'Surface Codex');
    writeFixtureFile(repoDir, 'shared/agent-doctrine/repos/ai-config-os/20-second.overlay.md', 'Overlay B');
    writeFixtureFile(repoDir, 'shared/agent-doctrine/repos/ai-config-os/10-first.overlay.md', 'Overlay A');

    const result = spawnSync(process.execPath, [SCRIPT_PATH], {
      cwd: repoDir,
      encoding: 'utf8'
    });

    assert.equal(result.status, 0, result.stderr || result.stdout);

    const claude = readFileSync(join(repoDir, 'CLAUDE.md'), 'utf8');
    const codex = readFileSync(join(repoDir, 'AGENTS.md'), 'utf8');

    assert.match(claude, /^> Generated file\. Edit doctrine fragments, not this file\./);
    assert.ok(!/Built:|Timestamp:|Generated at:/i.test(claude), 'Output must not contain timestamps');
    assert.ok(claude.indexOf('Base A') < claude.indexOf('Base B'), 'Base fragments must be sorted');
    assert.ok(claude.indexOf('Overlay A') < claude.indexOf('Overlay B'), 'Overlay fragments must be sorted');
    assert.match(claude, /Surface Claude/);
    assert.match(codex, /Surface Codex/);
  } finally {
    rmSync(repoDir, { recursive: true, force: true });
  }
});
