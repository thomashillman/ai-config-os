/**
 * Rule Executor
 *
 * Manages the rule registry and executes rules sequentially.
 * Handles errors gracefully: if a rule throws, log and continue to the next rule.
 */

export class RuleExecutor {
  constructor(rulesRegistry = {}) {
    this.rulesRegistry = rulesRegistry || {};
    this.rules = Object.entries(rulesRegistry).map(([name, rule]) => ({
      name,
      rule,
    }));
  }

  /**
   * Dispatch an event to all applicable rules.
   *
   * @param {Object} event - The validated hook event
   * @returns {Promise<Array>} Array of rule results
   */
  async dispatch(event) {
    if (!event) {
      throw new Error("Event is required");
    }

    const eventType = event.type;
    if (!eventType) {
      throw new Error("Event must have a type field");
    }

    const results = [];

    for (const { name, rule } of this.rules) {
      // Skip rules that don't trigger on this event type
      if (!rule.triggers || !rule.triggers.includes(eventType)) {
        continue;
      }

      try {
        const result = await rule.execute(event);
        results.push({
          ruleName: name,
          ...result,
        });

        // If any rule blocks, we still continue executing other rules
        // but we'll report the block decision to the caller
      } catch (err) {
        // Log error to stderr and continue to next rule (graceful degradation)
        console.error(`Rule "${name}" failed:`, err.message);
        results.push({
          ruleName: name,
          decision: "allow",
          error: err.message,
        });
      }
    }

    return results;
  }

  /**
   * Check if any rule in the results wants to block.
   *
   * @param {Array} results - Rule execution results
   * @returns {Object|null} First blocking result, or null if no blocks
   */
  static getBlockingResult(results) {
    return results.find((r) => r.decision === "block") || null;
  }
}
