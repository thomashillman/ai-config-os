import type { ExecutorEnv } from './index';
import type { ExecuteResponse } from './handler';

/**
 * Tool: health_check
 * Returns executor health status
 */
export async function healthCheck(): Promise<ExecuteResponse> {
  return {
    ok: true,
    status: 200,
    result: {
      status: 'healthy',
      service: 'executor',
      timestamp: new Date().toISOString(),
    },
  };
}

/**
 * Tool: list_phase1_tools
 * Returns list of supported Phase 1 tools
 */
export async function listPhase1Tools(): Promise<ExecuteResponse> {
  return {
    ok: true,
    status: 200,
    result: [
      'health_check',
      'list_phase1_tools',
      'get_skill_metadata',
      'get_artifact',
      'skill_stats_cached',
    ],
  };
}

/**
 * Tool: get_skill_metadata
 * Fetch skill metadata from KV
 *
 * Expected key format: skill:<skill-id>
 * Returns: parsed JSON object from KV
 */
export async function getSkillMetadata(skillId: string, env: ExecutorEnv): Promise<ExecuteResponse> {
  // Validate binding
  if (!env.MANIFEST_KV) {
    return {
      ok: false,
      status: 503,
      error: { code: 'SERVICE_UNAVAILABLE', message: 'MANIFEST_KV binding not configured' },
    };
  }

  // Validate skill ID (basic check: non-empty, no path traversal)
  if (!skillId || skillId.includes('/') || skillId.includes('..')) {
    return {
      ok: false,
      status: 400,
      error: { code: 'INVALID_REQUEST', message: 'Invalid skill ID' },
    };
  }

  try {
    const key = `skill:${skillId}`;
    const metadata = await env.MANIFEST_KV.get(key);

    if (!metadata) {
      return {
        ok: false,
        status: 404,
        error: { code: 'NOT_FOUND', message: `Skill '${skillId}' not found in KV` },
      };
    }

    // Parse JSON response
    let parsed: unknown;
    try {
      parsed = JSON.parse(metadata);
    } catch {
      return {
        ok: false,
        status: 500,
        error: { code: 'INVALID_DATA', message: 'Skill metadata is not valid JSON' },
      };
    }

    return {
      ok: true,
      status: 200,
      result: {
        skill: skillId,
        metadata: parsed,
        cached: true,
        timestamp: new Date().toISOString(),
      },
    };
  } catch (err) {
    const errorMessage = err instanceof Error ? err.message : 'Unknown error';
    return {
      ok: false,
      status: 500,
      error: { code: 'INTERNAL_ERROR', message: `KV read failed: ${errorMessage}` },
    };
  }
}

/**
 * Tool: get_artifact
 * Fetch versioned artifacts from R2
 *
 * Expected key format: manifests/<version>/<name>
 * Version must be semver (e.g., 1.0.0)
 * Name must be whitelisted (manifest.json, outcomes.json, routes.json, tools.json)
 */
export async function getArtifact(version: string, name: string, env: ExecutorEnv): Promise<ExecuteResponse> {
  // Validate binding
  if (!env.ARTEFACTS_R2) {
    return {
      ok: false,
      status: 503,
      error: { code: 'SERVICE_UNAVAILABLE', message: 'ARTEFACTS_R2 binding not configured' },
    };
  }

  // Validate version format (semver: X.Y.Z)
  if (!/^\d+\.\d+\.\d+$/.test(version)) {
    return {
      ok: false,
      status: 400,
      error: { code: 'INVALID_REQUEST', message: 'Version must be semver format (e.g., 1.0.0)' },
    };
  }

  // Whitelist artifact names (prevent path traversal)
  const allowedNames = new Set(['manifest.json', 'outcomes.json', 'routes.json', 'tools.json']);
  if (!allowedNames.has(name)) {
    return {
      ok: false,
      status: 400,
      error: {
        code: 'INVALID_REQUEST',
        message: `Artifact name must be one of: ${Array.from(allowedNames).join(', ')}`,
      },
    };
  }

  try {
    const key = `manifests/${version}/${name}`;
    const artifact = await env.ARTEFACTS_R2.get(key);

    // Not found
    if (!artifact) {
      return {
        ok: false,
        status: 404,
        error: { code: 'NOT_FOUND', message: `Artifact not found: ${key}` },
      };
    }

    // Read and parse
    let text: string;
    try {
      text = await artifact.text();
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'Unknown error';
      return {
        ok: false,
        status: 500,
        error: { code: 'READ_ERROR', message: `Failed to read artifact: ${errorMessage}` },
      };
    }

    // Parse JSON
    let parsed: unknown;
    try {
      parsed = JSON.parse(text);
    } catch {
      return {
        ok: false,
        status: 500,
        error: { code: 'INVALID_DATA', message: 'Artifact is not valid JSON' },
      };
    }

    return {
      ok: true,
      status: 200,
      result: {
        version,
        artifact: name,
        data: parsed,
        cached: true,
        timestamp: new Date().toISOString(),
      },
    };
  } catch (err) {
    const errorMessage = err instanceof Error ? err.message : 'Unknown error';
    return {
      ok: false,
      status: 500,
      error: { code: 'INTERNAL_ERROR', message: `R2 read failed: ${errorMessage}` },
    };
  }
}

/**
 * Tool: skill_stats_cached
 * Return pre-computed skill statistics from KV
 *
 * Expected key: stats:latest
 * Returns: pre-computed statistics object
 *
 * Note: Stats must be pre-computed and stored in KV by an external process.
 * This tool only retrieves them; it does not compute live metrics.
 */
export async function skillStatsCached(env: ExecutorEnv): Promise<ExecuteResponse> {
  // Validate binding
  if (!env.MANIFEST_KV) {
    return {
      ok: false,
      status: 503,
      error: { code: 'SERVICE_UNAVAILABLE', message: 'MANIFEST_KV binding not configured' },
    };
  }

  try {
    const statsKey = 'stats:latest';
    const stats = await env.MANIFEST_KV.get(statsKey);

    // Stats not yet computed/cached
    if (!stats) {
      return {
        ok: false,
        status: 503,
        error: { code: 'NOT_AVAILABLE', message: 'Cached stats not yet available (run build to generate)' },
      };
    }

    // Parse stats JSON
    let parsed: unknown;
    try {
      parsed = JSON.parse(stats);
    } catch {
      return {
        ok: false,
        status: 500,
        error: { code: 'INVALID_DATA', message: 'Cached stats are not valid JSON' },
      };
    }

    return {
      ok: true,
      status: 200,
      result: {
        ...parsed,
        cached: true,
        retrieved_at: new Date().toISOString(),
      },
    };
  } catch (err) {
    const errorMessage = err instanceof Error ? err.message : 'Unknown error';
    return {
      ok: false,
      status: 500,
      error: { code: 'INTERNAL_ERROR', message: `KV stats read failed: ${errorMessage}` },
    };
  }
}
