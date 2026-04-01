import { jsonResponse, notFound, versionedCachedResponse } from "../http";
import type { Env } from "../types";

export type RegistryLike = {
  version: string;
  built_at?: string;
  skills: unknown[];
};

function readAsObject(payload: unknown): Record<string, unknown> | null {
  if (
    typeof payload !== "object" ||
    payload === null ||
    Array.isArray(payload)
  ) {
    return null;
  }
  return payload as Record<string, unknown>;
}

/**
 * Registry skill entries include normalised `resource_budget` from compile.
 * Kept in the Worker package (no import from runtime/) so test harnesses that
 * transpile worker/src to a temp tree do not need to copy runtime modules.
 */
function getResourceBudgetMetaFromRegistrySkill(skill: unknown): {
  mode: string;
  normalized: Record<string, unknown>;
} | null {
  const o = readAsObject(skill);
  if (!o) return null;
  const raw = o.resource_budget;
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return null;
  const rb = raw as Record<string, unknown>;
  if (typeof rb.mode !== "string") return null;
  return { mode: rb.mode, normalized: rb };
}

export async function readLatestVersion(
  env: Env,
  registry: RegistryLike,
): Promise<string | Response> {
  if (!env.MANIFEST_KV) {
    return registry.version;
  }

  const version = await env.MANIFEST_KV.get("latest");
  if (typeof version !== "string" || version.length === 0) {
    // Fallback to registry version if 'latest' key is missing in KV
    return registry.version;
  }

  return version;
}

export async function readArtifactJson(
  env: Env,
  key: string,
): Promise<unknown | Response> {
  if (!env.ARTEFACTS_R2) {
    return jsonResponse(
      { error: "Manifest artefact storage is not configured" },
      503,
    );
  }

  const object = await env.ARTEFACTS_R2.get(key);
  if (!object) {
    return notFound(`Artifact not found for key '${key}'`);
  }

  const text = await object.text();
  try {
    return JSON.parse(text);
  } catch {
    return jsonResponse(
      { error: `Artifact '${key}' contains invalid JSON` },
      502,
    );
  }
}

export function handleHealth(env: Env, registry: RegistryLike): Response {
  return jsonResponse({
    status: "ok",
    version: registry.version,
    built_at: registry.built_at,
    environment: env.ENVIRONMENT ?? "unknown",
  });
}

export async function handleManifestLatest(
  env: Env,
  registry: RegistryLike,
): Promise<Response> {
  if (!env.MANIFEST_KV || !env.ARTEFACTS_R2) {
    // Fallback: return registry directly, cacheable by version
    return versionedCachedResponse(registry, registry.version);
  }

  const version = await readLatestVersion(env, registry);
  if (version instanceof Response) {
    return version;
  }

  const key = `manifests/${version}/manifest.json`;
  const manifest = await readArtifactJson(env, key);
  // If artifact fetch fails, fall back to registry version
  if (manifest instanceof Response) {
    return versionedCachedResponse(registry, registry.version);
  }

  // Return manifest directly with immutable cache headers
  return versionedCachedResponse(manifest, version);
}

export async function handleVersionedArtifact(
  env: Env,
  version: string,
  artifactName: string,
): Promise<Response> {
  const key = `manifests/${version}/${artifactName}`;
  const artifact = await readArtifactJson(env, key);
  if (artifact instanceof Response) {
    return artifact;
  }

  return jsonResponse({ version, key, artifact });
}

export async function handleLatestArtifact(
  env: Env,
  registry: RegistryLike,
  artifactName: string,
): Promise<Response> {
  const version = await readLatestVersion(env, registry);
  if (version instanceof Response) {
    return version;
  }

  return handleVersionedArtifact(env, version, artifactName);
}

export async function handleEffectiveContractPreview(
  env: Env,
  registry: RegistryLike,
): Promise<Response> {
  const version = await readLatestVersion(env, registry);
  if (version instanceof Response) {
    return version;
  }

  const outcomesKey = `manifests/${version}/outcomes.json`;
  const routesKey = `manifests/${version}/routes.json`;
  const toolsKey = `manifests/${version}/tools.json`;

  const [outcomes, routes, tools] = await Promise.all([
    readArtifactJson(env, outcomesKey),
    readArtifactJson(env, routesKey),
    readArtifactJson(env, toolsKey),
  ]);
  if (outcomes instanceof Response) return outcomes;
  if (routes instanceof Response) return routes;
  if (tools instanceof Response) return tools;

  return jsonResponse({
    version,
    sources: {
      outcomes: outcomesKey,
      routes: routesKey,
      tools: toolsKey,
    },
    effective_contract: {
      outcomes,
      routes,
      tools,
    },
  });
}

export function handleClientLatest(
  client: string,
  registry: RegistryLike,
  pluginJson: unknown,
): Response {
  if (client !== "claude-code") {
    return notFound(`Client '${client}' not found. Available: claude-code`);
  }

  return versionedCachedResponse(
    {
      version: registry.version,
      built_at: registry.built_at,
      client: "claude-code",
      plugin_json: pluginJson,
      skills: registry.skills,
      note: "Fetch individual skill content via GET /v1/skill/:skillId",
    },
    registry.version,
  );
}

export function handleSkill(skillId: string, registry: RegistryLike): Response {
  const skill = registry.skills.find((entry) => {
    const obj = readAsObject(entry);
    return obj?.id === skillId;
  });

  if (!skill) {
    return notFound(`Skill '${skillId}' not found`);
  }

  const resourceBudgetMeta = getResourceBudgetMetaFromRegistrySkill(skill);

  return jsonResponse({
    version: registry.version,
    skill,
    ...(resourceBudgetMeta
      ? { resource_budget_meta: resourceBudgetMeta }
      : {}),
  });
}

/**
 * Serve complete skills package (file contents embedded) from KV.
 * Used by materialise.sh bootstrap for fast session startup.
 * KV key: claude-code-package:latest or claude-code-package:<version>
 */
export async function handleClientPackage(
  client: string,
  env: Env,
): Promise<Response> {
  if (client !== "claude-code") {
    return notFound(`Client '${client}' not found. Available: claude-code`);
  }

  if (!env.MANIFEST_KV) {
    return jsonResponse(
      { error: "Skills package storage not configured" },
      503,
    );
  }

  // Fetch from KV: skills package with all file contents embedded
  const pkg = await env.MANIFEST_KV.get("claude-code-package:latest");

  if (!pkg) {
    return notFound(
      "Skills package not found. Trigger a release build to populate KV.",
    );
  }

  // Parse and validate
  let pkgData;
  try {
    pkgData = JSON.parse(pkg);
  } catch (err) {
    return jsonResponse({ error: "Skills package contains invalid JSON" }, 502);
  }

  if (!pkgData.version || !pkgData.skills) {
    return jsonResponse(
      { error: "Skills package missing required fields (version, skills)" },
      502,
    );
  }

  // Return with immutable cache headers (version is immutable by contract)
  return versionedCachedResponse(pkgData, pkgData.version);
}

// Capability handlers have moved to handlers/capabilities.ts
// This file retains artifact/manifest/skill handlers only.
