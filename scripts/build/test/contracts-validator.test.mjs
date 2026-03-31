import { test, describe } from "node:test";
import assert from "node:assert/strict";
import { validateContract } from "../../../shared/contracts/validate.mjs";

describe("contracts validator", () => {
  test("manifest: accepts valid payload", () => {
    const manifest = {
      version: "1.0.0",
      skill_count: 1,
      platform_count: 1,
      platforms: ["claude-code"],
      skills: [
        {
          id: "code-review",
          version: "1.0.0",
          description: "Structured code review",
          type: "prompt",
          status: "stable",
        },
      ],
    };

    assert.equal(validateContract("manifest", manifest), manifest);
  });

  test("routeDefinition: rejects invalid method", () => {
    assert.throws(
      () =>
        validateContract("routeDefinition", {
          id: "manifest-latest",
          method: "TRACE",
          path: "/v1/manifest/latest",
          outcome_id: "manifest-outcome",
        }),
      /Invalid routeDefinition/,
    );
  });

  test("skillDefinition: validates against canonical skill schema", () => {
    assert.throws(
      () =>
        validateContract("skillDefinition", {
          skill: "bad-skill",
          description: "missing required fields from skill schema",
          type: "prompt",
        }),
      /Invalid skillDefinition/,
    );
  });

  test("unknown contract kind fails fast", () => {
    assert.throws(
      () => validateContract("not-a-kind", {}),
      /Unknown contract kind/,
    );
  });
});
