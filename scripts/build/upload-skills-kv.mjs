#!/usr/bin/env node

/**
 * CI Upload Script: Build and Upload Skills Package to Cloudflare KV
 *
 * Usage:
 *   node scripts/build/upload-skills-kv.mjs          # Upload to KV
 *   node scripts/build/upload-skills-kv.mjs --dry-run # Preview only
 *
 * Environment:
 *   CLOUDFLARE_ACCOUNT_ID - Cloudflare account ID
 *   CLOUDFLARE_API_TOKEN - API token with KV write permission
 *   MANIFEST_KV_NAMESPACE_ID - KV namespace ID for skills package
 *
 * Input:
 *   Reads: dist/clients/claude-code/ (plugin.json, skills/*, prompts)
 *
 * Output:
 *   KV keys:
 *     - claude-code-package:<version> (versioned copy)
 *     - claude-code-package:latest (pointer to latest)
 */

import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join, resolve, dirname, relative } from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';

const __dirname = dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = resolve(__dirname, '..', '..');
const DIST_DIR = join(REPO_ROOT, 'dist', 'clients', 'claude-code');
const PLUGIN_PATH = join(DIST_DIR, '.claude-plugin', 'plugin.json');

const DRY_RUN = process.argv.includes('--dry-run');

// ─────────────────────────────────────────────────────────────────
// Core Logic: Build Skills Package
// ─────────────────────────────────────────────────────────────────

function readAllFiles(dirPath, basePath = '') {
  const files = {};

  try {
    const entries = readdirSync(dirPath, { withFileTypes: true });

    for (const entry of entries) {
      const fullPath = join(dirPath, entry.name);
      const relativePath = basePath
        ? join(basePath, entry.name)
        : entry.name;

      if (entry.isDirectory()) {
        // Recurse into subdirectories (e.g., prompts/)
        const subFiles = readAllFiles(fullPath, relativePath);
        Object.assign(files, subFiles);
      } else if (entry.isFile()) {
        // Read file content
        try {
          const content = readFileSync(fullPath, 'utf8');
          files[relativePath] = content;
        } catch (err) {
          console.error(`Warning: Failed to read ${fullPath}: ${err.message}`);
        }
      }
    }
  } catch (err) {
    console.error(`Warning: Failed to read directory ${dirPath}: ${err.message}`);
  }

  return files;
}

function buildSkillsPackage() {
  // 1. Read plugin.json
  let plugin;
  try {
    plugin = JSON.parse(readFileSync(PLUGIN_PATH, 'utf8'));
  } catch (err) {
    throw new Error(
      `Failed to read plugin.json from ${PLUGIN_PATH}: ${err.message}`
    );
  }

  if (!plugin.version) {
    throw new Error('plugin.json missing version field');
  }

  if (!Array.isArray(plugin.skills) || plugin.skills.length === 0) {
    throw new Error(
      'plugin.json missing or empty skills array'
    );
  }

  // 2. Build skills object
  const skills = {};

  for (const skillEntry of plugin.skills) {
    const skillName = skillEntry.name;
    const skillPath = skillEntry.path.replace(/\/SKILL\.md$/, '');
    const skillDir = join(DIST_DIR, skillPath);

    console.log(`  Reading skill: ${skillName}...`);

    // Read all files in skill directory (SKILL.md + prompts/*)
    const skillFiles = readAllFiles(skillDir);

    if (Object.keys(skillFiles).length === 0) {
      throw new Error(`Skill ${skillName} has no files at ${skillDir}`);
    }

    if (!skillFiles['SKILL.md']) {
      throw new Error(`Skill ${skillName} missing SKILL.md`);
    }

    skills[skillName] = skillFiles;
  }

  // 3. Create package
  const pkg = {
    version: plugin.version,
    skills,
  };

  // 4. Validate size
  const jsonStr = JSON.stringify(pkg);
  const sizeBytes = Buffer.byteLength(jsonStr, 'utf8');
  const sizeMB = (sizeBytes / (1024 * 1024)).toFixed(2);

  if (sizeBytes > 25 * 1024 * 1024) {
    throw new Error(
      `Package too large: ${sizeMB}MB exceeds 25MB KV limit`
    );
  }

  return { package: pkg, size: sizeBytes, sizeMB };
}

function uploadToKV(pkg) {
  const version = pkg.version;
  const jsonStr = JSON.stringify(pkg);

  // Determine command to use (wrangler or curl to API)
  const accountId = process.env.CLOUDFLARE_ACCOUNT_ID;
  const apiToken = process.env.CLOUDFLARE_API_TOKEN;
  const kvNamespaceId = process.env.MANIFEST_KV_NAMESPACE_ID;

  if (!accountId || !apiToken || !kvNamespaceId) {
    throw new Error(
      'Missing required env vars: CLOUDFLARE_ACCOUNT_ID, CLOUDFLARE_API_TOKEN, MANIFEST_KV_NAMESPACE_ID'
    );
  }

  // Use curl to upload (more portable than wrangler CLI)
  // See: https://developers.cloudflare.com/api/operations/kv-namespace-write-key-value-pair

  console.log(`\nUploading to KV namespace ${kvNamespaceId}...`);

  // Upload versioned key
  console.log(`  → claude-code-package:${version}`);
  const versionedKey = `claude-code-package:${version}`;
  const curlCmd1 = [
    'curl',
    '-s',
    '-X',
    'PUT',
    `https://api.cloudflare.com/client/v4/accounts/${accountId}/storage/kv/namespaces/${kvNamespaceId}/values/${encodeURIComponent(versionedKey)}`,
    '-H',
    `Authorization: Bearer ${apiToken}`,
    '-H',
    'Content-Type: application/octet-stream',
    '--data-binary',
    `@-`,
  ];

  const result1 = spawnSync('bash', ['-c', `echo '${jsonStr.replace(/'/g, '\'"\'"\'')}' | ${curlCmd1.join(' ')}`], {
    encoding: 'utf8',
    maxBuffer: 50 * 1024 * 1024, // 50MB buffer for large responses
  });

  if (result1.status !== 0) {
    throw new Error(`Failed to upload ${versionedKey}: ${result1.stderr}`);
  }

  try {
    const resp1 = JSON.parse(result1.stdout);
    if (!resp1.success) {
      throw new Error(resp1.errors ? resp1.errors[0].message : 'Unknown error');
    }
  } catch (err) {
    // Cloudflare API might return HTML error page
    console.warn(`Warning: Could not parse response for ${versionedKey}`);
    console.warn(`  Response: ${result1.stdout.substring(0, 200)}`);
  }

  // Upload latest pointer
  console.log(`  → claude-code-package:latest`);
  const latestKey = 'claude-code-package:latest';
  const curlCmd2 = [
    'curl',
    '-s',
    '-X',
    'PUT',
    `https://api.cloudflare.com/client/v4/accounts/${accountId}/storage/kv/namespaces/${kvNamespaceId}/values/${encodeURIComponent(latestKey)}`,
    '-H',
    `Authorization: Bearer ${apiToken}`,
    '-H',
    'Content-Type: application/octet-stream',
    '--data-binary',
    `@-`,
  ];

  const result2 = spawnSync('bash', ['-c', `echo '${jsonStr.replace(/'/g, '\'"\'"\'')}' | ${curlCmd2.join(' ')}`], {
    encoding: 'utf8',
    maxBuffer: 50 * 1024 * 1024,
  });

  if (result2.status !== 0) {
    throw new Error(`Failed to upload ${latestKey}: ${result2.stderr}`);
  }

  try {
    const resp2 = JSON.parse(result2.stdout);
    if (!resp2.success) {
      throw new Error(resp2.errors ? resp2.errors[0].message : 'Unknown error');
    }
  } catch (err) {
    console.warn(`Warning: Could not parse response for ${latestKey}`);
  }

  console.log(`\n✓ Skills package ${version} uploaded to KV`);
}

// ─────────────────────────────────────────────────────────────────
// Main
// ─────────────────────────────────────────────────────────────────

async function main() {
  try {
    console.log(`Building skills package from ${DIST_DIR}...\n`);

    const { package: pkg, sizeMB } = buildSkillsPackage();

    console.log(
      `\nPackage Summary:`
    );
    console.log(`  Version: ${pkg.version}`);
    console.log(`  Skills: ${Object.keys(pkg.skills).length}`);
    console.log(`  Size: ${sizeMB}MB`);

    if (DRY_RUN) {
      console.log(`\n[DRY RUN] Would upload to KV`);
      console.log(`  Keys:`);
      console.log(`    - claude-code-package:${pkg.version}`);
      console.log(`    - claude-code-package:latest`);
      return;
    }

    uploadToKV(pkg);
  } catch (err) {
    console.error(`\nERROR: ${err.message}`);
    process.exit(1);
  }
}

main();
