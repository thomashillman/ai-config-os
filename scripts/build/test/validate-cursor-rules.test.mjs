import { test } from 'node:test';
import assert from 'node:assert';
import { mkdirSync, writeFileSync, rmSync, mkdtempSync } from 'fs';
import { join } from 'path';
import { tmpdir } from 'os';
import { validateCursorRules } from '../../ci/validate-cursor-rules.mjs';

function fixtureDir() {
  return mkdtempSync(join(tmpdir(), 'cursor-rules-test-'));
}

test('validateCursorRules: accepts empty directory as OK', () => {
  const dir = fixtureDir();
  try {
    const r = validateCursorRules(dir);
    assert.strictEqual(r.ok, true);
    assert.strictEqual(r.fileCount, 0);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('validateCursorRules: accepts valid rule file', () => {
  const dir = fixtureDir();
  try {
    mkdirSync(dir, { recursive: true });
    writeFileSync(
      join(dir, '001-example.mdc'),
      `---
description: Example rule
alwaysApply: true
---

Body
`,
      'utf8',
    );
    const r = validateCursorRules(dir);
    assert.strictEqual(r.ok, true);
    assert.strictEqual(r.fileCount, 1);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('validateCursorRules: rejects bad filename', () => {
  const dir = fixtureDir();
  try {
    mkdirSync(dir, { recursive: true });
    writeFileSync(
      join(dir, 'bad-name.mdc'),
      `---
description: x
alwaysApply: false
---
`,
      'utf8',
    );
    const r = validateCursorRules(dir);
    assert.strictEqual(r.ok, false);
    assert.ok(r.errors.some((e) => e.includes('basename must match')));
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('validateCursorRules: rejects missing alwaysApply', () => {
  const dir = fixtureDir();
  try {
    mkdirSync(dir, { recursive: true });
    writeFileSync(
      join(dir, '010-nope.mdc'),
      `---
description: x
---
`,
      'utf8',
    );
    const r = validateCursorRules(dir);
    assert.strictEqual(r.ok, false);
    assert.ok(r.errors.some((e) => e.includes('alwaysApply')));
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('validateCursorRules: rejects empty globs string', () => {
  const dir = fixtureDir();
  try {
    mkdirSync(dir, { recursive: true });
    writeFileSync(
      join(dir, '020-globs.mdc'),
      `---
description: x
alwaysApply: false
globs: "   "
---
`,
      'utf8',
    );
    const r = validateCursorRules(dir);
    assert.strictEqual(r.ok, false);
    assert.ok(r.errors.some((e) => e.includes('globs')));
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('validateCursorRules: accepts globs string', () => {
  const dir = fixtureDir();
  try {
    mkdirSync(dir, { recursive: true });
    writeFileSync(
      join(dir, '030-globs.mdc'),
      `---
description: Scoped
alwaysApply: false
globs: "**/*.ts"
---
`,
      'utf8',
    );
    const r = validateCursorRules(dir);
    assert.strictEqual(r.ok, true);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});
