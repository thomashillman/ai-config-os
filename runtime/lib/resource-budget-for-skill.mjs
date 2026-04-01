import { normalizeResourceBudget } from "../../shared/contracts/resource-budget-normalize.mjs";

/**
 * Registry skill entries from dist/registry/index.json may include `resource_budget`
 * (already normalised at compile time). Re-normalises for a single consumption path.
 *
 * The Cloudflare Worker duplicates this shape in `worker/src/handlers/artifacts.ts`
 * (see `getResourceBudgetMetaFromRegistrySkill`) so test harnesses that transpile
 * `worker/src` into a temp directory do not need to resolve `runtime/` imports.
 *
 * @param {unknown} registrySkillEntry
 * @returns {{ mode: string; normalized: Record<string, unknown> } | null}
 */
export function getResourceBudgetForSkill(registrySkillEntry) {
  if (!registrySkillEntry || typeof registrySkillEntry !== "object") {
    return null;
  }
  const entry = /** @type {Record<string, unknown>} */ (registrySkillEntry);
  const raw = entry.resource_budget;
  const normalized = normalizeResourceBudget(raw);
  if (!normalized || typeof normalized.mode !== "string") {
    return null;
  }
  return { mode: normalized.mode, normalized };
}
