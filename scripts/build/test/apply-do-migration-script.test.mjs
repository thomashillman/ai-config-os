import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { tmpdir } from 'node:os';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const THIS_FILE = fileURLToPath(import.meta.url);
const REPO_ROOT = resolve(THIS_FILE, '..', '..', '..', '..');
const SCRIPT_PATH = join(REPO_ROOT, 'scripts', 'deploy', 'apply-do-migration.sh');
const WRANGLER_TOML_PATH = join(REPO_ROOT, 'worker', 'wrangler.toml');
const ORIGINAL_TOML = readFileSync(WRANGLER_TOML_PATH, 'utf8');

function makeFakeBin({ deployExitCode = 0 } = {}) {
  const dir = mkdtempSync(join(tmpdir(), 'do-migration-bin-'));
  const wranglerPath = join(dir, 'wrangler');
  const npxPath = join(dir, 'npx');

  writeFileSync(wranglerPath, '#!/usr/bin/env bash\nexit 0\n');
  writeFileSync(
    npxPath,
    `#!/usr/bin/env bash
if [[ "$1" == "wrangler" && "$2" == "deploy" ]]; then
  exit ${deployExitCode}
fi
exit 99
`
  );

  spawnSync('chmod', ['+x', wranglerPath, npxPath], { encoding: 'utf8' });
  return dir;
}

function runScript(envArg, { pathOverride } = {}) {
  const env = {
    ...process.env,
    PATH: pathOverride ?? process.env.PATH,
  };

  return spawnSync('bash', [SCRIPT_PATH, envArg], {
    cwd: REPO_ROOT,
    env,
    encoding: 'utf8',
  });
}

test('invalid env exits before mutation', () => {
  const before = readFileSync(WRANGLER_TOML_PATH, 'utf8');
  const result = runScript('invalid-environment-name');
  const after = readFileSync(WRANGLER_TOML_PATH, 'utf8');

  assert.notEqual(result.status, 0);
  assert.match(result.stdout + result.stderr, /Usage:/);
  assert.equal(after, before);
  assert.equal(after, ORIGINAL_TOML);
});

test('cleanup runs on failure path', () => {
  const fakeBin = makeFakeBin({ deployExitCode: 17 });
  const before = readFileSync(WRANGLER_TOML_PATH, 'utf8');

  try {
    const result = runScript('staging', {
      pathOverride: `${fakeBin}:${process.env.PATH}`,
    });
    const after = readFileSync(WRANGLER_TOML_PATH, 'utf8');

    assert.equal(result.status, 17);
    assert.match(result.stdout + result.stderr, /\[inject\]/);
    assert.match(result.stdout + result.stderr, /\[restore\] Restoring wrangler.toml/);
    assert.equal(after, before);
    assert.equal(after, ORIGINAL_TOML);
  } finally {
    rmSync(fakeBin, { recursive: true, force: true });
  }
});

test('cleanup runs on success path', () => {
  const fakeBin = makeFakeBin({ deployExitCode: 0 });
  const before = readFileSync(WRANGLER_TOML_PATH, 'utf8');

  try {
    const result = runScript('production', {
      pathOverride: `${fakeBin}:${process.env.PATH}`,
    });
    const after = readFileSync(WRANGLER_TOML_PATH, 'utf8');

    assert.equal(result.status, 0);
    assert.match(result.stdout + result.stderr, /\[deploy\]/);
    assert.match(result.stdout + result.stderr, /\[restore\] Restoring wrangler.toml/);
    assert.match(result.stdout + result.stderr, /\[result\] Migration applied successfully/);
    assert.equal(after, before);
    assert.equal(after, ORIGINAL_TOML);
  } finally {
    rmSync(fakeBin, { recursive: true, force: true });
  }
});

test('script never leaves worker/wrangler.toml modified across runs', () => {
  const fakeBinFail = makeFakeBin({ deployExitCode: 31 });
  const fakeBinPass = makeFakeBin({ deployExitCode: 0 });

  try {
    runScript('staging', { pathOverride: `${fakeBinFail}:${process.env.PATH}` });
    runScript('production', { pathOverride: `${fakeBinPass}:${process.env.PATH}` });

    const finalToml = readFileSync(WRANGLER_TOML_PATH, 'utf8');
    assert.equal(finalToml, ORIGINAL_TOML);
  } finally {
    rmSync(fakeBinFail, { recursive: true, force: true });
    rmSync(fakeBinPass, { recursive: true, force: true });
  }
});
