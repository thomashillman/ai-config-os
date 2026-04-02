import { test } from "node:test";
import assert from "node:assert/strict";
import { chunkArray } from "../../../scripts/ci/lib/chunk-array.mjs";

test("chunkArray splits and preserves order", () => {
  assert.deepEqual(chunkArray([1, 2, 3, 4, 5], 2), [[1, 2], [3, 4], [5]]);
});

test("chunkArray rejects size < 1", () => {
  assert.throws(() => chunkArray([1], 0), /size must be/);
});

test("chunkArray empty input", () => {
  assert.deepEqual(chunkArray([], 10), []);
});
