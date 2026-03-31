/**
 * Rule Module Registry
 *
 * Exports all rule modules in a single place.
 * The dispatcher imports from here to get the rule registry.
 */

import { rule as preToolUseGuard } from "./pre-tool-use-guard.mjs";
import { rule as postToolUseReminder } from "./post-tool-use-reminder.mjs";
import { rule as logSkillUsage } from "./log-skill-usage.mjs";
import { rule as logToolInefficiencies } from "./log-tool-inefficiencies.mjs";
import { rule as skillOutcomeTracker } from "./skill-outcome-tracker.mjs";

export const rules = {
  preToolUseGuard,
  postToolUseReminder,
  logSkillUsage,
  logToolInefficiencies,
  skillOutcomeTracker,
};
