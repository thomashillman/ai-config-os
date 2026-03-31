#!/usr/bin/env node
/**
 * Validate `.cursor/rules/*.mdc` project rules (frontmatter + filename convention).
 * See docs/superpowers/specs/2026-03-31-cursor-rules-ci-pr-automation-design.md
 */
import { readFileSync, readdirSync, existsSync } from 'fs';
import { join, resolve } from 'path';
import { fileURLToPath, pathToFileURL } from 'url';
import { parse as parseYaml } from 'yaml';

const __dirname = fileURLToPath(new URL('.', import.meta.url));
const REPO_ROOT = join(__dirname, '..', '..');
const DEFAULT_RULES_DIR = join(REPO_ROOT, '.cursor', 'rules');
const FILENAME_RE = /^\d{3}-[a-z0-9-]+\.mdc$/;

/**
 * @param {string} rulesDir absolute path to .cursor/rules
 * @returns {{ ok: boolean, errors: string[], fileCount: number }}
 */
export function validateCursorRules(rulesDir = DEFAULT_RULES_DIR) {
  const errors = [];

  if (!existsSync(rulesDir)) {
    return { ok: true, errors: [], fileCount: 0 };
  }

  const entries = readdirSync(rulesDir, { withFileTypes: true });
  const mdcFiles = entries
    .filter((e) => e.isFile() && e.name.endsWith('.mdc'))
    .map((e) => e.name);

  for (const name of mdcFiles) {
    const rel = join(rulesDir, name);
    if (!FILENAME_RE.test(name)) {
      errors.push(`${name}: basename must match ${FILENAME_RE.source}`);
      continue;
    }

    let content;
    try {
      content = readFileSync(rel, 'utf8');
    } catch (e) {
      errors.push(`${name}: ${e.message}`);
      continue;
    }

    const fm = parseFrontmatter(content);
    if (fm.error) {
      errors.push(`${name}: ${fm.error}`);
      continue;
    }

    const ve = validateMeta(fm.data, name);
    if (ve) {
      errors.push(ve);
    }
  }

  return { ok: errors.length === 0, errors, fileCount: mdcFiles.length };
}

function parseFrontmatter(content) {
  const m = content.match(/^---\r?\n([\s\S]*?)\r?\n---/);
  if (!m) {
    return { error: 'missing YAML frontmatter (opening ---, closing ---)' };
  }
  try {
    const data = parseYaml(m[1]);
    if (data === null || typeof data !== 'object' || Array.isArray(data)) {
      return { error: 'frontmatter must parse to a YAML mapping' };
    }
    return { data };
  } catch (e) {
    return { error: `invalid YAML: ${e.message}` };
  }
}

/**
 * @param {Record<string, unknown>} data
 * @param {string} filename
 */
function validateMeta(data, filename) {
  if (typeof data.description !== 'string' || !data.description.trim()) {
    return `${filename}: description must be a non-empty string`;
  }
  if (typeof data.alwaysApply !== 'boolean') {
    return `${filename}: alwaysApply must be boolean true or false`;
  }
  if (data.globs !== undefined && data.globs !== null) {
    if (typeof data.globs === 'string') {
      if (!data.globs.trim()) {
        return `${filename}: globs must be non-empty when set`;
      }
    } else if (Array.isArray(data.globs)) {
      if (
        data.globs.length === 0 ||
        !data.globs.every((g) => typeof g === 'string' && g.trim())
      ) {
        return `${filename}: globs array must contain non-empty strings`;
      }
    } else {
      return `${filename}: globs must be a string or array of strings`;
    }
  }
  return null;
}

function main() {
  const customDir = process.argv[2];
  const rulesDir = customDir ? join(REPO_ROOT, customDir) : DEFAULT_RULES_DIR;
  const { ok, errors, fileCount } = validateCursorRules(rulesDir);

  if (!ok) {
    console.error(errors.join('\n'));
    process.exit(1);
  }

  if (fileCount === 0) {
    console.log('check:cursor-rules: no .mdc files under .cursor/rules (OK)');
  } else {
    console.log(`check:cursor-rules: OK (${fileCount} rule file(s))`);
  }
}

function isExecutedDirectly() {
  const entry = process.argv[1];
  if (!entry) {
    return false;
  }
  try {
    return import.meta.url === pathToFileURL(resolve(entry)).href;
  } catch {
    return false;
  }
}

if (isExecutedDirectly()) {
  main();
}
