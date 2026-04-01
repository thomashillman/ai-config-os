/**
 * emit-registry.mjs
 * Emits dist/registry/index.json — the canonical skill manifest.
 */
import { mkdirSync, writeFileSync } from "fs";
import { join, dirname } from "path";
import { normalizeResourceBudget } from "../../../shared/contracts/resource-budget-normalize.mjs";

/**
 * @param {object[]} skills - All parsed skills
 * @param {string[]} platforms - Platform IDs that were emitted
 * @param {object} opts
 * @param {string} opts.distDir - Root dist/ directory
 * @param {string} opts.releaseVersion - release version from VERSION file
 * @param {object|null} [opts.provenance] - optional provenance (release mode only)
 * @param {Map<string, Map<string, object>>} [opts.compatMatrix] - Compatibility matrix
 * @param {Map<string, object>} [opts.platformDefs] - Full platform definitions from YAML
 */
export function emitRegistry(
  skills,
  platforms,
  { distDir, releaseVersion, provenance, compatMatrix, platformDefs },
) {
  const indexPath = join(distDir, "registry", "index.json");
  mkdirSync(dirname(indexPath), { recursive: true });

  // Build platform_definitions block from loaded YAML definitions.
  // This lets the Worker serve canonical capability data without YAML access.
  const platform_definitions = {};
  if (platformDefs) {
    for (const [id, def] of platformDefs) {
      platform_definitions[id] = {
        id: def.id,
        name: def.name || id,
        surface: def.surface || "unknown",
        default_package: def.default_package || "api",
        capabilities: def.capabilities || {},
        ...(def.notes ? { notes: def.notes } : {}),
      };
    }
  }

  const index = {
    version: releaseVersion,
    // Provenance: consistent with emit-claude-code.mjs — all three fields in release mode
    ...(provenance?.builtAt ? { built_at: provenance.builtAt } : {}),
    ...(provenance?.buildId ? { build_id: provenance.buildId } : {}),
    ...(provenance?.sourceCommit
      ? { source_commit: provenance.sourceCommit }
      : {}),
    skill_count: skills.length,
    platform_count: platforms.length,
    platforms,
    platform_definitions,
    skills: skills.map((s) => {
      const caps = s.frontmatter.capabilities || {};
      const entry = {
        id: s.skillName,
        version: s.frontmatter.version || "1.0.0",
        description: s.frontmatter.description || "",
        type: s.frontmatter.type || "prompt",
        status: s.frontmatter.status || "stable",
        invocation: s.frontmatter.invocation || null,
        tags: s.frontmatter.tags || [],
        capabilities: {
          required: caps.required || [],
          optional: caps.optional || [],
          fallback_mode: caps.fallback_mode || null,
        },
        platforms: Object.keys(s.frontmatter.platforms || {}),
        dependencies: {
          runtime: s.frontmatter.dependencies?.runtime || [],
          optional: s.frontmatter.dependencies?.optional || [],
          skills: (s.frontmatter.dependencies?.skills || []).map(
            (d) => d.name || d,
          ),
          models: s.frontmatter.dependencies?.models || [],
        },
      };

      if (s.frontmatter.resource_budget !== undefined) {
        const normalized = normalizeResourceBudget(
          s.frontmatter.resource_budget,
        );
        if (normalized) {
          entry.resource_budget = normalized;
        }
      }

      // Add compatibility matrix if available
      if (compatMatrix) {
        const skillCompat = compatMatrix.get(s.skillName);
        if (skillCompat) {
          entry.compatibility = {};
          for (const [pid, result] of skillCompat) {
            entry.compatibility[pid] = {
              status: result.status,
              mode: result.mode,
              package: result.package,
              ...(result.notes ? { notes: result.notes } : {}),
            };
          }
        }
      }

      return entry;
    }),
  };

  writeFileSync(indexPath, JSON.stringify(index, null, 2) + "\n");
  console.log(
    `  [registry] index.json → ${indexPath} (${skills.length} skills, ${platforms.length} platforms)`,
  );
}

/**
 * Emits dist/registry/summary.json — token-efficient subset for local clients.
 * Contains only the fields needed by filter-skills.mjs and generate-commands.mjs.
 * Omits: platform_definitions, compatibility matrix, tags, dependencies,
 * per-skill platforms list, and build provenance fields.
 *
 * @param {object[]} skills - All parsed skills (same array as emitRegistry)
 * @param {string[]} platforms - Platform IDs (same array as emitRegistry)
 * @param {object} opts
 * @param {string} opts.distDir
 * @param {string} opts.releaseVersion
 */
export function emitSummary(skills, platforms, { distDir, releaseVersion }) {
  const summaryPath = join(distDir, "registry", "summary.json");
  mkdirSync(dirname(summaryPath), { recursive: true });

  const summary = {
    version: releaseVersion,
    skill_count: skills.length,
    platform_count: platforms.length,
    platforms,
    skills: skills.map((s) => {
      const caps = s.frontmatter.capabilities || {};
      return {
        id: s.skillName,
        description: s.frontmatter.description || "",
        type: s.frontmatter.type || "prompt",
        status: s.frontmatter.status || "stable",
        capabilities: {
          required: caps.required || [],
          optional: caps.optional || [],
          fallback_mode: caps.fallback_mode || null,
        },
      };
    }),
  };

  writeFileSync(summaryPath, JSON.stringify(summary, null, 2) + "\n");
  console.log(
    `  [registry] summary.json → ${summaryPath} (${skills.length} skills)`,
  );
}
