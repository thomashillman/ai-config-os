import { test } from "node:test";
import assert from "node:assert/strict";
import { safeImport } from "../lib/windows-safe-import.mjs";

const modulePromise = safeImport(
  "../verify-skills-kv-publication.mjs",
  import.meta.url,
);

test("verifyPublication_checks_versioned_and_latest_keys", async () => {
  const { verifyPublication } = await modulePromise;
  const seen = [];

  verifyPublication({
    expectedVersion: "1.2.3",
    env: {
      CLOUDFLARE_ACCOUNT_ID: "acct",
      CLOUDFLARE_API_TOKEN: "token",
      MANIFEST_KV_NAMESPACE_ID: "92c2036894ca42d2a7732ea98c0c53a6",
    },
    runner: (_cmd, args) => {
      const url = args.find((arg) => String(arg).startsWith("https://"));
      seen.push(url);
      return {
        status: 0,
        stdout: JSON.stringify({
          version: "1.2.3",
          skills: { debug: { "SKILL.md": "# Debug" } },
        }),
        stderr: "",
      };
    },
    logger: () => {},
  });

  assert.equal(seen.length, 2);
  assert.ok(seen[0].includes("claude-code-package%3A1.2.3"));
  assert.ok(seen[1].includes("claude-code-package%3Alatest"));
});

test("verifyPublication_fails_on_version_mismatch", async () => {
  const { verifyPublication } = await modulePromise;

  assert.throws(
    () =>
      verifyPublication({
        expectedVersion: "1.2.3",
        env: {
          CLOUDFLARE_ACCOUNT_ID: "acct",
          CLOUDFLARE_API_TOKEN: "token",
          MANIFEST_KV_NAMESPACE_ID: "92c2036894ca42d2a7732ea98c0c53a6",
        },
        runner: () => ({
          status: 0,
          stdout: JSON.stringify({
            version: "9.9.9",
            skills: { debug: { "SKILL.md": "# Debug" } },
          }),
          stderr: "",
        }),
        logger: () => {},
      }),
    /expected 1.2.3/,
  );
});

test("verifyPublication_fails_when_namespace_does_not_match_worker_binding", async () => {
  const { verifyPublication } = await modulePromise;

  assert.throws(
    () =>
      verifyPublication({
        expectedVersion: "1.2.3",
        env: {
          CLOUDFLARE_ACCOUNT_ID: "acct",
          CLOUDFLARE_API_TOKEN: "token",
          MANIFEST_KV_NAMESPACE_ID: "different-namespace",
        },
        runner: () => ({ status: 0, stdout: "{}", stderr: "" }),
        logger: () => {},
      }),
    /MANIFEST_KV_NAMESPACE_ID mismatch/,
  );
});
