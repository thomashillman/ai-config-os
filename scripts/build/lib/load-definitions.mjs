import { readdir, readFile, access } from 'fs/promises';
import { constants } from 'fs';
import { join } from 'path';
import { parse as parseYaml } from 'yaml';

async function loadYamlDirectory({ repoRoot, relativeDir, label }) {
  const dirPath = join(repoRoot, ...relativeDir);
  const records = new Map();
  const errors = [];

  try {
    await access(dirPath, constants.F_OK);
  } catch {
    return { records, errors };
  }

  const files = (await readdir(dirPath)).filter(file => file.endsWith('.yaml')).sort();

  const results = await Promise.all(
    files.map(async (file) => {
      const recordId = file.replace('.yaml', '');
      try {
        const data = parseYaml(await readFile(join(dirPath, file), 'utf8'));
        return { file, recordId, data, error: null };
      } catch (err) {
        return { file, recordId, data: null, error: `${label} ${file}: failed to parse YAML (${err.message})` };
      }
    })
  );

  for (const { file, recordId, data, error } of results) {
    if (error) {
      errors.push(error);
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

export async function loadRoutes(repoRoot) {
  return loadYamlDirectory({ repoRoot, relativeDir: ['shared', 'routes'], label: 'route' });
}

export async function loadOutcomes(repoRoot) {
  return loadYamlDirectory({ repoRoot, relativeDir: ['shared', 'outcomes'], label: 'outcome' });
}
