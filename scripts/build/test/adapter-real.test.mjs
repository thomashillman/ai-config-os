/**
 * adapter-real.test.mjs
 *
 * Tests real adapter code: validators, shell-safe utilities, and
 * mcp-adapter.sh shell scripts. Shell-dependent tests are skipped
 * on Windows where bash is unavailable.
 */
import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { platform, tmpdir } from 'node:os';
import { execFileSync } from 'node:child_process';
import { mkdtempSync, writeFileSync, readFileSync, rmSync } from 'node:fs';
import { join, resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { validateName } from '../../../runtime/mcp/validators.mjs';
import { isCommandNameSafe } from '../../../runtime/adapters/shell-safe.mjs';

const __dirname = dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = resolve(__dirname, '../../..');
const isWindows = platform() === 'win32';

// ---------------------------------------------------------------------------
// Validator + shell-safe integration (runs on all platforms)
// ---------------------------------------------------------------------------

describe('adapter-real: mcp_add validation flow', () => {
  test('valid name + valid command passes both checks', () => {
    const name = 'my-server';
    const command = 'npx';

    assert.equal(validateName(name), name);
    assert.equal(isCommandNameSafe(command), true);
  });

  test('valid name + unsafe command is caught by isCommandNameSafe', () => {
    const name = 'my-server';
    const command = '/usr/bin/evil; rm -rf /';

    assert.equal(validateName(name), name);
    assert.equal(isCommandNameSafe(command), false);
  });

  test('invalid name is caught by validateName before command check', () => {
    assert.throws(() => validateName('BAD;NAME'), /Invalid name/);
  });
});

// ---------------------------------------------------------------------------
// mcp-adapter.sh (bash-dependent, skipped on Windows)
// ---------------------------------------------------------------------------

describe('adapter-real: mcp-adapter.sh', { skip: isWindows ? 'bash not available on Windows' : false }, () => {

  test('list returns output with known fixture data', () => {
    const tmpDir = mkdtempSync(join(tmpdir(), 'adapter-test-'));
    const configPath = join(tmpDir, 'mcp.json');

    try {
      writeFileSync(configPath, JSON.stringify({
        mcpServers: {
          'test-server': { command: 'node', args: ['server.js'], env: {} }
        }
      }));

      const output = execFileSync('bash', [
        join(REPO_ROOT, 'runtime/adapters/mcp-adapter.sh'),
        'list'
      ], {
        encoding: 'utf8',
        timeout: 10000,
        env: { ...process.env, CLAUDE_MCP_CONFIG: configPath }
      });

      assert.ok(output.includes('test-server'), 'Should list the test-server entry');
      assert.ok(output.includes('node'), 'Should show the command');
    } finally {
      rmSync(tmpDir, { recursive: true, force: true });
    }
  });

  test('add + list round-trip', () => {
    const tmpDir = mkdtempSync(join(tmpdir(), 'adapter-test-'));
    const configPath = join(tmpDir, 'mcp.json');

    try {
      // Start with empty config
      writeFileSync(configPath, JSON.stringify({ mcpServers: {} }));

      const env = { ...process.env, CLAUDE_MCP_CONFIG: configPath };
      const adapterScript = join(REPO_ROOT, 'runtime/adapters/mcp-adapter.sh');

      // Add a server
      execFileSync('bash', [adapterScript, 'add', 'round-trip-server', 'npx', '-y', 'some-pkg'], {
        encoding: 'utf8',
        timeout: 10000,
        env
      });

      // Verify it appears in the config file
      const config = JSON.parse(readFileSync(configPath, 'utf8'));
      assert.ok(config.mcpServers['round-trip-server'], 'Server should exist in config');
      assert.equal(config.mcpServers['round-trip-server'].command, 'npx');
      assert.deepEqual(config.mcpServers['round-trip-server'].args, ['-y', 'some-pkg']);

      // List should show it
      const output = execFileSync('bash', [adapterScript, 'list'], {
        encoding: 'utf8',
        timeout: 10000,
        env
      });
      assert.ok(output.includes('round-trip-server'), 'List should show the added server');
    } finally {
      rmSync(tmpDir, { recursive: true, force: true });
    }
  });

  test('remove deletes a server entry', () => {
    const tmpDir = mkdtempSync(join(tmpdir(), 'adapter-test-'));
    const configPath = join(tmpDir, 'mcp.json');

    try {
      writeFileSync(configPath, JSON.stringify({
        mcpServers: {
          'to-remove': { command: 'node', args: [], env: {} },
          'to-keep': { command: 'python3', args: [], env: {} }
        }
      }));

      const env = { ...process.env, CLAUDE_MCP_CONFIG: configPath };
      const adapterScript = join(REPO_ROOT, 'runtime/adapters/mcp-adapter.sh');

      execFileSync('bash', [adapterScript, 'remove', 'to-remove'], {
        encoding: 'utf8',
        timeout: 10000,
        env
      });

      const config = JSON.parse(readFileSync(configPath, 'utf8'));
      assert.equal(config.mcpServers['to-remove'], undefined, 'Removed server should be gone');
      assert.ok(config.mcpServers['to-keep'], 'Other server should remain');
    } finally {
      rmSync(tmpDir, { recursive: true, force: true });
    }
  });
});
