import { test } from 'node:test';
import assert from 'node:assert/strict';

import { loadCanonicalToolDefinitions, registeredToolIds } from '../../../runtime/tool-definitions.mjs';

test('loadCanonicalToolDefinitions maps runtime registry tools', () => {
  const defs = loadCanonicalToolDefinitions();
  assert.ok(defs.length > 0);

  const codex = defs.find((tool) => tool.id === 'codex');
  assert.ok(codex);
  assert.equal(codex.executionClass, 'local');
  assert.ok(codex.requiredCapabilities.includes('shell.exec'));
  assert.equal(codex.extensions.adapter, 'shell');
  assert.equal(codex.extensions.install_script, 'adapters/codex/install.sh');
});

test('registeredToolIds returns ids from registry', () => {
  const ids = registeredToolIds();
  assert.equal(ids.has('claude-code'), true);
  assert.equal(ids.has('cursor'), true);
  assert.equal(ids.has('codex'), true);
});


test('loadCanonicalToolDefinitions preserves adapter-specific fields in extensions', () => {
  const defs = loadCanonicalToolDefinitions();
  const claudeCode = defs.find((tool) => tool.id === 'claude-code');

  assert.ok(claudeCode);
  assert.equal(claudeCode.extensions.adapter, 'cli');
  assert.deepEqual(claudeCode.extensions.paths, {
    config: '~/.claude/',
    mcp_config: '~/.claude/mcp.json',
    skills_cache: '~/.claude/plugins/cache/',
  });
  assert.equal(claudeCode.extensions.cli_command, 'claude');
});
