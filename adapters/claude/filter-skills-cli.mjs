#!/usr/bin/env node
/**
 * filter-skills-cli.mjs — CLI entry point for the skill classifier.
 *
 * Usage:
 *   node adapters/claude/filter-skills-cli.mjs              # grouped human-readable
 *   node adapters/claude/filter-skills-cli.mjs --json        # structured JSON
 *   node adapters/claude/filter-skills-cli.mjs --summary     # one-line for session-start
 */

import { fileURLToPath } from 'node:url';
import { join, dirname } from 'node:path';
import { filterSkills, formatText, formatSummary } from './filter-skills.mjs';

const args = process.argv.slice(2);
const mode = args.includes('--json')    ? 'json'
           : args.includes('--summary') ? 'summary'
           : 'text';

const result = filterSkills();

if (mode === 'json') {
  console.log(JSON.stringify(result, null, 2));
} else if (mode === 'summary') {
  if (result.warning) {
    process.stderr.write(`[warn] ${result.warning}\n`);
  }
  console.log(formatSummary(result));
} else {
  process.stdout.write(formatText(result));
}
