/**
 * mcp-runtime.test.mjs
 *
 * Tests for MCP runtime helpers: response shaping, error handling, and prerequisites.
 * Ensures that failures preserve diagnostic context and that responses are well-formed.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';

// --- Helper response shaping tests ---

function parseEnvelope(result) {
  return JSON.parse(result.content[0].text);
}

test('toToolResponse returns envelope on success', async () => {
  const { toToolResponse } = await import('../../../runtime/mcp/tool-response.mjs');

  const result = toToolResponse({ success: true, output: 'ok', error: null });
  const envelope = parseEnvelope(result);
  assert.equal(envelope.contract_version, '1.0.0');
  assert.equal(envelope.data.diagnostics.raw_output, 'ok');
  assert.equal(envelope.data.success, true);
  assert.equal(result.content[0].type, 'text');
  assert.deepEqual(result.structuredContent, envelope);
});

test('toToolResponse returns empty string for success with no output', async () => {
  const { toToolResponse } = await import('../../../runtime/mcp/tool-response.mjs');

  const result = toToolResponse({ success: true, output: '', error: null });
  const envelope = parseEnvelope(result);
  assert.equal(envelope.data.diagnostics, undefined);
  assert.equal(envelope.data.success, true);
});

test('toToolResponse returns null output as empty string on success', async () => {
  const { toToolResponse } = await import('../../../runtime/mcp/tool-response.mjs');

  const result = toToolResponse({ success: true, output: null, error: null });
  const envelope = parseEnvelope(result);
  assert.equal(envelope.data.diagnostics, undefined);
  assert.equal(envelope.data.success, true);
});

test('toToolResponse sets isError true on failure', async () => {
  const { toToolResponse } = await import('../../../runtime/mcp/tool-response.mjs');

  const result = toToolResponse({ success: false, output: '', error: 'boom' });
  const envelope = parseEnvelope(result);

  assert.equal(result.isError, true);
  assert.match(envelope.data.diagnostics.raw_output, /boom/);
  assert.equal(envelope.data.success, false);
  assert.equal(envelope.error.code, 'tool_execution_failed');
});

test('toToolResponse preserves both stderr and stdout on failure', async () => {
  const { toToolResponse } = await import('../../../runtime/mcp/tool-response.mjs');

  const result = toToolResponse({
    success: false,
    output: 'stdout details',
    error: 'stderr failure'
  });

  assert.equal(result.isError, true);
  const envelope = parseEnvelope(result);
  assert.match(envelope.data.diagnostics.raw_output, /stderr failure/);
  assert.match(envelope.data.diagnostics.raw_output, /stdout details/);
});

test('toToolResponse handles error without stdout', async () => {
  const { toToolResponse } = await import('../../../runtime/mcp/tool-response.mjs');

  const result = toToolResponse({
    success: false,
    output: '',
    error: 'command failed'
  });

  assert.equal(result.isError, true);
  assert.equal(parseEnvelope(result).data.diagnostics.raw_output, 'command failed');
});

test('toToolResponse handles stdout without error', async () => {
  const { toToolResponse } = await import('../../../runtime/mcp/tool-response.mjs');

  const result = toToolResponse({
    success: false,
    output: 'some output',
    error: ''
  });

  assert.equal(result.isError, true);
  assert.equal(parseEnvelope(result).data.diagnostics.raw_output, 'some output');
});

test('toToolResponse handles both missing on failure', async () => {
  const { toToolResponse } = await import('../../../runtime/mcp/tool-response.mjs');

  const result = toToolResponse({
    success: false,
    output: '',
    error: ''
  });

  assert.equal(result.isError, true);
  assert.equal(parseEnvelope(result).data.diagnostics.raw_output, 'Unknown error');
});


test('toToolResponse includes effective outcome contract in envelope meta on failure', async () => {
  const { toToolResponse } = await import('../../../runtime/mcp/tool-response.mjs');
  const contract = { outcomeId: 'runtime.validate-all' };

  const result = toToolResponse(
    { success: false, output: 'stdout details', error: 'stderr failure' },
    contract
  );

  const envelope = parseEnvelope(result);
  assert.equal(result.isError, true);
  assert.deepEqual(envelope.meta.effective_outcome_contract, contract);
  assert.match(envelope.data.diagnostics.raw_output, /stderr failure/);
  assert.match(envelope.data.diagnostics.raw_output, /stdout details/);
});

test('toolError returns isError true', async () => {
  const { toolError } = await import('../../../runtime/mcp/tool-response.mjs');

  const result = toolError('something went wrong');
  const envelope = parseEnvelope(result);

  assert.equal(result.isError, true);
  assert.equal(envelope.error.code, 'invalid_request');
  assert.equal(envelope.error.message, 'something went wrong');
});

test('toolError handles null message gracefully', async () => {
  const { toolError } = await import('../../../runtime/mcp/tool-response.mjs');

  const result = toolError(null);
  const envelope = parseEnvelope(result);

  assert.equal(result.isError, true);
  assert.equal(envelope.error.message, 'Unknown error');
});

// --- Handler-level tests (Slice 3) ---

test('handler unknown tool returns isError true with helpful message', async () => {
  const { createCallToolHandler } = await import('../../../runtime/mcp/handlers.mjs');
  const { toToolResponse, toolError } = await import('../../../runtime/mcp/tool-response.mjs');

  const fakeDeps = {
    runScript: () => ({ success: true, output: '', error: null }),
    validateName: () => {},
    validateNumber: () => {},
    isCommandNameSafe: () => true,
    resolveEffectiveOutcomeContract: () => ({ outcomeId: 'test.outcome' }),
    toToolResponse,
    toolError,
  };

  const handler = createCallToolHandler(fakeDeps);
  const result = await handler({ params: { name: 'does_not_exist', arguments: {} } });

  assert.equal(result.isError, true);
  assert.match(result.content[0].text, /Unknown tool/);
  assert.match(result.content[0].text, /does_not_exist/);
});

test('handler mcp_add with invalid name returns tool error', async () => {
  const { createCallToolHandler } = await import('../../../runtime/mcp/handlers.mjs');
  const { toToolResponse, toolError } = await import('../../../runtime/mcp/tool-response.mjs');

  const fakeDeps = {
    runScript: () => ({ success: true, output: '', error: null }),
    validateName: () => {
      throw new Error('Invalid name: name must be alphanumeric');
    },
    validateNumber: () => {},
    isCommandNameSafe: () => true,
    resolveEffectiveOutcomeContract: () => ({ outcomeId: 'test.outcome' }),
    toToolResponse,
    toolError,
  };

  const handler = createCallToolHandler(fakeDeps);
  const result = await handler({
    params: { name: 'mcp_add', arguments: { name: '!!!invalid!!!', command: 'bash' } }
  });

  assert.equal(result.isError, true);
  assert.match(result.content[0].text, /Invalid name/);
});

test('handler mcp_add with unsafe command returns tool error', async () => {
  const { createCallToolHandler } = await import('../../../runtime/mcp/handlers.mjs');
  const { toToolResponse, toolError } = await import('../../../runtime/mcp/tool-response.mjs');

  const fakeDeps = {
    runScript: () => ({ success: true, output: '', error: null }),
    validateName: () => {},
    validateNumber: () => {},
    isCommandNameSafe: () => false,
    resolveEffectiveOutcomeContract: () => ({ outcomeId: 'test.outcome' }),
    toToolResponse,
    toolError,
  };

  const handler = createCallToolHandler(fakeDeps);
  const result = await handler({
    params: { name: 'mcp_add', arguments: { name: 'demo', command: '../evil.sh' } }
  });

  assert.equal(result.isError, true);
  assert.match(result.content[0].text, /Invalid command/);
});

test('handler script failure becomes MCP error response with full context', async () => {
  const { createCallToolHandler } = await import('../../../runtime/mcp/handlers.mjs');
  const { toToolResponse, toolError } = await import('../../../runtime/mcp/tool-response.mjs');

  const fakeDeps = {
    runScript: () => {
      return {
        success: false,
        output: 'stdout: some operation started',
        error: 'stderr: process exited with code 1'
      };
    },
    validateName: () => {},
    validateNumber: () => {},
    isCommandNameSafe: () => true,
    resolveEffectiveOutcomeContract: () => ({ outcomeId: 'test.outcome' }),
    toToolResponse,
    toolError,
  };

  const handler = createCallToolHandler(fakeDeps);
  const result = await handler({
    params: { name: 'validate_all', arguments: {} }
  });

  assert.equal(result.isError, true);
  assert.match(result.content[0].text, /stderr: process exited with code 1/);
  assert.match(result.content[0].text, /stdout: some operation started/);
});

test('handler context_cost validates number argument', async () => {
  const { createCallToolHandler } = await import('../../../runtime/mcp/handlers.mjs');
  const { toToolResponse, toolError } = await import('../../../runtime/mcp/tool-response.mjs');

  let receivedThreshold = null;

  const fakeDeps = {
    runScript: (script, args) => {
      // Capture the threshold passed to the script
      if (args && args[1]) {
        receivedThreshold = parseInt(args[1], 10);
      }
      return { success: true, output: 'ok', error: null };
    },
    validateName: () => {},
    validateNumber: (input, defaultValue) => {
      if (input === undefined) return defaultValue;
      if (typeof input !== 'number') throw new Error('threshold must be a number');
      return input;
    },
    isCommandNameSafe: () => true,
    resolveEffectiveOutcomeContract: () => ({ outcomeId: 'test.outcome' }),
    toToolResponse,
    toolError,
  };

  const handler = createCallToolHandler(fakeDeps);
  await handler({
    params: { name: 'context_cost', arguments: { threshold: 5000 } }
  });

  assert.equal(receivedThreshold, 5000);
});

test('handler context_cost uses default threshold when not provided', async () => {
  const { createCallToolHandler } = await import('../../../runtime/mcp/handlers.mjs');
  const { toToolResponse, toolError } = await import('../../../runtime/mcp/tool-response.mjs');

  let receivedThreshold = null;

  const fakeDeps = {
    runScript: (script, args) => {
      if (args && args[1]) {
        receivedThreshold = parseInt(args[1], 10);
      }
      return { success: true, output: 'ok', error: null };
    },
    validateName: () => {},
    validateNumber: (input, defaultValue) => {
      if (input === undefined) return defaultValue;
      return input;
    },
    isCommandNameSafe: () => true,
    resolveEffectiveOutcomeContract: () => ({ outcomeId: 'test.outcome' }),
    toToolResponse,
    toolError,
  };

  const handler = createCallToolHandler(fakeDeps);
  await handler({
    params: { name: 'context_cost', arguments: {} }
  });

  assert.equal(receivedThreshold, 2000);
});

test('handler sync_tools respects dry_run argument', async () => {
  const { createCallToolHandler } = await import('../../../runtime/mcp/handlers.mjs');
  const { toToolResponse, toolError } = await import('../../../runtime/mcp/tool-response.mjs');

  let receivedArgs = null;

  const fakeDeps = {
    runScript: (script, args) => {
      receivedArgs = args;
      return { success: true, output: 'ok', error: null };
    },
    validateName: () => {},
    validateNumber: () => {},
    isCommandNameSafe: () => true,
    resolveEffectiveOutcomeContract: () => ({ outcomeId: 'test.outcome' }),
    toToolResponse,
    toolError,
  };

  const handler = createCallToolHandler(fakeDeps);
  await handler({
    params: { name: 'sync_tools', arguments: { dry_run: true } }
  });

  assert.deepEqual(receivedArgs, ['--dry-run']);
});

test('handler mcp_add passes args array to script', async () => {
  const { createCallToolHandler } = await import('../../../runtime/mcp/handlers.mjs');
  const { toToolResponse, toolError } = await import('../../../runtime/mcp/tool-response.mjs');

  let capturedArgs = null;

  const fakeDeps = {
    runScript: (script, args) => {
      capturedArgs = args;
      return { success: true, output: 'ok', error: null };
    },
    validateName: () => {},
    validateNumber: () => {},
    isCommandNameSafe: () => true,
    resolveEffectiveOutcomeContract: () => ({ outcomeId: 'test.outcome' }),
    toToolResponse,
    toolError,
  };

  const handler = createCallToolHandler(fakeDeps);
  await handler({
    params: {
      name: 'mcp_add',
      arguments: { name: 'myserver', command: 'node', args: ['server.js', '--flag'] }
    }
  });

  assert.deepEqual(capturedArgs, ['add', 'myserver', 'node', 'server.js', '--flag']);
});

test('handler success response uses toToolResponse', async () => {
  const { createCallToolHandler } = await import('../../../runtime/mcp/handlers.mjs');
  const { toToolResponse, toolError } = await import('../../../runtime/mcp/tool-response.mjs');

  const fakeDeps = {
    runScript: () => ({ success: true, output: 'operation successful', error: null }),
    validateName: () => {},
    validateNumber: () => {},
    isCommandNameSafe: () => true,
    resolveEffectiveOutcomeContract: () => ({ outcomeId: 'test.outcome' }),
    toToolResponse,
    toolError,
  };

  const handler = createCallToolHandler(fakeDeps);
  const result = await handler({
    params: { name: 'list_tools', arguments: {} }
  });

  assert.equal(result.isError, undefined);
  assert.match(result.content[0].text, /operation successful/);
});

// --- Slice 2: Runtime prerequisite helper injection tests ---

test('assertRuntimePrereqsWith passes when bash check succeeds', async () => {
  const { assertRuntimePrereqsWith } = await import('../../../runtime/mcp/runtime-prereqs.mjs');

  assert.doesNotThrow(() => {
    assertRuntimePrereqsWith(() => 'bash');
  });
});

test('assertRuntimePrereqsWith throws helpful error when bash unavailable', async () => {
  const { assertRuntimePrereqsWith } = await import('../../../runtime/mcp/runtime-prereqs.mjs');

  // Pass 'local-cli' explicitly so the test is independent of the runtime environment
  // (AI_CONFIG_OS_REMOTE_EXECUTOR_URL / AI_CONFIG_OS_RUNTIME_MODE env vars).
  assert.throws(
    () => {
      assertRuntimePrereqsWith(() => {
        throw new Error('spawn failed');
      }, 'local-cli');
    },
    /runtime requires bash on PATH/
  );
});

test('assertRuntimePrereqsWith checks bash using expected invocation', async () => {
  const { assertRuntimePrereqsWith } = await import('../../../runtime/mcp/runtime-prereqs.mjs');

  let captured = null;

  // Pass 'local-cli' explicitly so the test captures the exec invocation regardless
  // of environment variables that might select a different runtime mode.
  assertRuntimePrereqsWith((cmd, args, opts) => {
    captured = { cmd, args, opts };
    return '';
  }, 'local-cli');

  assert.equal(captured.cmd, 'bash');
  assert.deepEqual(captured.args, ['-lc', 'command -v bash']);
  assert.equal(typeof captured.opts, 'object');
  assert.equal(captured.opts.encoding, 'utf8');
  assert.equal(captured.opts.timeout, 5000);
});

// --- Slice 1: Handler error semantics uniformity tests ---

test('handler context_cost returns tool error when validateNumber throws', async () => {
  const { createCallToolHandler } = await import('../../../runtime/mcp/handlers.mjs');
  const { toToolResponse, toolError } = await import('../../../runtime/mcp/tool-response.mjs');

  const fakeDeps = {
    runScript: () => ({ success: true, output: 'ok', error: null }),
    validateName: () => {},
    validateNumber: () => {
      throw new Error('threshold must be numeric');
    },
    isCommandNameSafe: () => true,
    resolveEffectiveOutcomeContract: () => ({ outcomeId: 'test.outcome' }),
    toToolResponse,
    toolError,
  };

  const handler = createCallToolHandler(fakeDeps);
  const result = await handler({
    params: { name: 'context_cost', arguments: { threshold: 'bad' } }
  });

  assert.equal(result.isError, true);
  assert.match(result.content[0].text, /threshold must be numeric/);
});

test('handler context_cost does not reject promise on numeric validation failure', async () => {
  const { createCallToolHandler } = await import('../../../runtime/mcp/handlers.mjs');
  const { toToolResponse, toolError } = await import('../../../runtime/mcp/tool-response.mjs');

  const fakeDeps = {
    runScript: () => ({ success: true, output: 'ok', error: null }),
    validateName: () => {},
    validateNumber: () => {
      throw new Error('bad threshold');
    },
    isCommandNameSafe: () => true,
    resolveEffectiveOutcomeContract: () => ({ outcomeId: 'test.outcome' }),
    toToolResponse,
    toolError,
  };

  const handler = createCallToolHandler(fakeDeps);

  // This should not reject; if it does, the test will fail
  const result = await handler({
    params: { name: 'context_cost', arguments: { threshold: 'oops' } }
  });

  assert.equal(result.isError, true);
});

test('handler context_cost success path passes validated threshold to script', async () => {
  const { createCallToolHandler } = await import('../../../runtime/mcp/handlers.mjs');
  const { toToolResponse, toolError } = await import('../../../runtime/mcp/tool-response.mjs');

  let capturedThreshold = null;

  const fakeDeps = {
    runScript: (script, args) => {
      // Capture the threshold passed to the script
      if (args && args.length > 1) {
        capturedThreshold = parseInt(args[1], 10);
      }
      return { success: true, output: 'ok', error: null };
    },
    validateName: () => {},
    validateNumber: (input, defaultValue) => {
      if (input === undefined) return defaultValue;
      if (typeof input !== 'number') throw new Error('threshold must be numeric');
      return input;
    },
    isCommandNameSafe: () => true,
    resolveEffectiveOutcomeContract: () => ({ outcomeId: 'test.outcome' }),
    toToolResponse,
    toolError,
  };

  const handler = createCallToolHandler(fakeDeps);
  await handler({
    params: { name: 'context_cost', arguments: { threshold: 5000 } }
  });

  assert.equal(capturedThreshold, 5000);
});


test('resolveEffectiveOutcomeContract uses runnable script paths in routes', async () => {
  const { resolveEffectiveOutcomeContract } = await import('../../../runtime/lib/outcome-resolver.mjs');

  const syncContract = resolveEffectiveOutcomeContract({ toolName: 'sync_tools', executionChannel: 'mcp' });
  assert.equal(syncContract.preferredRoute.id, 'runtime/sync.sh');

  const listContract = resolveEffectiveOutcomeContract({ toolName: 'list_tools', executionChannel: 'mcp' });
  assert.equal(listContract.preferredRoute.id, 'runtime/manifest.sh');

  assert.equal(syncContract.fallbackRoutes[0].id, 'runtime/manifest.sh');
  assert.equal(listContract.fallbackRoutes[0].id, 'runtime/sync.sh');
  assert.deepEqual(listContract.fallbackRoutes[0].args, ['--dry-run']);
});

test('resolveEffectiveOutcomeContract keeps route id path-only and places flags in args', async () => {
  const { resolveEffectiveOutcomeContract } = await import('../../../runtime/lib/outcome-resolver.mjs');

  const mcpList = resolveEffectiveOutcomeContract({ toolName: 'mcp_list', executionChannel: 'mcp' });
  assert.equal(mcpList.preferredRoute.id, 'runtime/adapters/mcp-adapter.sh');
  assert.deepEqual(mcpList.preferredRoute.args, ['list']);
  assert.equal(mcpList.preferredRoute.id.includes(' '), false);

  const mcpAdd = resolveEffectiveOutcomeContract({ toolName: 'mcp_add', executionChannel: 'mcp' });
  assert.equal(mcpAdd.preferredRoute.id, 'runtime/adapters/mcp-adapter.sh');
  assert.deepEqual(mcpAdd.preferredRoute.args, ['add']);
  assert.equal(mcpAdd.preferredRoute.id.includes(' '), false);

  const mcpRemove = resolveEffectiveOutcomeContract({ toolName: 'mcp_remove', executionChannel: 'mcp' });
  assert.equal(mcpRemove.preferredRoute.id, 'runtime/adapters/mcp-adapter.sh');
  assert.deepEqual(mcpRemove.preferredRoute.args, ['remove']);
  assert.equal(mcpRemove.preferredRoute.id.includes(' '), false);
});

test('resolveEffectiveOutcomeContract returns preferred route for known tool', async () => {
  const { resolveEffectiveOutcomeContract } = await import('../../../runtime/lib/outcome-resolver.mjs');

  const contract = resolveEffectiveOutcomeContract({ toolName: 'list_tools', executionChannel: 'mcp' });

  assert.equal(contract.outcomeId, 'runtime.list-tools');
  assert.ok(contract.preferredRoute);
  assert.equal(Array.isArray(contract.availableRoutes), true);
  assert.equal(contract.routeScoringProfileSource, 'synthetic-static');
  assert.deepEqual(contract.routeScoringProfileSynthetic, contract.capabilityProfile);
});

test('handler resolve_outcome_contract returns contract JSON', async () => {
  const { createCallToolHandler } = await import('../../../runtime/mcp/handlers.mjs');
  const { toToolResponse, toolError } = await import('../../../runtime/mcp/tool-response.mjs');

  const fakeDeps = {
    runScript: () => ({ success: true, output: 'ok', error: null }),
    validateName: () => {},
    validateNumber: () => {},
    isCommandNameSafe: () => true,
    resolveEffectiveOutcomeContract: ({ toolName }) => ({ toolName, outcomeId: 'runtime.mock', availableRoutes: [] }),
    toToolResponse,
    toolError,
  };

  const handler = createCallToolHandler(fakeDeps);
  const result = await handler({
    params: { name: 'resolve_outcome_contract', arguments: { tool_name: 'list_tools' } }
  });

  assert.equal(result.isError, undefined);
  assert.match(result.content[0].text, /runtime.mock/);
  assert.match(result.content[0].text, /list_tools/);
});
