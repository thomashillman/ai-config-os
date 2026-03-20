export const RUNTIME_ACTION_MATRIX = Object.freeze({
  list_tools: { classification: 'script-wrapper' },
  sync_tools: { classification: 'script-wrapper' },
  get_config: { classification: 'script-wrapper' },
  skill_stats: { classification: 'script-wrapper' },
  context_cost: { classification: 'script-wrapper' },
  validate_all: { classification: 'script-wrapper' },
  resolve_outcome_contract: { classification: 'shared-service' },
  task_start_review_repository: { classification: 'shared-service' },
  task_resume_review_repository: { classification: 'shared-service' },
  task_get_readiness: { classification: 'shared-service' },
  mcp_list: { classification: 'surface-only' },
  mcp_add: { classification: 'surface-only' },
  mcp_remove: { classification: 'surface-only' },
});

export function getRuntimeActionMeta(actionName) {
  return RUNTIME_ACTION_MATRIX[actionName] ?? null;
}

export function isScriptWrapperAction(actionName) {
  return getRuntimeActionMeta(actionName)?.classification === 'script-wrapper';
}

