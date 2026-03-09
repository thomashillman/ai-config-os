import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, lstatSync } from 'node:fs';
import { spawnSync } from 'node:child_process';

const CONFLICT_MARKERS = [
  '<' + '<<<<<< ',
  '='.repeat(7),
  '>' + '>>>>>> ',
];

test('repository contains no unresolved merge conflict markers in tracked files', () => {
  const list = spawnSync('git', ['ls-files'], { encoding: 'utf8' });
  assert.equal(list.status, 0, `git ls-files failed: ${list.stderr || 'unknown error'}`);

  const files = list.stdout
    .split('\n')
    .map((file) => file.trim())
    .filter(Boolean);

  const offenders = [];

  for (const file of files) {
    const stat = lstatSync(file);
    if (!stat.isFile()) continue;

    const contents = readFileSync(file, 'utf8');
    if (CONFLICT_MARKERS.some((marker) => contents.includes(marker))) {
      offenders.push(file);
    }
  }

  assert.deepEqual(
    offenders,
    [],
    `Unresolved merge conflict markers found in: ${offenders.join(', ')}`
  );
});
