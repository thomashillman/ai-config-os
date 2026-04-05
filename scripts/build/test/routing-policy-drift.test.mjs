import test from "node:test";
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { routeProfiles } from "../../../runtime/config/route-profiles.mjs";
import { modelPathRegistry } from "../../../runtime/config/model-path-registry.mjs";

test("routing policy validator checks live runtime contracts", () => {
  const output = execFileSync(
    "node",
    ["scripts/validate/routing-policy-drift.mjs"],
    {
      encoding: "utf8",
    },
  );

  assert.match(output, /Starting routing policy validation/);
  assert.match(output, /Live routing policy contracts validated/);
});

test("live route + model registries expose canonical fields", () => {
  assert.ok(routeProfiles.length > 0);
  assert.ok(modelPathRegistry.length > 0);
  assert.equal(typeof routeProfiles[0].identity.route_id, "string");
  assert.equal(typeof modelPathRegistry[0].identity.model_id, "string");
});
