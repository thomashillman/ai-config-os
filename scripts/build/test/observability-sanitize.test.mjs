/**
 * Atom 2 — sanitizeLogField() and sanitizeRecord() tests
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';

// ── Inline implementation (mirrors worker/src/observability/sanitize.ts) ──────

function sanitizeLogField(value) {
  if (typeof value !== 'string') return value;
  let result = value.replace(/[\r\n\t]/g, ' ');
  // eslint-disable-next-line no-control-regex
  result = result.replace(/[\x00-\x08\x0B\x0C\x0E-\x1F\x7F]/g, '');
  result = result.replace(/[\u200B-\u200F\u202A-\u202E\u2060-\u2069\uFEFF\uFFF9-\uFFFB]/g, '');
  return result;
}

function sanitizeRecord(value) {
  if (typeof value === 'string') return sanitizeLogField(value);
  if (Array.isArray(value)) return value.map(sanitizeRecord);
  if (typeof value === 'object' && value !== null) {
    const result = {};
    for (const [k, v] of Object.entries(value)) result[k] = sanitizeRecord(v);
    return result;
  }
  return value;
}

// ── Tests ─────────────────────────────────────────────────────────────────────

test('sanitizeLogField: passes through normal ASCII text unchanged', () => {
  assert.equal(sanitizeLogField('hello world'), 'hello world');
  assert.equal(sanitizeLogField('v0.5.4'), 'v0.5.4');
  assert.equal(sanitizeLogField('/home/user/project'), '/home/user/project');
});

test('sanitizeLogField: replaces CR with space', () => {
  assert.equal(sanitizeLogField('line1\rline2'), 'line1 line2');
});

test('sanitizeLogField: replaces LF with space', () => {
  assert.equal(sanitizeLogField('line1\nline2'), 'line1 line2');
});

test('sanitizeLogField: replaces Tab with space', () => {
  assert.equal(sanitizeLogField('col1\tcol2'), 'col1 col2');
});

test('sanitizeLogField: removes null bytes', () => {
  assert.equal(sanitizeLogField('no\x00null'), 'nonull');
  assert.equal(sanitizeLogField('\x00leading'), 'leading');
  assert.equal(sanitizeLogField('trailing\x00'), 'trailing');
});

test('sanitizeLogField: removes other ASCII control characters', () => {
  // BEL, BS, VT, FF, SO, SI, etc.
  const withControls = 'a\x07b\x08c\x0Bd\x0Ce\x0Ef\x1Fg';
  const result = sanitizeLogField(withControls);
  assert.equal(result, 'abcdefg');
});

test('sanitizeLogField: removes DEL character (0x7F)', () => {
  assert.equal(sanitizeLogField('del\x7Fchar'), 'delchar');
});

test('sanitizeLogField: removes Unicode direction override characters', () => {
  // U+202E RIGHT-TO-LEFT OVERRIDE
  assert.equal(sanitizeLogField('safe\u202Etext'), 'safetext');
  // U+200B ZERO-WIDTH SPACE
  assert.equal(sanitizeLogField('zero\u200Bwidth'), 'zerowidth');
  // U+FEFF BOM
  assert.equal(sanitizeLogField('\uFEFFbom'), 'bom');
});

test('sanitizeLogField: preserves printable Unicode (emoji, CJK, accents)', () => {
  assert.equal(sanitizeLogField('日本語テスト'), '日本語テスト');
  assert.equal(sanitizeLogField('résumé'), 'résumé');
  assert.equal(sanitizeLogField('hello 🎉'), 'hello 🎉');
});

test('sanitizeLogField: preserves normal space (0x20)', () => {
  assert.equal(sanitizeLogField('hello world'), 'hello world');
});

test('sanitizeLogField: returns non-string values unchanged', () => {
  assert.equal(sanitizeLogField(42), 42);
  assert.equal(sanitizeLogField(null), null);
  assert.equal(sanitizeLogField(undefined), undefined);
  assert.deepEqual(sanitizeLogField([1, 2]), [1, 2]);
  assert.equal(sanitizeLogField(true), true);
});

test('sanitizeLogField: handles empty string', () => {
  assert.equal(sanitizeLogField(''), '');
});

test('sanitizeRecord: sanitizes nested string fields', () => {
  const input = {
    run_id: 'r1',
    project_dir: '/home\x00/user',
    phases: [{ phase: 'start\nup', result: 'ok', duration_ms: 5 }],
  };
  const result = sanitizeRecord(input);
  assert.equal(result.project_dir, '/home/user');
  assert.equal(result.phases[0].phase, 'start up');
});

test('sanitizeRecord: preserves numbers and booleans', () => {
  const input = { count: 42, active: true, ratio: 0.5 };
  const result = sanitizeRecord(input);
  assert.deepEqual(result, input);
});

test('sanitizeRecord: does not mutate the input', () => {
  const input = { msg: 'hello\nworld' };
  const result = sanitizeRecord(input);
  assert.equal(input.msg, 'hello\nworld'); // original unchanged
  assert.equal(result.msg, 'hello world');
});

test('sanitizeRecord: handles arrays of strings', () => {
  const result = sanitizeRecord(['a\nb', 'c\td']);
  assert.deepEqual(result, ['a b', 'c d']);
});
