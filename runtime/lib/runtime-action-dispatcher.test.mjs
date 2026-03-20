import test from 'node:test';
import assert from 'node:assert/strict';
import {
  ActionValidationError,
  UnknownActionError,
  createRuntimeActionDispatcher,
} from './runtime-action-dispatcher.mjs';
import { isScriptWrapperAction } from './runtime-action-matrix.mjs';

test('dispatches list_tools to manifest status command', () => {
  const calls = [];
  const dispatcher = createRuntimeActionDispatcher({
    runScript: (cmd, args = []) => {
      calls.push({ cmd, args });
      return { success: true, output: 'ok' };
    },
  });

  const result = dispatcher.dispatch('list_tools');
  assert.equal(result.success, true);
  assert.equal(result.actionName, 'list_tools');
  assert.deepEqual(calls, [{ cmd: 'runtime/manifest.sh', args: ['status'] }]);
});

test('normalizes sync_tools dry_run and context_cost threshold', () => {
  const calls = [];
  const dispatcher = createRuntimeActionDispatcher({
    runScript: (cmd, args = []) => {
      calls.push({ cmd, args });
      return { success: true, output: '' };
    },
    validateNumber: (value, fallback) => (value === undefined ? fallback : Number(value)),
  });

  const syncResult = dispatcher.dispatch('sync_tools', { dry_run: 1 });
  const costResult = dispatcher.dispatch('context_cost', { threshold: '1234' });

  assert.deepEqual(syncResult.normalizedArgs, { dry_run: true });
  assert.deepEqual(costResult.normalizedArgs, { threshold: 1234 });
  assert.deepEqual(calls, [
    { cmd: 'runtime/sync.sh', args: ['--dry-run'] },
    { cmd: 'ops/context-cost.sh', args: ['--threshold', '1234'] },
  ]);
});

test('throws typed error for unknown action', () => {
  const dispatcher = createRuntimeActionDispatcher({
    runScript: () => ({ success: true, output: '' }),
  });

  assert.throws(
    () => dispatcher.dispatch('does_not_exist'),
    (error) => error instanceof UnknownActionError
  );
});

test('throws validation error when non script-wrapper action is dispatched', () => {
  const dispatcher = createRuntimeActionDispatcher({
    runScript: () => ({ success: true, output: '' }),
  });
  assert.equal(isScriptWrapperAction('task_get_readiness'), false);

  assert.throws(
    () => dispatcher.dispatch('task_get_readiness'),
    (error) => error instanceof ActionValidationError
  );
});

test('rethrows numeric validation failures as ActionValidationError', () => {
  const dispatcher = createRuntimeActionDispatcher({
    runScript: () => ({ success: true, output: '' }),
    validateNumber: () => {
      throw new Error('threshold must be a number');
    },
  });

  assert.throws(
    () => dispatcher.dispatch('context_cost', { threshold: 'oops' }),
    (error) => error instanceof ActionValidationError && /threshold must be a number/.test(error.message)
  );
});

