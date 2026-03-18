#!/usr/bin/env node

/**
 * Extract skill files from JSON package to cache directory
 *
 * Usage:
 *   node extract-package.mjs <cache-dir>
 *
 * Input: JSON from stdin with structure:
 *   {
 *     version: "0.5.4",
 *     skills: {
 *       "skill-name": {
 *         "SKILL.md": "...",
 *         "prompts/brief.md": "...",
 *         ...
 *       }
 *     }
 *   }
 *
 * Output:
 *   Creates:
 *   <cache-dir>/skills/<skill>/SKILL.md
 *   <cache-dir>/skills/<skill>/prompts/*
 *
 *   Exits 1 on error (no partial state)
 */

import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';

const CACHE_DIR = process.argv[2];

if (!CACHE_DIR) {
  console.error('ERROR: cache-dir argument required');
  process.exit(1);
}

// Read JSON from stdin
let input = '';
process.stdin.resume();
process.stdin.on('data', (chunk) => {
  input += chunk;
});

process.stdin.on('end', () => {
  try {
    const pkg = JSON.parse(input);

    // Validate package structure
    if (!pkg.version || !pkg.skills) {
      throw new Error('Package missing version or skills field');
    }

    if (typeof pkg.version !== 'string') {
      throw new Error('Package version must be a string');
    }

    if (typeof pkg.skills !== 'object' || Array.isArray(pkg.skills)) {
      throw new Error('Package skills must be an object');
    }

    // Extract all files
    let extractedCount = 0;

    for (const [skillName, files] of Object.entries(pkg.skills)) {
      if (typeof files !== 'object' || Array.isArray(files)) {
        throw new Error(`Skill ${skillName} files must be an object`);
      }

      for (const [filePath, content] of Object.entries(files)) {
        // Security: reject path traversal
        if (filePath.includes('..') || filePath.includes('\0')) {
          throw new Error(`Rejected path traversal in: ${filePath}`);
        }

        if (filePath.startsWith('/')) {
          throw new Error(`Rejected absolute path: ${filePath}`);
        }

        // Write file
        const dest = join(CACHE_DIR, 'skills', skillName, filePath);
        const destDir = dirname(dest);

        mkdirSync(destDir, { recursive: true });
        writeFileSync(dest, content, 'utf8');
        extractedCount++;
      }
    }

    console.log(`Extracted ${Object.keys(pkg.skills).length} skills (${extractedCount} files)`);
    process.exit(0);
  } catch (err) {
    console.error(`ERROR: ${err.message}`);
    process.exit(1);
  }
});
