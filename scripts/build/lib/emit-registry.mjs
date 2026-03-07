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
 */
export function emitRegistry(skills, platforms, { distDir, buildVersion, builtAt }) {
  const indexPath = join(distDir, 'registry', 'index.json');
  mkdirSync(dirname(indexPath), { recursive: true });

  const index = {
    version: buildVersion,
    built_at: builtAt,
    skill_count: skills.length,
    platform_count: platforms.length,
    platforms,
    skills: skills.map(s => ({
      id: s.skillName,
      version: s.frontmatter.version || '1.0.0',
      description: s.frontmatter.description || '',
      type: s.frontmatter.type || 'prompt',
      status: s.frontmatter.status || 'stable',
      invocation: s.frontmatter.invocation || null,
      tags: s.frontmatter.tags || [],
      capabilities: s.frontmatter.capabilities || [],
      platforms: Object.keys(s.frontmatter.platforms || {}),
      dependencies: {
        runtime: s.frontmatter.dependencies?.runtime || [],
        optional: s.frontmatter.dependencies?.optional || [],
        skills: (s.frontmatter.dependencies?.skills || []).map(d => d.name || d),
        models: s.frontmatter.dependencies?.models || [],
      },
    })),
  };

  writeFileSync(indexPath, JSON.stringify(index, null, 2) + '\n');
  console.log(`  [registry] index.json → ${indexPath} (${skills.length} skills, ${platforms.length} platforms)`);
}
