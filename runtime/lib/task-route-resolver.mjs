import { validateContract } from "../../shared/contracts/validate.mjs";
import { createCapabilityProfileResolver } from "./capability-profile.mjs";
import { createCachedTaskRouteDefinitionsLoader } from "./task-route-definition-loader.mjs";

const EQUIVALENCE_WEIGHT = {
  equal: 1,
  upgrade: 0.85,
  degraded: 0.65,
};

const defaultLoader = createCachedTaskRouteDefinitionsLoader();
let definitionsLoader = defaultLoader;

const defaultCapabilityProfileResolver = createCapabilityProfileResolver();
let capabilityProfileResolver = defaultCapabilityProfileResolver;

export function setTaskRouteResolverLoader(loader) {
  if (typeof loader !== "function") {
    throw new TypeError(
      "setTaskRouteResolverLoader requires a function loader",
    );
  }
  definitionsLoader = loader;
}

export function resetTaskRouteResolverLoader() {
  definitionsLoader = defaultLoader;
}

export function setTaskRouteCapabilityProfileResolver(resolver) {
  if (!resolver || typeof resolver.getProfile !== "function") {
    throw new TypeError(
      "setTaskRouteCapabilityProfileResolver requires resolver.getProfile()",
    );
  }
  capabilityProfileResolver = resolver;
}

export function resetTaskRouteCapabilityProfileResolver() {
  capabilityProfileResolver = defaultCapabilityProfileResolver;
}

function normaliseCapabilityStatus(value) {
  if (value === true || value === "supported") return "supported";
  if (value === false || value === "unsupported") return "unsupported";
  return "unknown";
}

function collectMissing(requiredCapabilities, capabilityProfile) {
  return requiredCapabilities.filter((capability) => {
    const raw = capabilityProfile?.capabilities?.[capability];
    const status = typeof raw === "object" && raw !== null ? raw.status : raw;
    return normaliseCapabilityStatus(status) !== "supported";
  });
}

function scoreRoute(route, capabilityProfile, order) {
  const requiredCapabilities = Array.isArray(route.required_capabilities)
    ? route.required_capabilities
    : [];
  const missingCapabilities = collectMissing(
    requiredCapabilities,
    capabilityProfile,
  );
  const covered = requiredCapabilities.length - missingCapabilities.length;
  const coverage =
    requiredCapabilities.length === 0
      ? 1
      : covered / requiredCapabilities.length;
  const equivalenceWeight = EQUIVALENCE_WEIGHT[route.equivalence_level] ?? 0;

  return {
    route: validateContract("taskRouteDefinition", {
      schema_version: "1.0.0",
      route_id: route.route_id,
      equivalence_level: route.equivalence_level,
      required_capabilities: requiredCapabilities,
      missing_capabilities: missingCapabilities,
    }),
    score: Number((coverage * 0.7 + equivalenceWeight * 0.3).toFixed(4)),
    order,
  };
}

export function resolveTaskRoute({ taskType, capabilityProfile } = {}) {
  if (!taskType) {
    throw new Error("resolveTaskRoute requires taskType");
  }

  const { taskTypes } = definitionsLoader();
  const taskDefinition = taskTypes[taskType];
  if (!taskDefinition) {
    throw new Error(`Unknown task type: ${taskType}`);
  }

  if (
    !Array.isArray(taskDefinition.routes) ||
    taskDefinition.routes.length === 0
  ) {
    throw new Error(`Task type '${taskType}' has no route definitions`);
  }

  const candidates = taskDefinition.routes
    .map((route, order) => scoreRoute(route, capabilityProfile, order))
    .sort((a, b) => b.score - a.score || a.order - b.order);

  return {
    task_type: taskType,
    selected_route: candidates[0].route,
    candidates: candidates.map((candidate) => candidate.route),
  };
}

export async function resolveTaskRouteFromRuntime({ taskType } = {}) {
  const capabilityProfile = await capabilityProfileResolver.getProfile();
  return resolveTaskRoute({ taskType, capabilityProfile });
}
