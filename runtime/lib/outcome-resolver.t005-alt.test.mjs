import test from "node:test";
import assert from "node:assert/strict";
import {
  resolveEffectiveOutcomeContract,
  scoreRoutesByEquivalence,
  setOutcomeResolverLoader,
  resetOutcomeResolverLoader,
} from "./outcome-resolver.mjs";

test.afterEach(() => {
  resetOutcomeResolverLoader();
});

test("T005 alt: resolution uses a single loader snapshot even if loader changes between calls", () => {
  let calls = 0;
  setOutcomeResolverLoader(() => {
    calls += 1;

    if (calls === 1) {
      return {
        toolOutcomeMap: { unstable_tool: "stable.outcome" },
        outcomesById: {
          "stable.outcome": { routes: ["stable.route"] },
        },
        routesById: {
          "stable.route": {
            id: "stable/route",
            channel: "script",
            equivalence: "exact",
            requiredCapabilities: ["shell.exec"],
          },
        },
      };
    }

    // If resolver re-loads definitions mid-flight, this poisoned shape would fail.
    return {
      toolOutcomeMap: { unstable_tool: "poisoned.outcome" },
      outcomesById: {
        "poisoned.outcome": { routes: "not-an-array" },
      },
      routesById: {},
    };
  });

  const contract = resolveEffectiveOutcomeContract({
    toolName: "unstable_tool",
  });
  assert.equal(contract.outcomeId, "stable.outcome");
  assert.equal(contract.preferredRoute?.id, "stable/route");
  assert.equal(contract.routeScoringProfileSource, "synthetic-static");
  assert.deepEqual(
    contract.routeScoringProfileSynthetic,
    contract.capabilityProfile,
  );
  assert.equal(calls, 1);
});

test("T005 alt: scoring is deterministic across explicit route permutations with tied scores", () => {
  const capabilityProfile = {
    executionChannel: "mcp",
    capabilities: {
      "shell.exec": "supported",
      "json.output": "supported",
    },
  };

  const permutations = [
    [
      {
        id: "r1",
        channel: "script",
        equivalence: "exact",
        requiredCapabilities: ["shell.exec"],
      },
      {
        id: "r2",
        channel: "script",
        equivalence: "exact",
        requiredCapabilities: ["shell.exec"],
      },
      {
        id: "r3",
        channel: "script",
        equivalence: "high",
        requiredCapabilities: ["shell.exec"],
      },
    ],
    [
      {
        id: "r2",
        channel: "script",
        equivalence: "exact",
        requiredCapabilities: ["shell.exec"],
      },
      {
        id: "r1",
        channel: "script",
        equivalence: "exact",
        requiredCapabilities: ["shell.exec"],
      },
      {
        id: "r3",
        channel: "script",
        equivalence: "high",
        requiredCapabilities: ["shell.exec"],
      },
    ],
  ];

  for (const permuted of permutations) {
    const scored = scoreRoutesByEquivalence(permuted, capabilityProfile);

    const exactIds = scored
      .filter((r) => r.equivalence === "exact")
      .map((r) => r.id);
    assert.equal(scored[0].equivalence, "exact");
    assert.equal(scored[1].equivalence, "exact");
    assert.equal(scored[2].equivalence, "high");

    const expectedExactOrder = permuted
      .filter((r) => r.equivalence === "exact")
      .map((r) => r.id)
      .join(",");
    assert.equal(exactIds.join(","), expectedExactOrder);
  }
});

test("T005 alt: resolver accepts dictionary objects with null prototype", () => {
  const toolOutcomeMap = Object.create(null);
  toolOutcomeMap.null_proto_tool = "nullproto.outcome";

  const outcomesById = Object.create(null);
  outcomesById["nullproto.outcome"] = { routes: ["nullproto.route"] };

  const routesById = Object.create(null);
  routesById["nullproto.route"] = {
    id: "nullproto/route",
    channel: "script",
    equivalence: "exact",
    requiredCapabilities: ["shell.exec"],
  };

  setOutcomeResolverLoader(() => ({
    toolOutcomeMap,
    outcomesById,
    routesById,
  }));

  const contract = resolveEffectiveOutcomeContract({
    toolName: "null_proto_tool",
  });
  assert.equal(contract.outcomeId, "nullproto.outcome");
  assert.equal(contract.preferredRoute?.id, "nullproto/route");
});

test("T005 alt: resolver rejects non-dictionary map objects", () => {
  setOutcomeResolverLoader(() => ({
    toolOutcomeMap: {},
    outcomesById: {},
    routesById: new Map(),
  }));

  assert.throws(
    () => resolveEffectiveOutcomeContract({ toolName: "sync_tools" }),
    /routesById must be an object/,
  );
});
