import { getRuntimeActionMeta, isScriptWrapperAction } from './runtime-action-matrix.mjs';
import { parseRuntimeActionOutput } from './runtime-action-output.mjs';

export class UnknownActionError extends Error {
  constructor(actionName) {
    super(`Unknown runtime action '${actionName}'`);
    this.name = 'UnknownActionError';
  }
}

export class ActionValidationError extends Error {
  constructor(message) {
    super(message);
    this.name = 'ActionValidationError';
  }
}

function ensureObject(value) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    return {};
  }
  return value;
}

export function createRuntimeActionDispatcher({ runScript, validateNumber }) {
  if (typeof runScript !== 'function') {
    throw new Error('runScript must be a function');
  }

  const normalizeNumber = typeof validateNumber === 'function'
    ? validateNumber
    : (value, fallback) => (value ?? fallback);

  return {
    dispatch(actionName, actionArgs = {}) {
      const meta = getRuntimeActionMeta(actionName);
      if (!meta) {
        throw new UnknownActionError(actionName);
      }
      if (!isScriptWrapperAction(actionName)) {
        throw new ActionValidationError(`Action '${actionName}' is not a script-wrapper action`);
      }

      const args = ensureObject(actionArgs);
      let command = '';
      let commandArgs = [];
      let normalizedArgs = {};

      switch (actionName) {
        case 'list_tools':
          command = 'runtime/manifest.sh';
          commandArgs = ['status'];
          break;
        case 'sync_tools': {
          const dryRun = Boolean(args.dry_run);
          command = 'runtime/sync.sh';
          commandArgs = dryRun ? ['--dry-run'] : [];
          normalizedArgs = { dry_run: dryRun };
          break;
        }
        case 'get_config':
          command = 'shared/lib/config-merger.sh';
          break;
        case 'skill_stats':
          command = 'ops/skill-stats.sh';
          break;
        case 'context_cost': {
          let threshold;
          try {
            threshold = normalizeNumber(args.threshold, 2000);
          } catch (error) {
            throw new ActionValidationError(error instanceof Error ? error.message : 'Invalid threshold');
          }
          command = 'ops/context-cost.sh';
          commandArgs = ['--threshold', String(threshold)];
          normalizedArgs = { threshold };
          break;
        }
        case 'validate_all':
          command = 'ops/validate-all.sh';
          break;
        default:
          throw new UnknownActionError(actionName);
      }

      const result = runScript(command, commandArgs);
      const parsed = parseRuntimeActionOutput(actionName, result.output, { normalizedArgs });
      return {
        ...result,
        actionName,
        normalizedArgs,
        parsed,
      };
    },
  };
}

