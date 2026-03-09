/**
 * emit-runtime.mjs
 * Emits runtime metadata documents consumed by automation and tooling.
 */
import { mkdirSync, readFileSync, writeFileSync, existsSync } from 'fs';
import { createHash } from 'crypto';
import { join } from 'path';

/**
 * @typedef {object} Manifest
 * @property {number} schemaVersion
 * @property {string} version
 * @property {number} skillCount
 * @property {number} platformCount
 * @property {{ manifest: string, outcomes: string, routes: string, toolRegistry: string }} documents
 * @property {string[]} bundles
 * @property {Record<string, string>} artifactHashes
 * @property {'sha256'} artifactHashAlgorithm
 * @property {'file'|'manifest-with-self-hash-redacted'} artifactHashScope
 * @property {string} [built_at]
 * @property {string} [build_id]
 * @property {string} [source_commit]
 */

/**
 * @param {object[]} skills
 * @param {string[]} platforms
 * @param {object} opts
 * @param {string} opts.distDir
 * @param {string} opts.releaseVersion
 * @param {object|null} [opts.provenance]
 */
export function emitRuntime(skills, platforms, { distDir, releaseVersion, provenance }) {
  const runtimeDir = join(distDir, 'runtime');
  mkdirSync(runtimeDir, { recursive: true });

  const sortedSkills = [...skills].sort((a, b) => a.skillName.localeCompare(b.skillName));

  const outcomesDoc = {
    version: releaseVersion,
    skills: sortedSkills.map(skill => ({
      id: skill.skillName,
      outcomes: [...(skill.frontmatter.outputs || [])]
        .sort((a, b) => a.name.localeCompare(b.name))
        .map(output => ({
          name: output.name,
          type: output.type,
          description: output.description,
        })),
    })),
  };

  const routes = [];
  for (const skill of sortedSkills) {
    if (skill.frontmatter.invocation) {
      routes.push({
        route: skill.frontmatter.invocation,
        skill: skill.skillName,
      });
    }
  }
  routes.sort((a, b) => a.route.localeCompare(b.route) || a.skill.localeCompare(b.skill));

  const routesDoc = {
    version: releaseVersion,
    routes,
  };

  const toolRegistryDoc = {
    version: releaseVersion,
    tools: sortedSkills.map(skill => ({
      id: skill.skillName,
      description: skill.frontmatter.description || '',
      runtime: [...(skill.frontmatter.dependencies?.runtime || [])].sort((a, b) => a.localeCompare(b)),
      optional: [...(skill.frontmatter.dependencies?.optional || [])].sort((a, b) => a.localeCompare(b)),
      models: [...(skill.frontmatter.dependencies?.models || [])].sort((a, b) => a.localeCompare(b)),
      platforms: Object.keys(skill.frontmatter.platforms || {}).sort((a, b) => a.localeCompare(b)),
    })),
  };

  const manifestPath = join(runtimeDir, 'manifest.json');
  const outcomesPath = join(runtimeDir, 'outcomes.json');
  const routesPath = join(runtimeDir, 'routes.json');
  const toolRegistryPath = join(runtimeDir, 'tool-registry.json');

  writeJson(outcomesPath, outcomesDoc);
  writeJson(routesPath, routesDoc);
  writeJson(toolRegistryPath, toolRegistryDoc);

  const documents = {
    manifest: 'runtime/manifest.json',
    outcomes: 'runtime/outcomes.json',
    routes: 'runtime/routes.json',
    toolRegistry: 'runtime/tool-registry.json',
  };

  const bundles = [
    'registry/index.json',
    'clients/claude-code/.claude-plugin/plugin.json',
    'clients/cursor/.cursorrules',
  ].filter(path => existsSync(join(distDir, path))).sort((a, b) => a.localeCompare(b));

  const hashTargets = [
    ...Object.values(documents).filter(path => path !== documents.manifest),
    ...bundles,
  ].sort((a, b) => a.localeCompare(b));

  const artifactHashes = {};
  for (const relativePath of hashTargets) {
    artifactHashes[relativePath] = hashFile(join(distDir, relativePath));
  }

  /** @type {Manifest} */
  const manifestDoc = {
    schemaVersion: 1,
    version: releaseVersion,
    skillCount: skills.length,
    platformCount: platforms.length,
    documents,
    bundles,
    artifactHashes,
    artifactHashAlgorithm: 'sha256',
    artifactHashScope: 'file',
    ...(provenance?.builtAt ? { built_at: provenance.builtAt } : {}),
    ...(provenance?.buildId ? { build_id: provenance.buildId } : {}),
    ...(provenance?.sourceCommit ? { source_commit: provenance.sourceCommit } : {}),
  };

  manifestDoc.artifactHashScope = 'manifest-with-self-hash-redacted';
  artifactHashes[documents.manifest] = hashManifestWithRedactedSelfHash(manifestDoc, documents.manifest);

  writeJson(manifestPath, manifestDoc);

  console.log(`  [runtime] manifest.json → ${manifestPath}`);
  console.log(`  [runtime] outcomes.json → ${outcomesPath}`);
  console.log(`  [runtime] routes.json → ${routesPath}`);
  console.log(`  [runtime] tool-registry.json → ${toolRegistryPath}`);
}

function writeJson(path, data) {
  writeFileSync(path, JSON.stringify(data, null, 2) + '\n');
}

function hashFile(path) {
  const hash = createHash('sha256');
  hash.update(readFileSync(path));
  return hash.digest('hex');
}

function hashManifestWithRedactedSelfHash(manifestDoc, manifestPath) {
  const clone = {
    ...manifestDoc,
    artifactHashes: {
      ...manifestDoc.artifactHashes,
      [manifestPath]: '',
    },
  };

  const hash = createHash('sha256');
  hash.update(JSON.stringify(clone, null, 2) + '\n');
  return hash.digest('hex');
}
