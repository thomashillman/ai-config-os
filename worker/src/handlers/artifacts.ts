import { jsonResponse, notFound, versionedCachedResponse } from '../http';
import type { Env } from '../types';

export type RegistryLike = {
  version: string;
  built_at?: string;
  skills: unknown[];
};

function readAsObject(payload: unknown): Record<string, unknown> | null {
  if (typeof payload !== 'object' || payload === null || Array.isArray(payload)) {
    return null;
  }
  return payload as Record<string, unknown>;
}

export async function readLatestVersion(env: Env, registry: RegistryLike): Promise<string | Response> {
  if (!env.MANIFEST_KV) {
    return registry.version;
  }

  const version = await env.MANIFEST_KV.get('latest');
  if (typeof version !== 'string' || version.length === 0) {
    return jsonResponse({ error: 'Latest manifest version pointer missing' }, 503);
  }

  return version;
}

export async function readArtifactJson(env: Env, key: string): Promise<unknown | Response> {
  if (!env.ARTEFACTS_R2) {
    return jsonResponse({ error: 'Manifest artefact storage is not configured' }, 503);
  }

  const object = await env.ARTEFACTS_R2.get(key);
  if (!object) {
    return notFound(`Artifact not found for key '${key}'`);
  }

  const text = await object.text();
  try {
    return JSON.parse(text);
  } catch {
    return jsonResponse({ error: `Artifact '${key}' contains invalid JSON` }, 502);
  }
}

export function handleHealth(env: Env, registry: RegistryLike): Response {
  return jsonResponse({
    status: 'ok',
    version: registry.version,
    built_at: registry.built_at,
    environment: env.ENVIRONMENT ?? 'unknown',
  });
}

export async function handleManifestLatest(env: Env, registry: RegistryLike): Promise<Response> {
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
  if (manifest instanceof Response) {
    return manifest;
  }

  // Return manifest directly with immutable cache headers
  return versionedCachedResponse(manifest, version);
}

export async function handleVersionedArtifact(env: Env, version: string, artifactName: string): Promise<Response> {
  const key = `manifests/${version}/${artifactName}`;
  const artifact = await readArtifactJson(env, key);
  if (artifact instanceof Response) {
    return artifact;
  }

  return jsonResponse({ version, key, artifact });
}

export async function handleLatestArtifact(env: Env, registry: RegistryLike, artifactName: string): Promise<Response> {
  const version = await readLatestVersion(env, registry);
  if (version instanceof Response) {
    return version;
  }

  return handleVersionedArtifact(env, version, artifactName);
}

export async function handleEffectiveContractPreview(env: Env, registry: RegistryLike): Promise<Response> {
  const version = await readLatestVersion(env, registry);
  if (version instanceof Response) {
    return version;
  }

  const outcomesKey = `manifests/${version}/outcomes.json`;
  const routesKey = `manifests/${version}/routes.json`;
  const toolsKey = `manifests/${version}/tools.json`;

  const outcomes = await readArtifactJson(env, outcomesKey);
  if (outcomes instanceof Response) return outcomes;

  const routes = await readArtifactJson(env, routesKey);
  if (routes instanceof Response) return routes;

  const tools = await readArtifactJson(env, toolsKey);
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

export function handleClientLatest(client: string, registry: RegistryLike, pluginJson: unknown): Response {
  if (client !== 'claude-code') {
    return notFound(`Client '${client}' not found. Available: claude-code`);
  }

  return jsonResponse({
    version: registry.version,
    built_at: registry.built_at,
    client: 'claude-code',
    plugin_json: pluginJson,
    skills: registry.skills,
    note: 'Fetch individual skill content via GET /v1/skill/:skillId',
  });
}

export function handleSkill(skillId: string, registry: RegistryLike): Response {
  const skill = registry.skills.find((entry) => {
    const obj = readAsObject(entry);
    return obj?.id === skillId;
  });

  if (!skill) {
    return notFound(`Skill '${skillId}' not found`);
  }

  return jsonResponse({
    version: registry.version,
    skill,
  });
}

// Capability handlers have moved to handlers/capabilities.ts
// This file retains artifact/manifest/skill handlers only.
