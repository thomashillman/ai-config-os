import { existsSync } from 'node:fs';
import { join } from 'node:path';
import { spawnSync } from 'node:child_process';

function unique(items) {
  return [...new Set(items.filter(Boolean))];
}

function isWorkingBash(command) {
  const result = spawnSync(command, ['-lc', 'command -v bash'], {
    encoding: 'utf8',
    stdio: 'ignore',
  });
  return result.status === 0;
}

export function resolveBashCommand() {
  const candidates = [];

  if (process.platform === 'win32') {
    const programRoots = unique([
      process.env['ProgramW6432'],
      process.env['ProgramFiles'],
      process.env['ProgramFiles(x86)'],
    ]);

    for (const root of programRoots) {
      candidates.push(join(root, 'Git', 'bin', 'bash.exe'));
    }
  }

  candidates.push('bash');

  for (const candidate of unique(candidates)) {
    if (candidate !== 'bash' && !existsSync(candidate)) {
      continue;
    }

    if (isWorkingBash(candidate)) {
      return candidate;
    }
  }

  return null;
}
