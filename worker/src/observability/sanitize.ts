/**
 * Bootstrap Run Ledger — field sanitization (V1)
 *
 * Strip or escape control characters from free-text fields before storage.
 * Keeps printable Unicode intact; removes characters that could corrupt logs
 * or enable log-injection attacks.
 */

/**
 * Sanitize a single log field value.
 *
 * Removes:
 *   - ASCII control characters (0x00–0x1F) except space (0x20)
 *   - DEL character (0x7F)
 *   - Unicode control categories Cc and Cf (zero-width, direction overrides, etc.)
 *
 * Specifically replaces:
 *   - CR (\r, 0x0D), LF (\n, 0x0A), Tab (\t, 0x09) — replaced with space
 *   - Null byte (\0, 0x00) — removed entirely
 *   - Other control chars (0x01–0x08, 0x0B–0x0C, 0x0E–0x1F, 0x7F) — removed
 *   - Unicode Cf (format) characters — removed
 *
 * Non-string values are returned as-is.
 */
export function sanitizeLogField(value: unknown): unknown {
  if (typeof value !== 'string') return value;

  // Replace CR, LF, Tab with a single space (readable; prevents log-splitting)
  let result = value.replace(/[\r\n\t]/g, ' ');

  // Remove null bytes and remaining ASCII control chars (except space=0x20)
  // eslint-disable-next-line no-control-regex
  result = result.replace(/[\x00-\x08\x0B\x0C\x0E-\x1F\x7F]/g, '');

  // Remove Unicode direction/format overrides (Cf category: U+200B–U+200F,
  // U+202A–U+202E, U+2060–U+2069, U+FEFF, U+FFF9–U+FFFB)
  result = result.replace(/[\u200B-\u200F\u202A-\u202E\u2060-\u2069\uFEFF\uFFF9-\uFFFB]/g, '');

  return result;
}

/**
 * Recursively sanitize all string leaves in a plain object or array.
 * Only descends into plain objects and arrays; leaves non-string scalars intact.
 * Returns a new object (does not mutate the input).
 */
export function sanitizeRecord(value: unknown): unknown {
  if (typeof value === 'string') {
    return sanitizeLogField(value);
  }
  if (Array.isArray(value)) {
    return value.map(sanitizeRecord);
  }
  if (typeof value === 'object' && value !== null) {
    const result: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
      result[k] = sanitizeRecord(v);
    }
    return result;
  }
  return value;
}
