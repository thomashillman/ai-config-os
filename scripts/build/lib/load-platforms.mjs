/**
 * load-platforms.mjs
 * Loads all platform capability definitions from shared/targets/platforms/.
 *
 * Returns both successfully loaded platforms and any parse/validation errors.
 * Caller (compiler) decides whether to treat errors as fatal.
 */
import { readdirSync, readFileSync, existsSync } from 'fs';
import { join } from 'path';
import { parse as parseYaml } from 'yaml';

/**
 * @param {string} repoRoot - Path to repository root
 * @returns {object} { platforms: Map<string, object>, errors: string[] }
 *   platforms: keyed by filename (without .yaml), value is parsed definition
 *   errors: list of load/validation failures (parse errors, missing id)
 */
export function loadPlatforms(repoRoot) {
  const platformDir = join(repoRoot, 'shared', 'targets', 'platforms');
  const platforms = new Map();
  const errors = [];

  if (!existsSync(platformDir)) {
    console.warn('  [warn] No platform directory found at shared/targets/platforms/');
    return { platforms, errors };
  }

  const files = readdirSync(platformDir).filter(f => f.endsWith('.yaml'));
  for (const file of files) {
    const platformId = file.replace('.yaml', '');
    let data;

    try {
      const raw = readFileSync(join(platformDir, file), 'utf8');
      data = parseYaml(raw);
    } catch (err) {
      errors.push(`Failed to parse ${file}: ${err.message}`);
      continue;
    }

    if (!data?.id) {
      errors.push(`${file}: missing 'id' field`);
      continue;
    }

    // Validate filename matches data.id
    if (data.id !== platformId) {
      errors.push(`${file}: id='${data.id}' does not match filename '${platformId}.yaml'`);
      continue;
    }

    platforms.set(platformId, data);
  }

  return { platforms, errors };
}
