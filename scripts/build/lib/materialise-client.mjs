/**
 * Materialiser Library for Claude Code Client Packages
 *
 * Enables self-sufficient materialization of emitted skill packages (dist/clients/<platform>/)
 * without requiring access to source-tree files. This is the core of the portability contract.
 *
 * Contract:
 * - Input: path to emitted package root (e.g., dist/clients/claude-code/)
 * - Output: validated package metadata and optional extraction to destination
 * - Guarantee: zero filesystem access to source-tree (shared/skills/) is required
 */

import { readFileSync, statSync, copyFileSync, mkdirSync } from 'fs';
import { join, dirname, resolve, relative } from 'path';

/**
 * Validation error with structured context
 */
export class MaterialiserError extends Error {
  constructor(message, context = {}) {
    super(message);
    this.name = 'MaterialiserError';
    this.context = context;
  }
}

/**
 * Read and validate package metadata from plugin.json
 * @param {string} packageRoot - Path to package root (e.g., dist/clients/claude-code/)
 * @returns {Object} Package metadata: { version, skills: [...] }
 * @throws {MaterialiserError} If validation fails
 */
export function readPackageMetadata(packageRoot) {
  // Validate packageRoot exists and is a directory
  let stat;
  try {
    stat = statSync(packageRoot);
  } catch (err) {
    throw new MaterialiserError(`Package root does not exist: ${packageRoot}`, {
      path: packageRoot,
      originalError: err.message,
    });
  }

  if (!stat.isDirectory()) {
    throw new MaterialiserError(`Package root is not a directory: ${packageRoot}`, {
      path: packageRoot,
    });
  }

  // Read plugin.json
  const pluginJsonPath = join(packageRoot, '.claude-plugin', 'plugin.json');
  let pluginJson;

  try {
    const content = readFileSync(pluginJsonPath, 'utf8');
    pluginJson = JSON.parse(content);
  } catch (err) {
    throw new MaterialiserError(
      `Failed to read or parse plugin.json: ${err.message}`,
      { path: pluginJsonPath, originalError: err.message }
    );
  }

  // Validate required fields
  if (!pluginJson.version) {
    throw new MaterialiserError('plugin.json missing required field: version', {
      path: pluginJsonPath,
    });
  }

  if (!Array.isArray(pluginJson.skills)) {
    throw new MaterialiserError('plugin.json.skills must be an array', {
      path: pluginJsonPath,
    });
  }

  return pluginJson;
}

/**
 * Validate package contents and paths
 * Security-hardened validation to prevent directory traversal and symlink escapes.
 * @param {string} packageRoot - Path to package root
 * @param {Object} metadata - Package metadata from readPackageMetadata()
 * @throws {MaterialiserError} If validation fails (missing files, path traversal, etc.)
 */
export function validatePackageContents(packageRoot, metadata) {
  const resolvedRoot = resolve(packageRoot);

  for (const skill of metadata.skills) {
    if (!skill.path) {
      throw new MaterialiserError(`Skill missing required field: path`, {
        skill: skill.name,
      });
    }

    // Security Layer 1: Reject absolute paths and null bytes
    if (skill.path.startsWith('/') || skill.path.startsWith('\\')) {
      throw new MaterialiserError(
        `Skill path must be relative, got absolute path: ${skill.path}`,
        { skill: skill.name, path: skill.path }
      );
    }

    if (skill.path.includes('\0')) {
      throw new MaterialiserError(
        `Skill path contains null byte (security violation): ${skill.path}`,
        { skill: skill.name, path: skill.path }
      );
    }

    // Security Layer 2: Reject obvious path traversal patterns
    if (skill.path.includes('..')) {
      throw new MaterialiserError(`Skill path must not escape package root: ${skill.path}`, {
        skill: skill.name,
        path: skill.path,
      });
    }

    // Security Layer 3: Resolve and verify boundary
    const skillPath = join(resolvedRoot, skill.path);
    const resolvedSkillPath = resolve(skillPath);

    // Canonical path check: resolved path must be within or equal to packageRoot
    const isWithinRoot =
      resolvedSkillPath === resolvedRoot ||
      (resolvedSkillPath.startsWith(resolvedRoot + '/') ||
        resolvedSkillPath.startsWith(resolvedRoot + '\\')); // Windows compatibility

    if (!isWithinRoot) {
      throw new MaterialiserError(
        `Skill path escapes package root (symlink attack?): ${skill.path}`,
        {
          skill: skill.name,
          path: skill.path,
          resolvedPath: resolvedSkillPath,
          packageRoot: resolvedRoot,
        }
      );
    }

    // Security Layer 4: Verify file exists and is a regular file (not dir, not special)
    let fileStat;
    try {
      fileStat = statSync(resolvedSkillPath);
    } catch (err) {
      throw new MaterialiserError(
        `Skill file does not exist or is not readable: ${skill.path}`,
        { skill: skill.name, path: skill.path, originalError: err.message }
      );
    }

    if (!fileStat.isFile()) {
      throw new MaterialiserError(
        `Skill path is not a regular file (is directory or special): ${skill.path}`,
        { skill: skill.name, path: skill.path, isDirectory: fileStat.isDirectory() }
      );
    }
  }
}

/**
 * Materialize (extract) a package to a destination directory
 * @param {string} packageRoot - Path to package root (source)
 * @param {string} destinationRoot - Path to destination directory
 * @param {Object} options - Optional configuration
 *   - verbose: boolean, log extraction details
 *   - dryRun: boolean, validate but don't copy files
 * @returns {Object} Materialization result: { packageRoot, destinationRoot, skillsExtracted: [...] }
 * @throws {MaterialiserError} If validation or extraction fails
 */
export function materializePackage(packageRoot, destinationRoot, options = {}) {
  const { verbose = false, dryRun = false } = options;

  // Read and validate metadata
  const metadata = readPackageMetadata(packageRoot);
  validatePackageContents(packageRoot, metadata);

  const resolvedRoot = resolve(packageRoot);
  const resolvedDest = resolve(destinationRoot);

  // Create destination if needed
  if (!dryRun) {
    mkdirSync(resolvedDest, { recursive: true });
  }

  const extracted = [];

  // Extract all skills
  for (const skill of metadata.skills) {
    const sourceFile = resolve(join(resolvedRoot, skill.path));
    const destSkillDir = join(resolvedDest, 'skills', skill.name);
    const destFile = join(destSkillDir, 'SKILL.md');

    if (verbose) {
      console.log(`  Materializing: ${skill.name}`);
    }

    if (!dryRun) {
      mkdirSync(destSkillDir, { recursive: true });
      copyFileSync(sourceFile, destFile);
    }

    extracted.push({
      name: skill.name,
      version: skill.version,
      sourceFile: skill.path,
      destinationFile: relative(resolvedDest, destFile),
    });
  }

  return {
    packageRoot: resolvedRoot,
    destinationRoot: resolvedDest,
    version: metadata.version,
    skillsExtracted: extracted,
    dryRun: dryRun,
  };
}

/**
 * Summary statistics for a materialized package
 * @param {string} packageRoot - Path to package root
 * @returns {Object} Stats: { skillCount, totalSize, packageVersion }
 */
export function getPackageStats(packageRoot) {
  const metadata = readPackageMetadata(packageRoot);
  validatePackageContents(packageRoot, metadata);

  const resolvedRoot = resolve(packageRoot);
  let totalSize = 0;

  for (const skill of metadata.skills) {
    const skillPath = resolve(join(resolvedRoot, skill.path));
    try {
      const stat = statSync(skillPath);
      totalSize += stat.size;
    } catch {
      // File is already validated; safe to skip
    }
  }

  return {
    skillCount: metadata.skills.length,
    totalSize: totalSize,
    packageVersion: metadata.version,
  };
}
