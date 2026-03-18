/**
 * parse-skill.mjs
 * Parses a SKILL.md file: extracts YAML frontmatter and markdown body.
 */
import { readFileSync } from 'fs';
import { parse as parseYaml } from 'yaml';

const FRONTMATTER_RE = /^---\r?\n([\s\S]*?)\r?\n---\r?\n?([\s\S]*)$/;

/**
 * @param {string} filePath - Absolute path to SKILL.md
 * @param {string} [content] - Pre-read file content (skips readFileSync when provided)
 * @returns {{ frontmatter: object, body: string, filePath: string }}
 */
export function parseSkill(filePath, content = null) {
  const raw = content ?? readFileSync(filePath, 'utf8');
  const match = raw.match(FRONTMATTER_RE);

  if (!match) {
    throw new Error(`No YAML frontmatter found in ${filePath}`);
  }

  const [, yamlStr, body] = match;
  let frontmatter;
  try {
    frontmatter = parseYaml(yamlStr, { strict: false });
  } catch (err) {
    throw new Error(`Failed to parse YAML in ${filePath}: ${err.message}`);
  }

  return { frontmatter, body: body.trim(), filePath };
}
