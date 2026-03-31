/**
 * resolver-selection-contract.test.mjs
 *
 * Contract gate: emitted platform selection must be deterministic and include
 * only platforms that both (a) have compatible skills and (b) have an emitter.
 */
import { test } from "node:test";
import assert from "node:assert/strict";

import { selectEmittedPlatforms } from "../lib/select-emitted-platforms.mjs";

test("resolver selection contract: excludes platforms without emitters", () => {
  const platformSkills = {
    "claude-code": [{}],
    cursor: [{}],
    "future-platform": [{}],
  };

  const emitterRegistry = {
    "claude-code": () => {},
    cursor: () => {},
  };

  const selected = selectEmittedPlatforms(platformSkills, emitterRegistry);

  assert.deepEqual(selected, ["claude-code", "cursor"]);
});

test("resolver selection contract: preserves deterministic insertion order", () => {
  const platformSkills = {
    cursor: [{}],
    "claude-code": [{}],
  };

  const emitterRegistry = {
    "claude-code": () => {},
    cursor: () => {},
  };

  const selected = selectEmittedPlatforms(platformSkills, emitterRegistry);

  assert.deepEqual(selected, ["cursor", "claude-code"]);
});
