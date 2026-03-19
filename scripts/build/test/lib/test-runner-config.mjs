import { cpus } from 'os';

export function defaultConcurrencyForPlatform(platform, cpuCount = cpus().length) {
  const safeCpuCount = Math.max(1, Number.isFinite(cpuCount) ? cpuCount : 1);
  if (platform === 'win32') {
    return 1;
  }
  return Math.min(safeCpuCount, 4);
}

export function resolveTestConcurrency({
  platform = process.platform,
  cpuCount = cpus().length,
  env = process.env,
} = {}) {
  const parsed = Number.parseInt(env.TEST_CONCURRENCY ?? '', 10);
  if (Number.isInteger(parsed) && parsed > 0) {
    return parsed;
  }
  return defaultConcurrencyForPlatform(platform, cpuCount);
}
