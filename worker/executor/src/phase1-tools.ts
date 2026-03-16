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
 */
export async function getSkillMetadata(skillId: string, env: ExecutorEnv): Promise<ExecuteResponse> {
  if (!env.MANIFEST_KV) {
    return {
      ok: false,
      status: 503,
      error: { code: 'SERVICE_UNAVAILABLE', message: 'MANIFEST_KV not configured' },
    };
  }

  try {
    const key = `skill:${skillId}`;
    const metadata = await env.MANIFEST_KV.get(key);

    if (!metadata) {
      return {
        ok: false,
        status: 404,
        error: { code: 'NOT_FOUND', message: `Skill '${skillId}' not found` },
      };
    }

    try {
      const parsed = JSON.parse(metadata);
      return {
        ok: true,
        status: 200,
        result: {
          skill: skillId,
          metadata: parsed,
          cached: true,
        },
      };
    } catch {
      return {
        ok: false,
        status: 500,
        error: { code: 'INVALID_DATA', message: 'Failed to parse skill metadata' },
      };
    }
  } catch (err) {
    return {
      ok: false,
      status: 500,
      error: { code: 'INTERNAL_ERROR', message: 'Failed to read from MANIFEST_KV' },
    };
  }
}

/**
 * Tool: get_artifact
 * Fetch artifacts from R2
 */
export async function getArtifact(version: string, name: string, env: ExecutorEnv): Promise<ExecuteResponse> {
  if (!env.ARTEFACTS_R2) {
    return {
      ok: false,
      status: 503,
      error: { code: 'SERVICE_UNAVAILABLE', message: 'ARTEFACTS_R2 not configured' },
    };
  }

  // Validate version format (semver)
  if (!/^\d+\.\d+\.\d+$/.test(version)) {
    return {
      ok: false,
      status: 400,
      error: { code: 'INVALID_REQUEST', message: 'Version must be in semver format (e.g., 1.0.0)' },
    };
  }

  // Whitelist artifact names
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

    if (!artifact) {
      return {
        ok: false,
        status: 404,
        error: { code: 'NOT_FOUND', message: `Artifact '${key}' not found` },
      };
    }

    try {
      const text = await artifact.text();
      const parsed = JSON.parse(text);
      return {
        ok: true,
        status: 200,
        result: {
          version,
          artifact: name,
          data: parsed,
          cached: true,
        },
      };
    } catch {
      return {
        ok: false,
        status: 500,
        error: { code: 'INVALID_DATA', message: 'Failed to parse artifact' },
      };
    }
  } catch (err) {
    return {
      ok: false,
      status: 500,
      error: { code: 'INTERNAL_ERROR', message: 'Failed to read from ARTEFACTS_R2' },
    };
  }
}

/**
 * Tool: skill_stats_cached
 * Return pre-computed skill statistics from KV
 */
export async function skillStatsCached(env: ExecutorEnv): Promise<ExecuteResponse> {
  if (!env.MANIFEST_KV) {
    return {
      ok: false,
      status: 503,
      error: { code: 'SERVICE_UNAVAILABLE', message: 'MANIFEST_KV not configured' },
    };
  }

  try {
    const stats = await env.MANIFEST_KV.get('stats:latest');

    if (!stats) {
      return {
        ok: false,
        status: 503,
        error: { code: 'NOT_FOUND', message: 'Cached stats not available' },
      };
    }

    try {
      const parsed = JSON.parse(stats);
      return {
        ok: true,
        status: 200,
        result: {
          ...parsed,
          cached: true,
          timestamp: new Date().toISOString(),
        },
      };
    } catch {
      return {
        ok: false,
        status: 500,
        error: { code: 'INVALID_DATA', message: 'Failed to parse stats' },
      };
    }
  } catch (err) {
    return {
      ok: false,
      status: 500,
      error: { code: 'INTERNAL_ERROR', message: 'Failed to read stats from MANIFEST_KV' },
    };
  }
}
