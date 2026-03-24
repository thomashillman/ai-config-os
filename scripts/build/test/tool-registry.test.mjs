// Tests for runtime/mcp/tool-registry.mjs
//
// Validates: registry structure, schema shapes, and dispatch logic.
// No runScript or taskService calls are made; stubs capture invocations.

import { describe, test } from 'node:test';
import assert from 'node:assert/strict';
import { TOOL_REGISTRY, getToolList } from '../../../runtime/mcp/tool-registry.mjs';

// ─── Helpers ──────────────────────────────────────────────────────────────────

function captureRunScript() {
  const calls = [];
  return {
    runScript: (script, args = []) => calls.push({ script, args }),
    calls,
  };
}

// ─── TOOL_REGISTRY structure ──────────────────────────────────────────────────

describe('TOOL_REGISTRY — completeness', () => {
  const EXPECTED_TOOLS = [
    'sync_tools',
    'list_tools',
    'get_config',
    'skill_stats',
    'context_cost',
    'validate_all',
    'mcp_list',
    'mcp_add',
    'mcp_remove',
    'task_start_review_repository',
    'task_resume_review_repository',
    'task_get_readiness',
  ];

  for (const name of EXPECTED_TOOLS) {
    test(`registry contains '${name}'`, () => {
      assert.ok(name in TOOL_REGISTRY, `TOOL_REGISTRY missing entry for '${name}'`);
    });
  }
});

describe('TOOL_REGISTRY — entry shape', () => {
  test('each entry has a non-empty string description', () => {
    for (const [name, entry] of Object.entries(TOOL_REGISTRY)) {
      assert.equal(typeof entry.description, 'string', `${name}.description must be string`);
      assert.ok(entry.description.length > 0, `${name}.description must be non-empty`);
    }
  });

  test('each entry has a JSON Schema object with type=object', () => {
    for (const [name, entry] of Object.entries(TOOL_REGISTRY)) {
      assert.equal(typeof entry.schema, 'object', `${name}.schema must be object`);
      assert.equal(entry.schema.type, 'object', `${name}.schema.type must be 'object'`);
    }
  });

  test('each entry has a callable run function', () => {
    for (const [name, entry] of Object.entries(TOOL_REGISTRY)) {
      assert.equal(typeof entry.run, 'function', `${name}.run must be function`);
    }
  });
});

// ─── Dispatch — script-based tools ───────────────────────────────────────────

describe('TOOL_REGISTRY — dispatch: sync_tools', () => {
  test('dry_run=false calls runtime/sync.sh with no flags', () => {
    const { runScript, calls } = captureRunScript();
    TOOL_REGISTRY.sync_tools.run({ runScript }, { dry_run: false });
    assert.equal(calls[0].script, 'runtime/sync.sh');
    assert.deepEqual(calls[0].args, []);
  });

  test('dry_run=true passes --dry-run flag', () => {
    const { runScript, calls } = captureRunScript();
    TOOL_REGISTRY.sync_tools.run({ runScript }, { dry_run: true });
    assert.deepEqual(calls[0].args, ['--dry-run']);
  });
});

describe('TOOL_REGISTRY — dispatch: context_cost', () => {
  test('passes explicit threshold as string argument', () => {
    const { runScript, calls } = captureRunScript();
    TOOL_REGISTRY.context_cost.run({ runScript }, { threshold: 5000 });
    assert.deepEqual(calls[0].args, ['--threshold', '5000']);
  });

  test('falls back to default threshold 2000 when not provided', () => {
    const { runScript, calls } = captureRunScript();
    TOOL_REGISTRY.context_cost.run({ runScript }, {});
    assert.deepEqual(calls[0].args, ['--threshold', '2000']);
  });
});

describe('TOOL_REGISTRY — dispatch: mcp_add', () => {
  test('passes name, command, and extra args in order', () => {
    const { runScript, calls } = captureRunScript();
    TOOL_REGISTRY.mcp_add.run(
      { runScript },
      { name: 'my-mcp', command: 'npx', args: ['-y', 'my-package'] }
    );
    assert.deepEqual(calls[0].args, ['add', 'my-mcp', 'npx', '-y', 'my-package']);
  });

  test('handles missing args array gracefully', () => {
    const { runScript, calls } = captureRunScript();
    TOOL_REGISTRY.mcp_add.run({ runScript }, { name: 'srv', command: 'node server.js' });
    assert.deepEqual(calls[0].args, ['add', 'srv', 'node server.js']);
  });
});

describe('TOOL_REGISTRY — dispatch: mcp_remove', () => {
  test('passes remove subcommand and name', () => {
    const { runScript, calls } = captureRunScript();
    TOOL_REGISTRY.mcp_remove.run({ runScript }, { name: 'old-mcp' });
    assert.deepEqual(calls[0].args, ['remove', 'old-mcp']);
  });
});

// ─── Dispatch — task service tools ───────────────────────────────────────────

describe('TOOL_REGISTRY — dispatch: task_start_review_repository', () => {
  test('delegates to taskService.startReviewRepositoryTask with remapped keys', () => {
    let received = null;
    const taskService = {
      startReviewRepositoryTask(args) { received = args; return 'started'; },
    };
    const result = TOOL_REGISTRY.task_start_review_repository.run(
      { taskService },
      { task_id: 't1', goal: 'review it', route_inputs: { pr: 42 }, capability_profile: { mode: 'local-cli' } }
    );
    assert.equal(result, 'started');
    assert.deepEqual(received, {
      taskId: 't1',
      goal: 'review it',
      routeInputs: { pr: 42 },
      capabilityProfile: { mode: 'local-cli' },
    });
  });
});

describe('TOOL_REGISTRY — dispatch: task_resume_review_repository', () => {
  test('delegates to taskService.resumeReviewRepositoryTask with remapped keys', () => {
    let received = null;
    const taskService = {
      resumeReviewRepositoryTask(args) { received = args; return 'resumed'; },
    };
    const result = TOOL_REGISTRY.task_resume_review_repository.run(
      { taskService },
      { task_id: 't2', capability_profile: { mode: 'web' } }
    );
    assert.equal(result, 'resumed');
    assert.deepEqual(received, { taskId: 't2', capabilityProfile: { mode: 'web' } });
  });
});

describe('TOOL_REGISTRY — dispatch: task_get_readiness', () => {
  test('wraps taskService.getReadiness result in readiness key', () => {
    const taskService = { getReadiness: (id) => ({ task_id: id, is_ready: true }) };
    const result = TOOL_REGISTRY.task_get_readiness.run({ taskService }, { task_id: 't3' });
    assert.deepEqual(result, { readiness: { task_id: 't3', is_ready: true } });
  });
});

// ─── getToolList ──────────────────────────────────────────────────────────────

describe('getToolList', () => {
  test('returns one entry per registry tool', () => {
    const list = getToolList();
    assert.equal(list.length, Object.keys(TOOL_REGISTRY).length);
  });

  test('each entry has name, description, and inputSchema', () => {
    for (const entry of getToolList()) {
      assert.equal(typeof entry.name, 'string', 'entry.name must be string');
      assert.equal(typeof entry.description, 'string', 'entry.description must be string');
      assert.equal(typeof entry.inputSchema, 'object', 'entry.inputSchema must be object');
    }
  });

  test('entry names match TOOL_REGISTRY keys exactly', () => {
    const listNames = getToolList().map(e => e.name).sort();
    const registryNames = Object.keys(TOOL_REGISTRY).sort();
    assert.deepEqual(listNames, registryNames);
  });

  test('inputSchema is the same object as registry schema', () => {
    for (const entry of getToolList()) {
      assert.strictEqual(entry.inputSchema, TOOL_REGISTRY[entry.name].schema);
    }
  });
});
