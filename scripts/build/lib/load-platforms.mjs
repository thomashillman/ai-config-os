/**
 * load-platforms.mjs
 * Loads all platform capability definitions from shared/targets/platforms/.
 *
 * Returns both successfully loaded platforms and any parse/validation errors.
 * Caller (compiler) decides whether to treat errors as fatal.
 */
import { readdir, readFile, access } from 'fs/promises';
import { constants } from 'fs';
import { join } from 'path';
import { parse as parseYaml } from 'yaml';

/**
 * @param {string} repoRoot - Path to repository root
 * @returns {Promise<{platforms: Map<string, object>, errors: string[]}>}
 *   platforms: keyed by filename (without .yaml), value is parsed definition
 *   errors: list of load/validation failures (parse errors, missing id)
 */
export async function loadPlatforms(repoRoot) {
  const platformDir = join(repoRoot, 'shared', 'targets', 'platforms');
  const platforms = new Map();
  const errors = [];

  try {
    await access(platformDir, constants.F_OK);
  } catch {
    errors.push(
      'Platform directory not found: shared/targets/platforms/ ' +
      '— this is a fatal configuration error, not a soft condition.'
    );
    return { platforms, errors };
  }

  // Deterministic ordering keeps downstream compatibility and emission stable.
  const files = (await readdir(platformDir)).filter(f => f.endsWith('.yaml')).sort();

  const results = await Promise.all(
    files.map(async (file) => {
      const platformId = file.replace('.yaml', '');
      try {
        const raw = await readFile(join(platformDir, file), 'utf8');
        return { file, platformId, data: parseYaml(raw), error: null };
      } catch (err) {
        return { file, platformId, data: null, error: `Failed to parse ${file}: ${err.message}` };
      }
    })
  );

  for (const { file, platformId, data, error } of results) {
    if (error) {
      errors.push(error);
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
