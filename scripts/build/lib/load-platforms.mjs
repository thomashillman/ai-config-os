/**
 * load-platforms.mjs
 * Loads all platform capability definitions from shared/targets/platforms/.
 */
import { readdirSync, readFileSync, existsSync } from 'fs';
import { join } from 'path';
import { parse as parseYaml } from 'yaml';

/**
 * @param {string} repoRoot - Path to repository root
 * @returns {Map<string, object>} Map of platform ID → platform definition
 */
export function loadPlatforms(repoRoot) {
  const platformDir = join(repoRoot, 'shared', 'targets', 'platforms');
  const platforms = new Map();

  if (!existsSync(platformDir)) {
    console.warn('  [warn] No platform directory found at shared/targets/platforms/');
    return platforms;
  }

  const files = readdirSync(platformDir).filter(f => f.endsWith('.yaml'));
  for (const file of files) {
    try {
      const raw = readFileSync(join(platformDir, file), 'utf8');
      const data = parseYaml(raw);
      if (data?.id) {
        platforms.set(data.id, data);
      }
    } catch (err) {
      console.warn(`  [warn] Failed to load platform ${file}: ${err.message}`);
    }
  }

  return platforms;
}
