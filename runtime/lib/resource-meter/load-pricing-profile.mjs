import { readFileSync } from "node:fs";
import { parse as parseYaml } from "yaml";

/**
 * @param {string} filePath absolute or cwd-relative path to YAML
 * @returns {Record<string, unknown>}
 */
export function loadPricingProfileFromFile(filePath) {
  const raw = readFileSync(filePath, "utf8");
  const parsed = parseYaml(raw);
  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
    throw new TypeError("pricing profile: root must be a mapping");
  }
  const o = /** @type {Record<string, unknown>} */ (parsed);
  if (typeof o.version !== "number") {
    throw new TypeError("pricing profile: version (number) is required");
  }
  if (typeof o.currency !== "string" || !o.currency) {
    throw new TypeError("pricing profile: currency is required");
  }
  if (!o.tiers || typeof o.tiers !== "object" || Array.isArray(o.tiers)) {
    throw new TypeError("pricing profile: tiers mapping is required");
  }
  return o;
}
