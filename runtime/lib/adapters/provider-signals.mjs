/**
 * Parse provider HTTP / retry signals into normalized flags (Atom 2).
 * Keep logic small and testable; do not import planner or meter internals.
 */

/**
 * @typedef {object} ProviderSignalSource
 * @property {number} [http_status]
 * @property {string} [body_snippet]
 * @property {number} [retry_after] seconds
 * @property {boolean} [latency_spike]
 */

/**
 * @param {unknown} source
 * @returns {{ throttle_detected: number; model_unavailable_detected: number; latency_spike_detected: number }}
 */
export function extractProviderSignals(source) {
  const s =
    source !== null && typeof source === "object"
      ? /** @type {Record<string, unknown>} */ (source)
      : {};
  const status = typeof s.http_status === "number" ? s.http_status : undefined;
  const body = String(s.body_snippet ?? "");
  const throttle =
    status === 429 ||
    status === 503 ||
    (typeof s.retry_after === "number" && s.retry_after > 0) ||
    /rate limit|too many requests/i.test(body);
  const modelUnavailable =
    status === 404 || /model.*unavailable|overloaded|capacity/i.test(body);
  const latencySpike = s.latency_spike === true;
  return {
    throttle_detected: throttle ? 1 : 0,
    model_unavailable_detected: modelUnavailable ? 1 : 0,
    latency_spike_detected: latencySpike ? 1 : 0,
  };
}
