// Input validation helpers for the MCP server and dashboard API.
// Extracted to a standalone module so tests can import without
// pulling in the full MCP server dependency tree.

export const SAFE_NAME = /^[a-z0-9][a-z0-9_-]*$/;

export function validateName(name) {
  if (typeof name !== "string" || !SAFE_NAME.test(name)) {
    throw new Error(`Invalid name: must match ${SAFE_NAME}`);
  }
  return name;
}

export function validateNumber(value, fallback) {
  const n = Number(value);
  if (!Number.isFinite(n)) return fallback;
  return n;
}
