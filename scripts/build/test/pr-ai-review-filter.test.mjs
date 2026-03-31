import { test } from "node:test";
import assert from "node:assert";
import { filterDiffForReview } from "../../ci/pr-ai-review.mjs";

test("filterDiffForReview: keeps normal paths", () => {
  const diff = `diff --git a/lib/foo.mjs b/lib/foo.mjs
index 111..222 100644
--- a/lib/foo.mjs
+++ b/lib/foo.mjs
@@ -1 +1 @@
-a
+b
`;
  const r = filterDiffForReview(diff);
  assert.ok(r.text.includes("lib/foo.mjs"));
  assert.strictEqual(r.droppedFiles, 0);
});

test("filterDiffForReview: drops .env paths", () => {
  const diff = `diff --git a/.env b/.env
--- a/.env
+++ b/.env
@@ -1 +1 @@
-x
+y
diff --git a/readme.md b/readme.md
--- a/readme.md
+++ b/readme.md
@@ -1 +1 @@
-a
+b
`;
  const r = filterDiffForReview(diff);
  assert.ok(!r.text.includes(".env"));
  assert.ok(r.text.includes("readme.md"));
  assert.ok(r.droppedFiles >= 1);
});

test("filterDiffForReview: drops secrets directory", () => {
  const diff = `diff --git a/secrets/key.txt b/secrets/key.txt
--- a/secrets/key.txt
+++ b/secrets/key.txt
@@ -1 +1 @@
-a
+b
`;
  const r = filterDiffForReview(diff);
  assert.ok(!r.text.includes("secrets/key"));
  assert.strictEqual(r.droppedFiles, 1);
});
