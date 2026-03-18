/**
 * Safe dynamic import that works on all platforms (Windows, Linux, macOS).
 *
 * On Windows, path.resolve() produces paths like D:\project\file.mjs.
 * When passed directly to import(), Node.js treats D: as a URL scheme,
 * causing ERR_UNSUPPORTED_ESM_URL_SCHEME.
 *
 * This utility uses new URL(..., import.meta.url) instead, which is
 * the official ESM recommendation and works identically everywhere.
 *
 * Usage:
 *   const module = await safeImport('../path/to/module.mjs', import.meta.url);
 *   const { exportedFn } = await safeImport('../lib/utils.mjs', import.meta.url);
 */

/**
 * Safely import a module using relative paths from the calling module.
 *
 * @param {string} relativeModulePath - Path relative to the caller's location
 *   (e.g., '../lib/module.mjs', './sibling.mjs')
 * @param {string} callerImportMetaUrl - Pass import.meta.url from the calling module
 * @returns {Promise<any>} The imported module's namespace
 * @throws {Error} If the module cannot be found or imported
 *
 * @example
 * // In a test file:
 * import { safeImport } from './lib/windows-safe-import.mjs';
 * const testModule = await safeImport('../path/to/module.mjs', import.meta.url);
 */
export async function safeImport(relativeModulePath, callerImportMetaUrl) {
  // new URL() resolves relative paths using the caller's file:// URL as the base.
  // This works identically on Windows, Linux, and macOS because:
  // 1. No OS-specific path separators are involved
  // 2. The result is a proper file:// URL, not a drive-lettered path
  // 3. import() receives a valid URL scheme (file:), not D: or other nonsense
  const moduleUrl = new URL(relativeModulePath, callerImportMetaUrl).href;
  return await import(moduleUrl);
}
