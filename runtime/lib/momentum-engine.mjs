// Momentum Engine — central orchestrator that wires narrator, observer, shelf,
// intent lexicon, and reflector into the task control plane.
//
// This is the integration seam: callers get a single object with methods that
// coordinate all momentum subsystems. The MCP handler and task skills both
// consume this interface.

import { createNarrator } from './momentum-narrator.mjs';
import { MomentumObserver } from './momentum-observer.mjs';
import { buildMomentumShelf } from './momentum-shelf.mjs';
import { resolveIntent } from './intent-lexicon.mjs';
import { reflect } from './momentum-reflector.mjs';
import { templates as defaultTemplates, TEMPLATE_VERSION } from './momentum-templates.mjs';
import { definitions as defaultDefinitions } from './intent-lexicon-definitions.mjs';

function assertObject(name, value) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new Error(`${name} must be an object`);
  }
}

function assertString(name, value) {
  if (typeof value !== 'string' || value.trim().length === 0) {
    throw new Error(`${name} must be a non-empty string`);
  }
}

/**
 * Create a MomentumEngine instance.
 *
 * @param {object} deps
 * @param {object} deps.taskStore - TaskStore instance (must expose progressEvents)
 * @param {object} [deps.templates] - Custom narration templates (default: built-in)
 * @param {Array}  [deps.intentDefinitions] - Custom intent definitions (default: built-in)
 * @returns {MomentumEngine}
 */
export function createMomentumEngine({ taskStore, templates, intentDefinitions } = {}) {
  assertObject('taskStore', taskStore);

  const progressEventStore = taskStore.progressEvents;
  if (!progressEventStore || typeof progressEventStore.append !== 'function') {
    throw new Error('taskStore must expose a progressEvents property (ProgressEventStore)');
  }

  const activeTemplates = templates || defaultTemplates;
  const activeDefinitions = intentDefinitions || defaultDefinitions;

  const narrator = createNarrator({ templates: activeTemplates });
  const observer = new MomentumObserver({ progressEventStore });

  return {
    /** The narrator instance — for direct use in journey functions. */
    narrator,

    /** The observer instance — for direct use in journey functions. */
    observer,

    /** Current template version. */
    templateVersion: narrator.templateVersion,

    /**
     * Resolve a natural language phrase to a task type and route hints.
     * @param {string} phrase
     * @returns {{ resolved: boolean, taskType?: string, routeHints?: object, goal?: string, confidence?: number, suggestions?: Array }}
     */
    resolveIntent(phrase) {
      return resolveIntent(phrase, { definitions: activeDefinitions });
    },

    /**
     * Narrate a task start event and record the observation.
     * @param {object} task - PortableTaskObject
     * @param {object} contract - EffectiveExecutionContract
     * @returns {object} Validated NarrationOutput
     */
    narrateStart(task, contract) {
      assertObject('task', task);
      const narration = narrator.onStart(task, contract);
      observer.recordNarration({
        taskId: task.task_id,
        narrationPoint: 'onStart',
        templateVersion: narrator.templateVersion,
        narratorOutput: narration,
        taskSnapshot: task,
      });
      return narration;
    },

    /**
     * Narrate a task resume event and record the observation.
     * @param {object} task - PortableTaskObject
     * @param {object} contract - EffectiveExecutionContract
     * @param {object|null} previousContract - Prior session's contract (for upgrade detection)
     * @returns {object} Validated NarrationOutput
     */
    narrateResume(task, contract, previousContract) {
      assertObject('task', task);
      const narration = narrator.onResume(task, contract, previousContract);
      observer.recordNarration({
        taskId: task.task_id,
        narrationPoint: 'onResume',
        templateVersion: narrator.templateVersion,
        narratorOutput: narration,
        taskSnapshot: task,
      });
      return narration;
    },

    /**
     * Narrate a finding evolution (confidence change) and record the observation.
     * @param {object} task
     * @param {object} finding
     * @param {string} previousConfidence
     * @param {string} newConfidence
     * @returns {object} Validated NarrationOutput
     */
    narrateFindingEvolved(task, finding, previousConfidence, newConfidence) {
      assertObject('task', task);
      assertObject('finding', finding);
      const narration = narrator.onFindingEvolved(task, finding, previousConfidence, newConfidence);
      observer.recordNarration({
        taskId: task.task_id,
        narrationPoint: 'onFindingEvolved',
        templateVersion: narrator.templateVersion,
        narratorOutput: narration,
        taskSnapshot: task,
      });
      return narration;
    },

    /**
     * Narrate an upgrade availability prompt and record the observation.
     * @param {object} task
     * @param {object} currentContract
     * @param {object|null} availableContract
     * @returns {object} Validated NarrationOutput
     */
    narrateUpgradeAvailable(task, currentContract, availableContract) {
      assertObject('task', task);
      const narration = narrator.onUpgradeAvailable(task, currentContract, availableContract);
      observer.recordNarration({
        taskId: task.task_id,
        narrationPoint: 'onUpgradeAvailable',
        templateVersion: narrator.templateVersion,
        narratorOutput: narration,
        taskSnapshot: task,
      });
      return narration;
    },

    /**
     * Record a user's response to a narration event.
     * @param {object} params
     * @param {string} params.taskId
     * @param {string} params.narrationEventId - The event_id from the narration_shown event
     * @param {string} params.responseType - engaged | ignored | follow_up | changed_course | accepted_upgrade | declined_upgrade
     * @param {number} [params.timeToActionMs]
     * @param {string} [params.followUpText]
     * @returns {object} ProgressEvent
     */
    recordUserResponse(params) {
      assertObject('params', params);
      assertString('params.taskId', params.taskId);
      return observer.recordResponse(params);
    },

    /**
     * Build the momentum shelf — ranked continuable tasks.
     * @param {object} params
     * @param {Array} params.tasks - Array of PortableTaskObjects
     * @param {object} [params.currentCapabilities]
     * @returns {Array} Ranked shelf entries
     */
    buildShelf({ tasks, currentCapabilities } = {}) {
      return buildMomentumShelf({ tasks, currentCapabilities, narrator });
    },

    /**
     * Get observation pairs for a task (narration + response).
     * @param {string} taskId
     * @returns {Array<{ narration, response }>}
     */
    getObservations(taskId) {
      assertString('taskId', taskId);
      return observer.getObservationPairs({ taskId });
    },

    /**
     * Run the reflector to analyze narration effectiveness.
     * @param {object} [params]
     * @param {string} [params.since] - ISO 8601 timestamp; defaults to 24h ago
     * @param {number} [params.limit] - Max observations to analyze
     * @returns {{ report: object, applied: Array }}
     */
    reflect(params = {}) {
      const since = params.since || new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
      const limit = params.limit || 200;

      const observations = observer.getRecentObservations({ since, limit });

      return reflect({
        observations,
        currentTemplates: activeTemplates,
        currentDefinitions: activeDefinitions,
      });
    },

    /**
     * Apply a reflector insight to the active templates or definitions.
     * Returns the applied change or null if confidence is too low.
     *
     * @param {object} insight - A single insight from reflect().report.insights
     * @param {object} [options]
     * @param {number} [options.minConfidence=0.7] - Minimum confidence to auto-apply
     * @returns {{ applied: boolean, target: string, reason: string }}
     */
    applyInsight(insight, options = {}) {
      assertObject('insight', insight);
      const minConfidence = options.minConfidence ?? 0.7;

      if (!insight.suggestion) {
        return { applied: false, target: null, reason: 'No suggestion in insight' };
      }

      const confidence = insight.suggestion.confidence ?? 0;
      if (confidence < minConfidence) {
        return {
          applied: false,
          target: insight.suggestion.target || null,
          reason: `Confidence ${confidence.toFixed(2)} below threshold ${minConfidence.toFixed(2)}`,
        };
      }

      // Intent coverage: add new patterns to the active definitions
      if (insight.type === 'intent_coverage' && insight.suggestion.action === 'add_patterns') {
        const patterns = insight.suggestion.patterns;
        const taskType = insight.suggestion.taskType;
        if (Array.isArray(patterns) && patterns.length > 0 && taskType) {
          activeDefinitions.push({
            patterns,
            taskType,
            routeHints: {},
            goal: patterns[0],
            confidence: 0.7,
          });
          return {
            applied: true,
            target: 'definitions',
            reason: `Added ${patterns.length} pattern(s) for task type '${taskType}'`,
          };
        }
      }

      // Template changes: replace a template string
      if (insight.type === 'template_effectiveness' && insight.suggestion.target && insight.suggestion.proposed) {
        const path = insight.suggestion.target.split('.');
        if (path.length === 2 && path[0] === 'templates') {
          const key = path[1];
          if (activeTemplates[key] && typeof insight.suggestion.proposed === 'object') {
            Object.assign(activeTemplates[key], insight.suggestion.proposed);
            return {
              applied: true,
              target: insight.suggestion.target,
              reason: `Updated template for '${key}'`,
            };
          }
        }
      }

      return {
        applied: false,
        target: insight.suggestion.target || null,
        reason: 'Insight type or suggestion shape not supported for auto-apply',
      };
    },
  };
}
