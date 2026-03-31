// Intent Lexicon — resolves natural language phrases into structured task outcomes.
// Pure function: no I/O, no side effects.
// Deterministic: same input always produces same output.

import { definitions as defaultDefinitions } from "./intent-lexicon-definitions.mjs";

function normalise(phrase) {
  return phrase.toLowerCase().trim().replace(/\s+/g, " ");
}

function levenshtein(a, b) {
  const m = a.length;
  const n = b.length;
  const dp = Array.from({ length: m + 1 }, () => new Array(n + 1).fill(0));

  for (let i = 0; i <= m; i++) dp[i][0] = i;
  for (let j = 0; j <= n; j++) dp[0][j] = j;

  for (let i = 1; i <= m; i++) {
    for (let j = 1; j <= n; j++) {
      dp[i][j] =
        a[i - 1] === b[j - 1]
          ? dp[i - 1][j - 1]
          : 1 + Math.min(dp[i - 1][j], dp[i][j - 1], dp[i - 1][j - 1]);
    }
  }

  return dp[m][n];
}

function matchPattern(phrase, pattern) {
  const phraseTokens = phrase.split(" ");
  const patternTokens = pattern.split(" ");

  if (phraseTokens.length !== patternTokens.length) return null;

  const captures = {};
  for (let i = 0; i < patternTokens.length; i++) {
    if (patternTokens[i] === "*") {
      // Determine capture name from context
      const prevToken = patternTokens[i - 1]?.toLowerCase();
      if (prevToken === "#" || prevToken === "pr") {
        captures.pr_number = phraseTokens[i];
      } else {
        captures[`capture_${i}`] = phraseTokens[i];
      }
    } else if (patternTokens[i] === "#*") {
      // Pattern "#*" matches "#123" — extract the number after #
      if (phraseTokens[i].startsWith("#")) {
        captures.pr_number = phraseTokens[i].slice(1);
      } else {
        return null;
      }
    } else if (patternTokens[i] !== phraseTokens[i]) {
      return null;
    }
  }

  return captures;
}

// Handle patterns like "review pr #*" where # and * are separate tokens
function matchPatternWithHash(phrase, pattern) {
  // Special case: pattern has "#*" which should match "#123"
  const normalPattern = pattern.replace(/#\*/g, "#*");
  const phraseTokens = phrase.split(" ");
  const patternTokens = normalPattern.split(" ");

  // Try to match where "#*" in pattern matches "#<number>" in phrase
  if (patternTokens.length === phraseTokens.length) {
    return matchPattern(phrase, normalPattern);
  }

  // Handle case where pattern has "# *" but phrase has "#123" (merged)
  if (patternTokens.length === phraseTokens.length + 1) {
    // Check if pattern has a "#" followed by "*"
    for (let i = 0; i < patternTokens.length - 1; i++) {
      if (patternTokens[i] === "#" && patternTokens[i + 1] === "*") {
        // Merge these two pattern tokens and try matching
        const mergedPattern = [
          ...patternTokens.slice(0, i),
          "#*",
          ...patternTokens.slice(i + 2),
        ];
        if (mergedPattern.length !== phraseTokens.length) continue;

        let matched = true;
        const captures = {};
        for (let j = 0; j < mergedPattern.length; j++) {
          if (mergedPattern[j] === "#*") {
            if (phraseTokens[j].startsWith("#")) {
              captures.pr_number = phraseTokens[j].slice(1);
            } else {
              matched = false;
              break;
            }
          } else if (mergedPattern[j] === "*") {
            captures[`capture_${j}`] = phraseTokens[j];
          } else if (mergedPattern[j] !== phraseTokens[j]) {
            matched = false;
            break;
          }
        }
        if (matched) return captures;
      }
    }
  }

  return null;
}

/**
 * Returns the user-facing work title for a task type.
 * Looks up the first matching definition's workTitle.
 * Falls back to the taskType string if no match found.
 *
 * @param {string} taskType - e.g. "review_repository"
 * @param {object} [options]
 * @param {Array} [options.definitions] - override definitions
 * @returns {string}
 */
export function workTitleForTaskType(taskType, options = {}) {
  const defs = options.definitions || defaultDefinitions;
  const match = defs.find((def) => def.taskType === taskType);
  return match?.workTitle || taskType;
}

export function resolveIntent(phrase, options = {}) {
  const defs = options.definitions || defaultDefinitions;

  if (!phrase || typeof phrase !== "string" || phrase.trim().length === 0) {
    return { resolved: false, suggestions: [] };
  }

  const normalised = normalise(phrase);

  // Try exact match first, then wildcard match
  let bestMatch = null;
  let bestMatchLength = -1;

  for (const def of defs) {
    for (const pattern of def.patterns) {
      const normalPattern = normalise(pattern);

      // Exact match
      if (normalised === normalPattern) {
        if (normalPattern.length > bestMatchLength) {
          bestMatch = {
            def,
            captures: {},
            patternLength: normalPattern.length,
          };
          bestMatchLength = normalPattern.length;
        }
        continue;
      }

      // Wildcard match
      const captures =
        matchPatternWithHash(normalised, normalPattern) ||
        matchPattern(normalised, normalPattern);
      if (captures && normalPattern.length > bestMatchLength) {
        bestMatch = { def, captures, patternLength: normalPattern.length };
        bestMatchLength = normalPattern.length;
      }
    }
  }

  if (bestMatch) {
    const { def, captures } = bestMatch;
    const routeHints =
      Object.keys(captures).length > 0
        ? { ...def.routeHints, captures }
        : { ...def.routeHints };

    return {
      resolved: true,
      taskType: def.taskType,
      workTitle: def.workTitle,
      routeHints,
      goal: def.goal,
      confidence: def.confidence,
    };
  }

  // No match — produce suggestions by Levenshtein distance
  const allPatterns = defs.flatMap((def) =>
    def.patterns
      .filter((p) => !p.includes("*"))
      .map((p) => ({
        phrase: p,
        taskType: def.taskType,
        distance: levenshtein(normalised, normalise(p)),
      })),
  );

  allPatterns.sort((a, b) => a.distance - b.distance);

  const suggestions = allPatterns.slice(0, 3).map((s) => ({
    phrase: s.phrase,
    taskType: s.taskType,
  }));

  return { resolved: false, suggestions };
}
