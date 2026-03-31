#!/usr/bin/env node
/**
 * new-skill.mjs — Portable Node.js scaffold for new skills.
 *
 * Creates a new skill in shared/skills/<name>/, updates shared/manifest.md,
 * and optionally creates a convenience symlink under plugins/core-skills/skills/.
 *
 * Usage:
 *   node scripts/build/new-skill.mjs <skill-name>
 *   node scripts/build/new-skill.mjs <skill-name> --no-link
 *
 * Replaces ops/new-skill.sh as the authoritative scaffold implementation.
 * The shell script is kept as a thin Unix wrapper.
 */
import { readFileSync, writeFileSync, mkdirSync, existsSync, symlinkSync } from 'fs';
import { join, resolve, dirname, relative } from 'path';
import { fileURLToPath } from 'url';
import { spawnSync } from 'child_process';
import { extractDescription, updateManifestWithSkill } from './lib/manifest-update.mjs';

const __dirname = dirname(fileURLToPath(import.meta.url));

// ─── Resolve repo root ───

function findRepoRoot() {
  const cwd = process.cwd();
  const templateFromCwd = join(cwd, 'shared', 'skills', '_template', 'SKILL.md');
  // Prefer cwd when it already looks like this repo (temp fixtures, explicit cd, CI without git)
  if (existsSync(templateFromCwd)) {
    return cwd;
  }
  const result = spawnSync('git', ['rev-parse', '--show-toplevel'], {
    encoding: 'utf8',
    stdio: ['pipe', 'pipe', 'pipe'],
  });
  if (result.status === 0 && result.stdout.trim()) {
    return result.stdout.trim();
  }
  // Fallback: two levels up from scripts/build/
  return resolve(__dirname, '..', '..');
}

const REPO_ROOT = findRepoRoot();

// ─── Parse arguments ───

const args = process.argv.slice(2);
const flags = new Set(args.filter(a => a.startsWith('--')));
const positional = args.filter(a => !a.startsWith('--'));

const skillName = positional[0];
const noLink = flags.has('--no-link');

if (!skillName) {
  console.error('Usage: new-skill.mjs <skill-name> [--no-link]');
  process.exit(1);
}

// ─── Validate skill name ───

if (!/^[a-z][a-z0-9-]*$/.test(skillName)) {
  console.error(`Error: skill name must be kebab-case (lowercase letters, digits, hyphens), got '${skillName}'`);
  process.exit(1);
}

// ─── Paths ───

const sharedDir = join(REPO_ROOT, 'shared', 'skills', skillName);
const pluginDir = join(REPO_ROOT, 'plugins', 'core-skills', 'skills', skillName);
const templatePath = join(REPO_ROOT, 'shared', 'skills', '_template', 'SKILL.md');
const manifestPath = join(REPO_ROOT, 'shared', 'manifest.md');

// ─── Check for existing skill ───

if (existsSync(sharedDir)) {
  console.error(`Error: skill '${skillName}' already exists at ${sharedDir}`);
  process.exit(1);
}

// ─── Check template exists ───

if (!existsSync(templatePath)) {
  console.error(`Error: template not found at ${templatePath}`);
  process.exit(1);
}

// ─── 1. Create skill from template ───

mkdirSync(sharedDir, { recursive: true });
const template = readFileSync(templatePath, 'utf8');
const skillContent = template.replaceAll('{{SKILL_NAME}}', skillName);
writeFileSync(join(sharedDir, 'SKILL.md'), skillContent);

console.log(`Created skill '${skillName}'`);
console.log(`  \u2192 ${sharedDir}/SKILL.md (edit this)`);

// ─── 2. Optionally create symlink (Unix only, convenience feature) ───
//
// Portability contract: skills are created in shared/skills/ regardless of platform.
// Symlinks are an optional authoring convenience on Unix; they are NOT part of
// the build contract (compiler reads only shared/skills/).
// The --no-link flag explicitly skips symlink creation (portable mode, default on Windows).

if (!noLink && process.platform !== 'win32') {
  // Unix and not --no-link: create convenience symlink
  mkdirSync(dirname(pluginDir), { recursive: true });
  const target = relative(dirname(pluginDir), sharedDir);
  try {
    symlinkSync(target, pluginDir);
    console.log(`  \u2192 ${pluginDir} (symlink) [optional convenience]`);
  } catch (err) {
    console.log(`  WARNING: Could not create symlink: ${err.message}`);
  }
} else if (noLink) {
  console.log('  (symlink skipped: --no-link / portable mode)');
} else {
  console.log('  (symlink skipped: not supported on this platform)');
}

// ─── 3. Update manifest.md ───

if (existsSync(manifestPath)) {
  try {
    const description = extractDescription(skillContent);
    updateManifestWithSkill(manifestPath, skillName, description);
    console.log('  \u2192 Updated shared/manifest.md with skill entry');
  } catch (err) {
    console.log(`  WARNING: Could not update manifest: ${err.message}`);
  }
} else {
  console.log('  WARNING: shared/manifest.md not found');
}

// ─── 4. Post-scaffold lint ───

console.log('');
const lintScript = join(REPO_ROOT, 'scripts', 'lint', 'skill.mjs');
if (existsSync(lintScript)) {
  const lintResult = spawnSync(process.execPath, [lintScript, join(sharedDir, 'SKILL.md')], {
    cwd: REPO_ROOT,
    encoding: 'utf8',
    stdio: ['pipe', 'pipe', 'pipe'],
  });
  if (lintResult.status === 0) {
    console.log('Frontmatter lint: OK');
  } else {
    console.log('WARNING: Frontmatter has issues. Edit SKILL.md or run:');
    console.log(`  node scripts/lint/skill.mjs shared/skills/${skillName}/SKILL.md`);
  }
}

// ─── 5. Next steps ───

console.log('');
console.log('Next steps:');
console.log(`  1. Edit ${sharedDir}/SKILL.md`);
console.log('  2. Review the placeholder row in shared/manifest.md');
console.log('  3. Run: bash adapters/claude/dev-test.sh');
console.log('');
console.log('Note: this script does not change the release version.');
console.log('To bump the release: edit VERSION, then run npm run version:sync.');
