/**
 * emit-registry.mjs
 * Emits dist/registry/index.json — the canonical skill manifest.
 */
import { mkdirSync, writeFileSync } from 'fs';
import { join, dirname } from 'path';

/**
 * @param {object[]} skills - All parsed skills
 * @param {string[]} platforms - Platform IDs that were emitted
 * @param {object} opts
 * @param {string} opts.distDir - Root dist/ directory
 * @param {string} opts.buildVersion
 * @param {string} opts.builtAt
 * @param {Map<string, Map<string, object>>} [opts.compatMatrix] - Compatibility matrix
 */
export function emitRegistry(skills, platforms, { distDir, buildVersion, builtAt, compatMatrix }) {
  const indexPath = join(distDir, 'registry', 'index.json');
  mkdirSync(dirname(indexPath), { recursive: true });

  const index = {
    version: buildVersion,
    built_at: builtAt,
    skill_count: skills.length,
    platform_count: platforms.length,
    platforms,
    skills: skills.map(s => {
      const caps = s.frontmatter.capabilities || {};
      const entry = {
        id: s.skillName,
        version: s.frontmatter.version || '1.0.0',
        description: s.frontmatter.description || '',
        type: s.frontmatter.type || 'prompt',
        status: s.frontmatter.status || 'stable',
        invocation: s.frontmatter.invocation || null,
        tags: s.frontmatter.tags || [],
        capabilities: {
          required: Array.isArray(caps.required) ? caps.required : (Array.isArray(caps) ? caps : []),
          optional: caps.optional || [],
          fallback_mode: caps.fallback_mode || null,
        },
        platforms: Object.keys(s.frontmatter.platforms || {}),
        dependencies: {
          runtime: s.frontmatter.dependencies?.runtime || [],
          optional: s.frontmatter.dependencies?.optional || [],
          skills: (s.frontmatter.dependencies?.skills || []).map(d => d.name || d),
          models: s.frontmatter.dependencies?.models || [],
        },
      };

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

  writeFileSync(indexPath, JSON.stringify(index, null, 2) + '\n');
  console.log(`  [registry] index.json → ${indexPath} (${skills.length} skills, ${platforms.length} platforms)`);
}
