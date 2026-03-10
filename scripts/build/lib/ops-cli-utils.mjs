import { execFileSync } from 'node:child_process';
import { resolve } from 'node:path';

export function parseRepoRootArg(argv) {
  const args = [...argv];
  for (let i = 0; i < args.length; i += 1) {
    if (args[i] === '--repo-root') {
      const value = args[i + 1];
      if (!value) {
        throw new Error('Missing value for --repo-root');
      }
      return resolve(value);
    }
  }

  return resolve(execFileSync('git', ['rev-parse', '--show-toplevel'], { encoding: 'utf8' }).trim());
}

export function printErrorsAndExit(errors) {
  for (const error of errors) {
    console.error(`[ERROR] ${error}`);
  }
  process.exitCode = 1;
}
