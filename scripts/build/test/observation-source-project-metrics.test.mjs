/**
 * Observation Source: Project Metrics
 *
 * Tests the project-metrics observation adapter that reads .claude/metrics.jsonl
 * and converts raw metric lines into canonical observation events.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { writeFileSync, unlinkSync } from 'node:fs';

import { readProjectMetricsEvents } from '../../../runtime/lib/observation-sources/project-metrics.mjs';

function tempFile(name = 'metrics.jsonl') {
  return join(tmpdir(), `test-${Date.now()}-${name}`);
}

test('readProjectMetricsEvents reads valid metrics.jsonl file', async (t) => {
  const tempDir = tmpdir();
  const metricsPath = tempFile('valid-metrics.jsonl');

  // Create a metrics file with one valid line
  const validLine = JSON.stringify({
    timestamp: '2025-03-23T10:55:00Z',
    event_type: 'skill_used',
    skill_name: 'code-review',
    duration_ms: 1500,
  });

  writeFileSync(metricsPath, validLine + '\n', 'utf8');

  try {
    const events = readProjectMetricsEvents({ metricsPath });

    assert.equal(events.length, 1, 'should parse one event');
    assert.equal(events[0].timestamp, '2025-03-23T10:55:00Z');
    assert.equal(events[0].event_type, 'skill_used');
    assert.equal(events[0].skill_name, 'code-review');
    assert.equal(events[0].duration_ms, 1500);
  } finally {
    try {
      unlinkSync(metricsPath);
    } catch {}
  }
});

test('readProjectMetricsEvents skips malformed lines', async (t) => {
  const metricsPath = tempFile('malformed-metrics.jsonl');

  const content = [
    JSON.stringify({ timestamp: '2025-03-23T10:55:00Z', event_type: 'skill_used', skill_name: 'test' }),
    'this is not json',
    JSON.stringify({ timestamp: '2025-03-23T10:55:05Z', event_type: 'skill_used', skill_name: 'test2' }),
  ].join('\n') + '\n';

  writeFileSync(metricsPath, content, 'utf8');

  try {
    const events = readProjectMetricsEvents({ metricsPath });

    assert.equal(events.length, 2, 'should parse only valid lines');
    assert.equal(events[0].skill_name, 'test');
    assert.equal(events[1].skill_name, 'test2');
  } finally {
    try {
      unlinkSync(metricsPath);
    } catch {}
  }
});

test('readProjectMetricsEvents returns empty array for missing file', async (t) => {
  const metricsPath = tempFile('nonexistent-metrics.jsonl');

  try {
    const events = readProjectMetricsEvents({ metricsPath });

    assert.equal(events.length, 0, 'should return empty array when file missing');
  } finally {
    try {
      unlinkSync(metricsPath);
    } catch {}
  }
});

test('readProjectMetricsEvents handles zero duration_ms as-is', async (t) => {
  const metricsPath = tempFile('zero-duration-metrics.jsonl');

  const content = JSON.stringify({
    timestamp: '2025-03-23T10:55:00Z',
    event_type: 'skill_used',
    skill_name: 'test',
    duration_ms: 0,
  });

  writeFileSync(metricsPath, content + '\n', 'utf8');

  try {
    const events = readProjectMetricsEvents({ metricsPath });

    assert.equal(events.length, 1);
    assert.equal(events[0].duration_ms, 0, 'should pass through zero duration as-is');
  } finally {
    try {
      unlinkSync(metricsPath);
    } catch {}
  }
});

test('readProjectMetricsEvents handles empty lines', async (t) => {
  const metricsPath = tempFile('empty-lines-metrics.jsonl');

  const content = [
    JSON.stringify({ timestamp: '2025-03-23T10:55:00Z', event_type: 'skill_used', skill_name: 'test' }),
    '',
    '   ',
    JSON.stringify({ timestamp: '2025-03-23T10:55:05Z', event_type: 'skill_used', skill_name: 'test2' }),
  ].join('\n') + '\n';

  writeFileSync(metricsPath, content, 'utf8');

  try {
    const events = readProjectMetricsEvents({ metricsPath });

    assert.equal(events.length, 2, 'should skip empty and whitespace-only lines');
  } finally {
    try {
      unlinkSync(metricsPath);
    } catch {}
  }
});
