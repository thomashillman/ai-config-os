#!/usr/bin/env node
import path from 'path';
import { readFileSync } from 'fs';
import { fileURLToPath } from 'url';
import {
  CANONICAL_PHRASE,
  compareSkillCounts,
  countInstallableSkills,
  parseDeclaredCounts
} from './lib/skill-count-drift.mjs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(__dirname, '..', '..');

const skillsRoot = path.join(repoRoot, 'shared', 'skills');
const docsToCheck = ['PLAN.md', 'README.md']
  .map(file => path.join(repoRoot, file));

let actualCount;
try {
  actualCount = countInstallableSkills(skillsRoot);
} catch (error) {
  console.error('[skill-count-drift] ERROR: failed to inspect skills inventory.');
  console.error(error instanceof Error ? error.message : String(error));
  process.exit(1);
}
const declarations = docsToCheck.map(docPath => {
  const relativePath = path.relative(repoRoot, docPath);
  try {
    const content = readFileSync(docPath, 'utf8');
    return parseDeclaredCounts(relativePath, content);
  } catch {
    return {
      docPath: relativePath,
      matches: [],
      hasMalformedPhrase: false
    };
  }
});

const { errors } = compareSkillCounts(actualCount, declarations);

console.log(`[skill-count-drift] Inventory count from shared/skills/*/SKILL.md: ${actualCount}`);
console.log(`[skill-count-drift] Canonical phrase: ${CANONICAL_PHRASE}`);

if (errors.length > 0) {
  console.error('[skill-count-drift] ERROR: documented skill count drift detected.');
  for (const error of errors) {
    console.error(`- ${error}`);
  }
  process.exit(1);
}

console.log('[skill-count-drift] OK: all declared skill counts match inventory.');
