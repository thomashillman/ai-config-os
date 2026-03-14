import { validateContract } from '../../shared/contracts/validate.mjs';

function clone(value) {
  return JSON.parse(JSON.stringify(value));
}

function assertObject(name, value) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new Error(`${name} must be an object`);
  }
}

function assertNonEmptyString(name, value) {
  if (typeof value !== 'string' || value.trim().length === 0) {
    throw new Error(`${name} is required`);
  }
}

export function createContinuationPackage({
  task,
  effectiveExecutionContract,
  handoffTokenId,
  createdAt = new Date().toISOString(),
} = {}) {
  assertObject('task', task);
  assertObject('effectiveExecutionContract', effectiveExecutionContract);
  assertNonEmptyString('handoffTokenId', handoffTokenId);
  assertNonEmptyString('createdAt', createdAt);

  const validatedTask = validateContract('portableTaskObject', clone(task));
  const validatedContract = validateContract('effectiveExecutionContract', clone(effectiveExecutionContract));

  if (validatedTask.task_id !== validatedContract.task_id) {
    throw new Error('createContinuationPackage task_id mismatch between task and effectiveExecutionContract');
  }

  if (validatedTask.task_type !== validatedContract.task_type) {
    throw new Error('createContinuationPackage task_type mismatch between task and effectiveExecutionContract');
  }

  return validateContract('continuationPackage', {
    schema_version: '1.0.0',
    task: validatedTask,
    effective_execution_contract: validatedContract,
    handoff_token_id: handoffTokenId,
    created_at: createdAt,
  });
}
