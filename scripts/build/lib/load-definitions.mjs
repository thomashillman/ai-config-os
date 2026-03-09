import { readdirSync, readFileSync, existsSync } from 'fs';
import { join } from 'path';
import { parse as parseYaml } from 'yaml';

function loadYamlDirectory({ repoRoot, relativeDir, label }) {
  const dirPath = join(repoRoot, ...relativeDir);
  const records = new Map();
  const errors = [];

  if (!existsSync(dirPath)) {
    return { records, errors };
  }

  const files = readdirSync(dirPath).filter(file => file.endsWith('.yaml')).sort();
  for (const file of files) {
    const recordId = file.replace('.yaml', '');
    let data;

    try {
      data = parseYaml(readFileSync(join(dirPath, file), 'utf8'));
    } catch (err) {
      errors.push(`${label} ${file}: failed to parse YAML (${err.message})`);
      continue;
    }

    if (!data?.id) {
      errors.push(`${label} ${file}: missing 'id' field`);
      continue;
    }

    if (data.id !== recordId) {
      errors.push(`${label} ${file}: id='${data.id}' does not match filename '${recordId}.yaml'`);
      continue;
    }

    records.set(recordId, data);
  }

  return { records, errors };
}

export function loadRoutes(repoRoot) {
  return loadYamlDirectory({ repoRoot, relativeDir: ['shared', 'routes'], label: 'route' });
}

export function loadOutcomes(repoRoot) {
  return loadYamlDirectory({ repoRoot, relativeDir: ['shared', 'outcomes'], label: 'outcome' });
}
