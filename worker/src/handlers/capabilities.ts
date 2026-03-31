/**
 * Capability discovery handlers.
 *
 * All data is pre-computed at build time and embedded in the bundled registry.
 * No runtime YAML parsing, no hardcoded capability tables.
 *
 * Endpoints:
 *   GET /v1/capabilities/platform/:platform
 *   GET /v1/skills/compatible?caps=cap1,cap2,...
 */

import { versionedCachedResponse } from "../http";
import { errorResponse } from "../http";
import {
  validatePlatform,
  validateCapabilitiesParam,
  capabilitiesCacheKey,
} from "../validation/capabilities";
import type { RegistryLike } from "./artifacts";
import type {
  PlatformProfile,
  CapabilityPlatformResponse,
  CompatibleSkillEntry,
  CompatibleSkillsResponse,
  RegistrySkill,
} from "../types/capabilities";

// ─── Registry shape extensions ────────────────────────────────────────────────

export interface RegistryWithPlatforms extends RegistryLike {
  platform_definitions?: Record<string, PlatformProfile>;
}

// ─── Pre-computed index (built once per Worker instance) ─────────────────────

interface CapabilityIndex {
  /** Set of all known platform IDs */
  platformIds: Set<string>;
  /** Full platform profile keyed by id */
  platformProfiles: Map<string, PlatformProfile>;
  /** All skills cast to typed registry entries */
  skills: RegistrySkill[];
}

function buildIndex(registry: RegistryWithPlatforms): CapabilityIndex {
  const defs = registry.platform_definitions ?? {};
  const platformProfiles = new Map<string, PlatformProfile>();

  for (const [id, def] of Object.entries(defs)) {
    platformProfiles.set(id, def);
  }

  // Also accept platforms from compatibility matrices in skills,
  // in case a platform has no YAML def but appears in skill compat blocks.
  for (const rawSkill of registry.skills) {
    const skill = rawSkill as unknown as RegistrySkill;
    if (skill.compatibility) {
      for (const pid of Object.keys(skill.compatibility)) {
        if (!platformProfiles.has(pid)) {
          // Minimal synthetic profile — better than failing
          platformProfiles.set(pid, {
            id: pid,
            name: pid,
            surface: "unknown",
            default_package: "api",
            capabilities: {},
          });
        }
      }
    }
  }

  return {
    platformIds: new Set(platformProfiles.keys()),
    platformProfiles,
    skills: registry.skills as unknown as RegistrySkill[],
  };
}

// Module-level index — built once per Worker cold start, reused for all requests.
// Worker instances are long-lived within Cloudflare's per-isolate lifecycle.
let _index: CapabilityIndex | null = null;

function getIndex(registry: RegistryWithPlatforms): CapabilityIndex {
  if (!_index) {
    _index = buildIndex(registry);
  }
  return _index;
}

// ─── /v1/capabilities/platform/:platform ─────────────────────────────────────

export function handleCapabilitiesForPlatform(
  platform: string,
  registry: RegistryWithPlatforms,
): Response {
  const index = getIndex(registry);

  const platformResult = validatePlatform(platform, index.platformIds);
  if (!platformResult.ok) {
    return errorResponse(platformResult.error, platformResult.status);
  }

  const profile = index.platformProfiles.get(platformResult.value);
  if (!profile) {
    return errorResponse(
      {
        code: "PLATFORM_DATA_UNAVAILABLE",
        message: `Platform '${platformResult.value}' is known but has no capability data.`,
        hint: "This may indicate a build configuration issue. Please report it.",
      },
      503,
    );
  }

  // Categorise capabilities by status
  const supported: string[] = [];
  const unsupported: string[] = [];
  const unknown: string[] = [];

  for (const [capId, entry] of Object.entries(profile.capabilities)) {
    if (entry.status === "supported") supported.push(capId);
    else if (entry.status === "unsupported") unsupported.push(capId);
    else unknown.push(capId);
  }

  const body: CapabilityPlatformResponse = {
    platform: profile.id,
    name: profile.name,
    surface: profile.surface,
    manifest_version: registry.version,
    capabilities: {
      supported: supported.sort(),
      unsupported: unsupported.sort(),
      unknown: unknown.sort(),
    },
    capability_detail: profile.capabilities,
    ...(profile.notes ? { notes: profile.notes } : {}),
  };

  // Immutable by platform ID — capability definitions never change between builds
  return versionedCachedResponse(body, `platform:${profile.id}`);
}

// ─── /v1/skills/compatible ────────────────────────────────────────────────────

export function handleSkillsCompatible(
  registry: RegistryWithPlatforms,
  capsParam: string | null,
): Response {
  const capsResult = validateCapabilitiesParam(capsParam);
  if (!capsResult.ok) {
    return errorResponse(capsResult.error, capsResult.status);
  }

  const requestedCaps = capsResult.value;
  const capSet = new Set(requestedCaps);
  const index = getIndex(registry);

  const compatibleSkills: CompatibleSkillEntry[] = [];

  for (const skill of index.skills) {
    const required = skill.capabilities?.required ?? [];

    // A skill is compatible if ALL its required capabilities are in the request set.
    // Skills with zero required capabilities are always compatible.
    const isCompatible = required.every((cap) => capSet.has(cap));
    if (!isCompatible) continue;

    compatibleSkills.push({
      id: skill.id,
      version: skill.version,
      description: skill.description,
      type: skill.type,
      status: skill.status,
      tags: skill.tags ?? [],
      capabilities: {
        required,
        optional: skill.capabilities?.optional ?? [],
        fallback_mode: skill.capabilities?.fallback_mode ?? null,
      },
      // Include full pre-computed compatibility matrix so clients know
      // which platforms this skill works on, without extra round trips.
      compatibility: skill.compatibility ?? {},
    });
  }

  const body: CompatibleSkillsResponse = {
    manifest_version: registry.version,
    requested_capabilities: requestedCaps,
    compatible_count: compatibleSkills.length,
    total_skills: index.skills.length,
    skills: compatibleSkills,
  };

  // Cache key is deterministic from sorted capability set + manifest version.
  // Same caps on same manifest → same response forever.
  const cacheKey = `compatible:${registry.version}:${capabilitiesCacheKey(requestedCaps)}`;
  return versionedCachedResponse(body, cacheKey);
}
