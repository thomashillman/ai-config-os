/**
 * Tool Inefficiencies Observation Source — reads ~/.claude/skill-analytics/inefficiencies.jsonl
 *
 * Tests cover:
 * - tool_error events
 * - loop_suspected events
 * - malformed lines (skipped gracefully)
 * - missing file (returns empty array)
 */

import { test } from 'node:test';
import { strict as assert } from 'node:assert';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { tmpdir } from 'node:os';
import { writeFileSync, mkdirSync, unlinkSync } from 'node:fs';

// Windows-safe path setup
const __dirname = fileURLToPath(new URL('.', import.meta.url));
const ROOT = resolve(join(__dirname, '../../..'));

// Import the adapter
import { safeImport } from '../lib/windows-safe-import.mjs';

test('Tool Inefficiencies Observation Source', async (t) => {
  const tempDir = join(tmpdir(), `tool-ineff-test-${Date.now()}`);
  mkdirSync(tempDir, { recursive: true });

  const analyticsDir = join(tempDir, '.claude', 'skill-analytics');
  mkdirSync(analyticsDir, { recursive: true });
  const inefficienciesPath = join(analyticsDir, 'inefficiencies.jsonl');

  let readToolInefficiencies;

  await t.test('setup: import adapter', async () => {
    const mod = await safeImport('../../../runtime/lib/observation-sources/tool-inefficiencies.mjs', import.meta.url);
    readToolInefficiencies = mod.readToolInefficiencies;
    assert.ok(typeof readToolInefficiencies === 'function', 'should export readToolInefficiencies function');
  });

  await t.test('missing file returns empty array', async () => {
    const observations = await readToolInefficiencies({ filePath: inefficienciesPath });
    assert.deepEqual(observations, [], 'should return empty array when file does not exist');
  });

  await t.test('reads tool_error events', async () => {
    const lines = [
      '{"timestamp":"2026-03-23T10:00:00Z","session_id":"s1","type":"tool_error","tool":"Bash","snippet":"error message"}',
    ];
    writeFileSync(inefficienciesPath, lines.join('\n') + '\n');

    const observations = await readToolInefficiencies({ filePath: inefficienciesPath });
    assert.equal(observations.length, 1, 'should read one event');
    assert.equal(observations[0].type, 'tool_error', 'should preserve event type');
    assert.equal(observations[0].tool_name, 'Bash', 'should map tool to tool_name');
    assert.equal(observations[0].metadata.source_type, 'tool_inefficiencies', 'should preserve source type');
    assert.equal(observations[0].metadata.snippet, 'error message', 'should preserve snippet');
  });

  await t.test('reads loop_suspected events', async () => {
    const lines = [
      '{"timestamp":"2026-03-23T10:00:00Z","session_id":"s1","type":"loop_suspected","tool":"Read","call_count":15}',
    ];
    writeFileSync(inefficienciesPath, lines.join('\n') + '\n');

    const observations = await readToolInefficiencies({ filePath: inefficienciesPath });
    assert.equal(observations.length, 1, 'should read one event');
    assert.equal(observations[0].type, 'loop_suspected', 'should preserve event type');
    assert.equal(observations[0].tool_name, 'Read', 'should map tool to tool_name');
    assert.equal(observations[0].metadata.source_type, 'tool_inefficiencies', 'should preserve source type');
    assert.equal(observations[0].metadata.call_count, 15, 'should preserve call_count');
  });

  await t.test('skips malformed lines gracefully', async () => {
    const lines = [
      '{"timestamp":"2026-03-23T10:00:00Z","session_id":"s1","type":"tool_error","tool":"Bash","snippet":"ok"}',
      'not valid json at all',
      '{"incomplete":',
      '{"timestamp":"2026-03-23T10:00:01Z","session_id":"s2","type":"loop_suspected","tool":"Grep","call_count":10}',
    ];
    writeFileSync(inefficienciesPath, lines.join('\n') + '\n');

    const observations = await readToolInefficiencies({ filePath: inefficienciesPath });
    assert.equal(observations.length, 2, 'should skip malformed lines and read valid ones');
    assert.equal(observations[0].tool_name, 'Bash', 'first valid event');
    assert.equal(observations[1].tool_name, 'Grep', 'second valid event');
  });

  await t.test('reads multiple events in order', async () => {
    const lines = [
      '{"timestamp":"2026-03-23T10:00:00Z","session_id":"s1","type":"tool_error","tool":"Edit","snippet":"edit failed"}',
      '{"timestamp":"2026-03-23T10:00:01Z","session_id":"s1","type":"loop_suspected","tool":"Glob","call_count":12}',
      '{"timestamp":"2026-03-23T10:00:02Z","session_id":"s2","type":"tool_error","tool":"Write","snippet":"write failed"}',
    ];
    writeFileSync(inefficienciesPath, lines.join('\n') + '\n');

    const observations = await readToolInefficiencies({ filePath: inefficienciesPath });
    assert.equal(observations.length, 3, 'should read all events');
    assert.equal(observations[0].tool_name, 'Edit', 'first event');
    assert.equal(observations[1].tool_name, 'Glob', 'second event');
    assert.equal(observations[2].tool_name, 'Write', 'third event');
  });

  await t.test('preserves all metadata fields', async () => {
    const lines = [
      '{"timestamp":"2026-03-23T10:00:00Z","session_id":"abc123","type":"tool_error","tool":"Bash","snippet":"permission denied"}',
    ];
    writeFileSync(inefficienciesPath, lines.join('\n') + '\n');

    const observations = await readToolInefficiencies({ filePath: inefficienciesPath });
    const obs = observations[0];
    assert.equal(obs.timestamp, '2026-03-23T10:00:00Z', 'should preserve timestamp');
    assert.equal(obs.metadata.session_id, 'abc123', 'should preserve session_id in metadata');
    assert.equal(obs.metadata.source_type, 'tool_inefficiencies', 'should mark source_type');
  });

  // Cleanup
  try {
    unlinkSync(inefficienciesPath);
  } catch {
    // Ignore cleanup errors
  }
});
