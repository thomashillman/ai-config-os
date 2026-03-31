import { test, describe } from "node:test";
import assert from "node:assert/strict";

import { validateOutcomeCompatibility } from "../lib/resolve-compatibility.mjs";

describe("outcome/route compatibility contract", () => {
  const knownCapabilityIds = new Set([
    "git.read",
    "shell.exec",
    "ui.prompt-only",
  ]);

  test("passes when outcomes reference known routes and capabilities", () => {
    const routes = new Map([
      ["automated", { id: "automated", capabilities: ["shell.exec"] }],
      ["manual", { id: "manual", capabilities: ["ui.prompt-only"] }],
    ]);

    const outcomes = new Map([
      [
        "audit",
        {
          id: "audit",
          routes: ["automated", "manual"],
          capabilities: ["git.read"],
        },
      ],
    ]);

    const { errors } = validateOutcomeCompatibility(
      outcomes,
      routes,
      knownCapabilityIds,
    );
    assert.deepEqual(errors, []);
  });

  test("fails when outcome references unknown route", () => {
    const routes = new Map();
    const outcomes = new Map([
      ["audit", { id: "audit", routes: ["missing-route"], capabilities: [] }],
    ]);

    const { errors } = validateOutcomeCompatibility(
      outcomes,
      routes,
      knownCapabilityIds,
    );
    assert.ok(
      errors.some((error) => error.includes("unknown routes: missing-route")),
    );
    assert.ok(
      errors.some((error) => error.includes("no resolvable route set")),
    );
  });

  test("fails gracefully when outcome routes is not an array", () => {
    const routes = new Map([
      ["manual", { id: "manual", capabilities: ["ui.prompt-only"] }],
    ]);
    const outcomes = new Map([
      ["audit", { id: "audit", routes: {}, capabilities: ["git.read"] }],
    ]);

    const { errors } = validateOutcomeCompatibility(
      outcomes,
      routes,
      knownCapabilityIds,
    );
    assert.ok(
      errors.some((error) =>
        error.includes("outcome 'audit'.routes must be an array"),
      ),
    );
    assert.ok(
      errors.some((error) => error.includes("no resolvable route set")),
    );
  });

  test("fails when a route has unknown capabilities even if unreferenced", () => {
    const routes = new Map([
      ["broken", { id: "broken", capabilities: ["missing.capability"] }],
      ["manual", { id: "manual", capabilities: ["ui.prompt-only"] }],
    ]);
    const outcomes = new Map([
      [
        "audit",
        { id: "audit", routes: ["manual"], capabilities: ["git.read"] },
      ],
    ]);

    const { errors } = validateOutcomeCompatibility(
      outcomes,
      routes,
      knownCapabilityIds,
    );
    assert.ok(
      errors.some((error) =>
        error.includes("route 'broken' references unknown capabilities"),
      ),
    );
    assert.equal(
      errors.some((error) => error.includes("no resolvable route set")),
      false,
    );
  });

  test("fails when route or outcome references unknown capabilities", () => {
    const routes = new Map([
      ["automated", { id: "automated", capabilities: ["missing.capability"] }],
    ]);
    const outcomes = new Map([
      [
        "audit",
        {
          id: "audit",
          routes: ["automated"],
          capabilities: ["missing.capability"],
        },
      ],
    ]);

    const { errors } = validateOutcomeCompatibility(
      outcomes,
      routes,
      knownCapabilityIds,
    );
    assert.ok(
      errors.some((error) =>
        error.includes("outcome 'audit' references unknown capabilities"),
      ),
    );
    assert.ok(
      errors.some((error) =>
        error.includes("route 'automated' references unknown capabilities"),
      ),
    );
    assert.ok(
      errors.some((error) => error.includes("no resolvable route set")),
    );
  });
});
