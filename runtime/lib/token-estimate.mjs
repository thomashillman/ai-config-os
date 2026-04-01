/**
 * Heuristic token estimates for context packing (Atom 4).
 * Deterministic: no provider round-trips; ~4 Latin chars per token.
 */

/** Chars per estimated token (deterministic v1). */
export const CHARS_PER_TOKEN_ESTIMATE = 4;

/**
 * @param {string} s
 * @returns {number}
 */
export function estimateTokensFromString(s) {
  if (typeof s !== "string" || s.length === 0) return 0;
  return Math.ceil(s.length / CHARS_PER_TOKEN_ESTIMATE);
}

/**
 * @param {Array<{ role: string, content: string }>} messages
 * @returns {number}
 */
export function estimateTokensFromMessages(messages) {
  if (!Array.isArray(messages)) return 0;
  let n = 0;
  for (const m of messages) {
    if (m && typeof m.content === "string") {
      n += estimateTokensFromString(m.content);
    }
  }
  return n;
}

/**
 * @param {Array<{ title: string, body: string }>} artifacts
 * @returns {number}
 */
export function estimateTokensFromArtifacts(artifacts) {
  if (!Array.isArray(artifacts)) return 0;
  let n = 0;
  for (const a of artifacts) {
    if (!a) continue;
    if (typeof a.title === "string") n += estimateTokensFromString(a.title);
    if (typeof a.body === "string") n += estimateTokensFromString(a.body);
  }
  return n;
}

/**
 * @param {import('../../shared/contracts/resource-policy-types.mjs').PackedTaskState} ts
 * @returns {number}
 */
export function estimatePackedTaskStateTokens(ts) {
  if (!ts || typeof ts !== "object") return 0;
  let n = estimateTokensFromString(
    typeof ts.system_prompt === "string" ? ts.system_prompt : "",
  );
  n += estimateTokensFromMessages(
    Array.isArray(ts.messages) ? ts.messages : [],
  );
  n += estimateTokensFromString(
    typeof ts.optional_retrieval === "string" ? ts.optional_retrieval : "",
  );
  n += estimateTokensFromArtifacts(
    Array.isArray(ts.artifacts) ? ts.artifacts : [],
  );
  return n;
}

/**
 * Shorten `text` to the longest prefix whose estimated token count is <= maxTokens.
 *
 * @param {string} text
 * @param {number} maxTokens
 * @returns {string}
 */
export function truncateStringToMaxTokens(text, maxTokens) {
  if (typeof text !== "string" || text.length === 0) return "";
  if (
    !Number.isFinite(maxTokens) ||
    maxTokens < 0 ||
    estimateTokensFromString(text) <= maxTokens
  ) {
    return text;
  }
  let lo = 0;
  let hi = text.length;
  while (lo < hi) {
    const mid = Math.ceil((lo + hi) / 2);
    const slice = text.slice(0, mid);
    if (estimateTokensFromString(slice) <= maxTokens) lo = mid;
    else hi = mid - 1;
  }
  return text.slice(0, lo);
}
