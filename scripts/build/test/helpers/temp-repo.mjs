/**
 * temp-repo.mjs
 *
 * Helpers for creating temporary repository structures for testing.
 * Reusable utilities to avoid duplication across test files.
 */
import { mkdirSync, writeFileSync, symlinkSync, rmSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { tmpdir } from 'node:os';

/**
 * Create a minimal temporary repository structure for testing the compiler.
 * Returns an object with { repoPath, cleanup } methods.
 *
 * @param {object} opts
 * @param {object} [opts.version] - VERSION file content (default: '0.1.0')
 * @param {object} [opts.packageJson] - package.json overrides
 * @param {object} [opts.skills] - Skills to create: { skillName: { skillMd, frontmatter } }
 * @param {object} [opts.platforms] - Platform YAML files to create: { filename: yamlContent }
 * @returns {{ repoPath: string, cleanup: () => void }}
 */
export function createTempRepo(opts = {}) {
  const repoPath = join(tmpdir(), `test-repo-${Date.now()}-${Math.random().toString(36).slice(2)}`);

  mkdirSync(repoPath, { recursive: true });

  // Create VERSION file
  const version = opts.version || '0.1.0';
  writeFileSync(join(repoPath, 'VERSION'), version);

  // Create package.json
  const packageJson = {
    name: 'test-repo',
    version,
    ...opts.packageJson,
  };
  writeFileSync(join(repoPath, 'package.json'), JSON.stringify(packageJson, null, 2));

  // Create plugin.json
  const pluginJsonPath = join(repoPath, 'plugins', 'core-skills', '.claude-plugin', 'plugin.json');
  mkdirSync(dirname(pluginJsonPath), { recursive: true });
  const pluginJson = {
    name: 'core-skills',
    version,
  };
  writeFileSync(pluginJsonPath, JSON.stringify(pluginJson, null, 2));

  // Create skills directory structure
  const skillsDir = join(repoPath, 'shared', 'skills');
  mkdirSync(skillsDir, { recursive: true });

  if (opts.skills) {
    for (const [skillName, skillContent] of Object.entries(opts.skills)) {
      const skillDir = join(skillsDir, skillName);
      mkdirSync(skillDir, { recursive: true });

      // Write SKILL.md
      const skillMd = skillContent.skillMd || skillContent.frontmatter || '---\nskill: test\n---\nTest skill';
      writeFileSync(join(skillDir, 'SKILL.md'), skillMd);
    }
  }

  // Create platforms directory
  const platformsDir = join(repoPath, 'shared', 'targets', 'platforms');
  mkdirSync(platformsDir, { recursive: true });

  if (opts.platforms) {
    for (const [filename, content] of Object.entries(opts.platforms)) {
      writeFileSync(join(platformsDir, filename), content);
    }
  }

  // Create schemas
  const schemasDir = join(repoPath, 'schemas');
  mkdirSync(schemasDir, { recursive: true });

  // Minimal skill schema
  writeFileSync(
    join(schemasDir, 'skill.schema.json'),
    JSON.stringify({
      $schema: 'http://json-schema.org/draft-07/schema#',
      title: 'Skill Package',
      type: 'object',
      properties: {
        skill: { type: 'string' },
        description: { type: 'string' },
        version: { type: 'string' },
      },
      required: ['skill'],
    })
  );

  // Minimal platform schema
  writeFileSync(
    join(schemasDir, 'platform.schema.json'),
    JSON.stringify({
      $schema: 'http://json-schema.org/draft-07/schema#',
      title: 'Platform Definition',
      type: 'object',
      properties: {
        id: { type: 'string' },
        default_package: { type: 'string' },
        capabilities: { type: 'object' },
      },
      required: ['id'],
    })
  );

  return {
    repoPath,
    cleanup: () => {
      try {
        rmSync(repoPath, { recursive: true, force: true });
      } catch {
        // Ignore cleanup errors
      }
    },
  };
}

/**
 * Create a skill YAML frontmatter string.
 *
 * @param {object} opts
 * @returns {string} Full SKILL.md with frontmatter and body
 */
export function createSkillMd(opts = {}) {
  const {
    skill = 'test-skill',
    description = 'Test skill',
    version = '1.0.0',
    body = 'Test body',
    ...frontmatterRest
  } = opts;

  const frontmatter = {
    skill,
    description,
    version,
    ...frontmatterRest,
  };

  const frontmatterStr = Object.entries(frontmatter)
    .map(([key, val]) => {
      if (typeof val === 'string') {
        return `${key}: ${val}`;
      }
      return `${key}: ${JSON.stringify(val)}`;
    })
    .join('\n');

  return `---\n${frontmatterStr}\n---\n\n${body}`;
}

/**
 * Create a minimal platform YAML definition.
 *
 * @param {object} opts
 * @returns {string} YAML platform definition
 */
export function createPlatformYaml(opts = {}) {
  const {
    id = 'test-platform',
    default_package = 'test',
    capabilities = {},
  } = opts;

  let yaml = `id: ${id}\ndefault_package: ${default_package}\n`;

  if (Object.keys(capabilities).length > 0) {
    yaml += 'capabilities:\n';
    for (const [cap, state] of Object.entries(capabilities)) {
      yaml += `  ${cap}:\n`;
      yaml += `    status: ${state.status || 'supported'}\n`;
      if (state.evidence_date) {
        yaml += `    evidence_date: ${state.evidence_date}\n`;
      }
    }
  }

  return yaml;
}

/**
 * Create a skill with a broken YAML frontmatter (for testing parser errors).
 *
 * @returns {string} Malformed SKILL.md
 */
export function createMalformedFrontmatter() {
  return `---
skill: test
description: unclosed string
---
Body`;
}

/**
 * Create a platform with malformed YAML.
 *
 * @returns {string} Malformed YAML
 */
export function createMalformedPlatformYaml() {
  return `id: test
  invalid indentation:
broken yaml`;
}
