/**
 * Bootstrap Run Ledger — retention settings (V1)
 *
 * Settings are stored in KV under the key 'observability:settings'.
 * Empty KV returns defaults. All values are validated with safe bounds.
 */

// ── Types ─────────────────────────────────────────────────────────────────────

export interface ObservabilitySettings {
  /** Retention period for raw run evidence in days. Range: 1–30. */
  raw_retention_days: number;
  /** Retention period for per-run summary objects in days. Range: 7–365. */
  summary_retention_days: number;
  /** Retention period for daily aggregate objects in days. Range: 30–730. */
  aggregate_retention_days: number;
  /** Maximum number of phase events stored per run. Range: 1–500. */
  max_events_per_run: number;
  /** Maximum length in characters for free-text message fields. Range: 64–4096. */
  max_message_length: number;
}

// ── Bounds ────────────────────────────────────────────────────────────────────

export const SETTINGS_BOUNDS = {
  raw_retention_days: { min: 1, max: 30 },
  summary_retention_days: { min: 7, max: 365 },
  aggregate_retention_days: { min: 30, max: 730 },
  max_events_per_run: { min: 1, max: 500 },
  max_message_length: { min: 64, max: 4096 },
} as const;

// ── Defaults ──────────────────────────────────────────────────────────────────

export const DEFAULT_SETTINGS: ObservabilitySettings = {
  raw_retention_days: 7,
  summary_retention_days: 90,
  aggregate_retention_days: 365,
  max_events_per_run: 100,
  max_message_length: 2048,
};

const KV_SETTINGS_KEY = "observability:settings";

// ── Validation ────────────────────────────────────────────────────────────────

export type SettingsValidationResult =
  | { ok: true; value: ObservabilitySettings }
  | { ok: false; errors: string[] };

/**
 * Validate a settings object against safe bounds.
 * Returns all validation errors, not just the first.
 */
export function validateObservabilitySettings(
  input: unknown,
): SettingsValidationResult {
  const errors: string[] = [];

  if (typeof input !== "object" || input === null || Array.isArray(input)) {
    return { ok: false, errors: ["Settings must be a JSON object"] };
  }

  const data = input as Record<string, unknown>;
  const result: Partial<ObservabilitySettings> = {};

  for (const [field, bounds] of Object.entries(SETTINGS_BOUNDS) as Array<
    [keyof ObservabilitySettings, { min: number; max: number }]
  >) {
    const v = data[field];
    if (v === undefined) {
      // Use default for missing fields
      result[field] = DEFAULT_SETTINGS[field];
      continue;
    }
    if (typeof v !== "number" || !Number.isInteger(v) || !Number.isFinite(v)) {
      errors.push(`Field '${field}' must be an integer`);
      continue;
    }
    if (v < bounds.min || v > bounds.max) {
      errors.push(
        `Field '${field}' must be between ${bounds.min} and ${bounds.max} (got ${v})`,
      );
      continue;
    }
    result[field] = v;
  }

  if (errors.length > 0) {
    return { ok: false, errors };
  }

  return { ok: true, value: result as ObservabilitySettings };
}

// ── KV I/O ────────────────────────────────────────────────────────────────────

type KvStore = {
  get(key: string): Promise<string | null> | string | null;
  put(key: string, value: string): Promise<void>;
};

/**
 * Read observability settings from KV.
 * Returns defaults if the key is absent or contains invalid JSON.
 */
export async function readObservabilitySettings(
  kv: KvStore | undefined,
): Promise<ObservabilitySettings> {
  if (!kv) return { ...DEFAULT_SETTINGS };

  let raw: string | null;
  try {
    raw = await kv.get(KV_SETTINGS_KEY);
  } catch {
    return { ...DEFAULT_SETTINGS };
  }

  if (!raw) return { ...DEFAULT_SETTINGS };

  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return { ...DEFAULT_SETTINGS };
  }

  const result = validateObservabilitySettings(parsed);
  if (!result.ok) return { ...DEFAULT_SETTINGS };

  return result.value;
}

/**
 * Persist validated settings to KV.
 */
export async function writeObservabilitySettings(
  kv: KvStore,
  settings: ObservabilitySettings,
): Promise<void> {
  await kv.put(KV_SETTINGS_KEY, JSON.stringify(settings));
}
