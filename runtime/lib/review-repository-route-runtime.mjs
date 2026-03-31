import { createCachedTaskRouteDefinitionsLoader } from "./task-route-definition-loader.mjs";
import { createCachedTaskRouteInputDefinitionsLoader } from "./task-route-input-loader.mjs";

const TASK_TYPE = "review_repository";

const defaultRouteDefinitionsLoader = createCachedTaskRouteDefinitionsLoader();
const defaultRouteInputDefinitionsLoader =
  createCachedTaskRouteInputDefinitionsLoader();

let routeDefinitionsLoader = defaultRouteDefinitionsLoader;
let routeInputDefinitionsLoader = defaultRouteInputDefinitionsLoader;

export function setReviewRepositoryRouteRuntimeLoaders({
  routeDefinitionsLoader: nextRouteDefinitionsLoader,
  routeInputDefinitionsLoader: nextRouteInputDefinitionsLoader,
} = {}) {
  if (nextRouteDefinitionsLoader !== undefined) {
    if (typeof nextRouteDefinitionsLoader !== "function") {
      throw new TypeError(
        "setReviewRepositoryRouteRuntimeLoaders requires routeDefinitionsLoader function",
      );
    }
    routeDefinitionsLoader = nextRouteDefinitionsLoader;
  }

  if (nextRouteInputDefinitionsLoader !== undefined) {
    if (typeof nextRouteInputDefinitionsLoader !== "function") {
      throw new TypeError(
        "setReviewRepositoryRouteRuntimeLoaders requires routeInputDefinitionsLoader function",
      );
    }
    routeInputDefinitionsLoader = nextRouteInputDefinitionsLoader;
  }
}

export function resetReviewRepositoryRouteRuntimeLoaders() {
  routeDefinitionsLoader = defaultRouteDefinitionsLoader;
  routeInputDefinitionsLoader = defaultRouteInputDefinitionsLoader;
}

function getTaskDefinition() {
  const definitions = routeDefinitionsLoader();
  const taskDefinition = definitions.taskTypes?.[TASK_TYPE];
  if (!taskDefinition || !Array.isArray(taskDefinition.routes)) {
    throw new Error(`Task type '${TASK_TYPE}' is missing route definitions`);
  }
  return taskDefinition;
}

function getRouteInputMap() {
  const inputDefinitions = routeInputDefinitionsLoader();
  const routeMap = inputDefinitions.taskTypes?.[TASK_TYPE]?.routes;
  if (!routeMap || typeof routeMap !== "object") {
    throw new Error(
      `Task type '${TASK_TYPE}' is missing route input definitions`,
    );
  }
  return routeMap;
}

function hasCanonicalRoute(routeId) {
  return getTaskDefinition().routes.some((route) => route.route_id === routeId);
}

export function getReviewRepositoryRoutes() {
  return getTaskDefinition().routes.map((route) => ({ ...route }));
}

export function getRequiredInputsForReviewRepositoryRoute(routeId) {
  if (!routeId) {
    throw new Error(
      "getRequiredInputsForReviewRepositoryRoute requires routeId",
    );
  }

  if (!hasCanonicalRoute(routeId)) {
    throw new Error(`Unknown review_repository route '${routeId}'`);
  }

  const routeInputs = getRouteInputMap()[routeId];
  if (!routeInputs) {
    throw new Error(
      `Task type '${TASK_TYPE}' is missing required input definition for route '${routeId}'`,
    );
  }

  return [...routeInputs.required_inputs];
}

export function validateReviewRepositoryRouteInputs({ routeId, inputs } = {}) {
  if (!routeId) {
    throw new Error("validateReviewRepositoryRouteInputs requires routeId");
  }
  if (!inputs || typeof inputs !== "object" || Array.isArray(inputs)) {
    throw new Error(
      "validateReviewRepositoryRouteInputs requires inputs object",
    );
  }

  const requiredInputs = getRequiredInputsForReviewRepositoryRoute(routeId);
  const missing = requiredInputs.filter((field) => {
    const value = inputs[field];
    if (typeof value === "string") {
      return value.trim().length === 0;
    }
    return value === undefined || value === null;
  });

  if (missing.length > 0) {
    throw new Error(
      `review_repository route '${routeId}' missing required inputs: ${missing.join(", ")}`,
    );
  }
}
