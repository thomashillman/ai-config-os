#!/usr/bin/env node
/**
 * verify.mjs — Cross-platform pre-push verification gate.
 *
 * Runs all validation steps in sequence. Uses Node.js glob discovery
 * instead of shell patterns so it works on Windows CMD.
 *
 * Usage: node scripts/build/verify.mjs
 *        npm run verify
 */
import { readdirSync, existsSync } from 'fs';
import { join, resolve, dirname } from 'path';
import { fileURLToPath } from 'url';
import { spawnSync } from 'child_process';

const __dirname = dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = resolve(__dirname, '..', '..');

let failed = false;

function run(label, command, args) {
  console.log(`\n==> ${label}`);
  const result = spawnSync(command, args, {
    cwd: REPO_ROOT,
    stdio: 'inherit',
    encoding: 'utf8',
  });
  if (result.status !== 0) {
    console.error(`FAIL: ${label} (exit ${result.status})`);
    failed = true;
    return false;
  }
  console.log(`PASS: ${label}`);
  return true;
}

// ─── 1. Version parity ───
run('Version parity check', process.execPath, [join(REPO_ROOT, 'scripts', 'build', 'check-version-parity.mjs')]);

// ─── 2. Lint skills (discover via Node.js, not shell glob) ───
const skillsDir = join(REPO_ROOT, 'shared', 'skills');
const skillFiles = readdirSync(skillsDir, { withFileTypes: true })
  .filter(d => d.isDirectory() && !d.name.startsWith('_'))
  .map(d => join(skillsDir, d.name, 'SKILL.md'))
  .filter(f => existsSync(f));

if (skillFiles.length > 0) {
  run('Lint skills', process.execPath, [join(REPO_ROOT, 'scripts', 'lint', 'skill.mjs'), ...skillFiles]);
}

// ─── 3. Lint platforms (discover via Node.js) ───
const platformsDir = join(REPO_ROOT, 'shared', 'targets', 'platforms');
if (existsSync(platformsDir)) {
  const platformFiles = readdirSync(platformsDir)
    .filter(f => f.endsWith('.yaml'))
    .map(f => join(platformsDir, f));

  if (platformFiles.length > 0) {
    run('Lint platforms', process.execPath, [join(REPO_ROOT, 'scripts', 'lint', 'platform.mjs'), ...platformFiles]);
  }
}

// ─── 4. Full test suite ───
run('Test suite', process.execPath, [join(REPO_ROOT, 'scripts', 'build', 'test', 'run-tests.mjs')]);

// ─── Result ───
console.log('');
if (failed) {
  console.error('VERIFICATION FAILED — do not push.');
  process.exit(1);
} else {
  console.log('ALL CHECKS PASSED — safe to push.');
}
