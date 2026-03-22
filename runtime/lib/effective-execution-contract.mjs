import { validateContract } from '../../shared/contracts/validate.mjs';
import {
  resolveTaskRoute,
  resolveTaskRouteFromRuntime as defaultResolveTaskRouteFromRuntime,
} from './task-route-resolver.mjs';
import { createCachedTaskRouteInputDefinitionsLoader } from './task-route-input-loader.mjs';
import { getUpgradeExplanation } from './upgrade-explanations.mjs';

const defaultRouteInputDefinitionsLoader = createCachedTaskRouteInputDefinitionsLoader();

function resolveRequiredInputs({ taskType, routeId, routeInputDefinitionsLoader }) {
  const definitions = routeInputDefinitionsLoader();
  const taskRouteInputs = definitions?.taskTypes?.[taskType]?.routes;
  const requiredInputs = taskRouteInputs?.[routeId]?.required_inputs;
  if (!Array.isArray(requiredInputs)) {
    throw new Error(`No required input definition for task '${taskType}' route '${routeId}'`);
  }
  return [...requiredInputs];
}

function validateResolutionShape(resolution, contextLabel) {
  if (!resolution || typeof resolution !== 'object') {
    throw new Error(`${contextLabel} returned invalid resolution object`);
  }
  if (!resolution.selected_route || typeof resolution.selected_route !== 'object') {
    throw new Error(`${contextLabel} returned resolution without selected_route`);
  }
}

function buildStrongerHostGuidance({ selectedRoute, candidates }) {
  if (selectedRoute.equivalence_level === 'equal') {
    return undefined;
  }

  const strongerCandidate = candidates.find((candidate) => candidate.equivalence_level === 'equal');
  if (!strongerCandidate) {
    return undefined;
  }

  const missingCapabilities = strongerCandidate.missing_capabilities || [];
  if (missingCapabilities.length === 0) {
    return `Prefer '${strongerCandidate.route_id}' for stronger verification equivalence.`;
  }

  return `Upgrade to route '${strongerCandidate.route_id}' when host supports: ${missingCapabilities.join(', ')}.`;
}

function buildUpgradeExplanation({ selectedRoute, candidates }) {
  if (selectedRoute.equivalence_level === 'equal') {
    return undefined;
  }

  const strongerCandidate = candidates.find((candidate) => candidate.equivalence_level === 'equal');
  if (!strongerCandidate) {
    return undefined;
  }

  const explanation = getUpgradeExplanation(selectedRoute.route_id, strongerCandidate.route_id);
  if (!explanation) return undefined;

  return { ...explanation, stronger_route_id: strongerCandidate.route_id };
}

export function buildEffectiveExecutionContract({
  taskId,
  taskType,
  capabilityProfile,
  computedAt = new Date().toISOString(),
  routeInputDefinitionsLoader = defaultRouteInputDefinitionsLoader,
} = {}) {
  if (!taskId) throw new Error('buildEffectiveExecutionContract requires taskId');
  if (!taskType) throw new Error('buildEffectiveExecutionContract requires taskType');

  const resolution = resolveTaskRoute({ taskType, capabilityProfile });
  validateResolutionShape(resolution, 'resolveTaskRoute');
  const selectedRoute = resolution.selected_route;
  const requiredInputs = resolveRequiredInputs({
    taskType,
    routeId: selectedRoute.route_id,
    routeInputDefinitionsLoader,
  });
  const strongerHostGuidance = buildStrongerHostGuidance({
    selectedRoute,
    candidates: resolution.candidates,
  });
  const upgradeExplanation = buildUpgradeExplanation({
    selectedRoute,
    candidates: resolution.candidates,
  });

  const contract = {
    schema_version: '1.0.0',
    task_id: taskId,
    task_type: taskType,
    selected_route: selectedRoute,
    equivalence_level: selectedRoute.equivalence_level,
    missing_capabilities: selectedRoute.missing_capabilities || [],
    required_inputs: requiredInputs,
    computed_at: computedAt,
  };

  if (strongerHostGuidance) {
    contract.stronger_host_guidance = strongerHostGuidance;
  }
  if (upgradeExplanation) {
    contract.upgrade_explanation = upgradeExplanation;
  }

  return validateContract('effectiveExecutionContract', contract);
}

export async function buildEffectiveExecutionContractFromRuntime({
  taskId,
  taskType,
  computedAt = new Date().toISOString(),
  routeInputDefinitionsLoader = defaultRouteInputDefinitionsLoader,
  resolveTaskRouteFromRuntime = defaultResolveTaskRouteFromRuntime,
} = {}) {
  if (!taskId) throw new Error('buildEffectiveExecutionContractFromRuntime requires taskId');
  if (!taskType) throw new Error('buildEffectiveExecutionContractFromRuntime requires taskType');

  const resolution = await resolveTaskRouteFromRuntime({ taskType });
  validateResolutionShape(resolution, 'resolveTaskRouteFromRuntime');
  const selectedRoute = resolution.selected_route;
  const requiredInputs = resolveRequiredInputs({
    taskType,
    routeId: selectedRoute.route_id,
    routeInputDefinitionsLoader,
  });
  const candidates = resolution.candidates || [selectedRoute];
  const strongerHostGuidance = buildStrongerHostGuidance({
    selectedRoute,
    candidates,
  });
  const upgradeExplanation = buildUpgradeExplanation({
    selectedRoute,
    candidates,
  });

  const contract = {
    schema_version: '1.0.0',
    task_id: taskId,
    task_type: taskType,
    selected_route: selectedRoute,
    equivalence_level: selectedRoute.equivalence_level,
    missing_capabilities: selectedRoute.missing_capabilities || [],
    required_inputs: requiredInputs,
    computed_at: computedAt,
  };

  if (strongerHostGuidance) {
    contract.stronger_host_guidance = strongerHostGuidance;
  }
  if (upgradeExplanation) {
    contract.upgrade_explanation = upgradeExplanation;
  }

  return validateContract('effectiveExecutionContract', contract);
}
