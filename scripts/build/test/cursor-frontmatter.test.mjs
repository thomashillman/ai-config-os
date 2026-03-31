import { test } from "node:test";
import assert from "node:assert/strict";

import {
  transformSkillMdForCursor,
  CURSOR_STRIP_FRONTMATTER_KEYS,
} from "../lib/cursor-frontmatter.mjs";

test("strip list includes known Claude/repo keys", () => {
  assert.ok(CURSOR_STRIP_FRONTMATTER_KEYS.has("hooks"));
  assert.ok(CURSOR_STRIP_FRONTMATTER_KEYS.has("context"));
  assert.ok(CURSOR_STRIP_FRONTMATTER_KEYS.has("skill"));
});

test("transformSkillMdForCursor removes stripped keys and sets name", () => {
  const raw = `---
skill: my-skill
description: Does a thing
hooks:
  PreToolUse: []
context: fork
agent: Explore
---
Body here.
`;
  const skill = { skillName: "my-skill", frontmatter: {} };
  const out = transformSkillMdForCursor(raw, skill, undefined);
  assert.ok(!out.includes("hooks:"), "hooks should be stripped");
  assert.ok(!out.includes("context:"), "context should be stripped");
  assert.ok(out.includes("name: my-skill"), "name should match folder");
  assert.ok(out.includes("description: Does a thing"));
  assert.ok(out.includes("Body here."));
});

test("transformSkillMdForCursor prepends limitation note when compat requires", () => {
  const raw = `---
skill: x
description: Test
---
Hello.
`;
  const skill = {
    skillName: "x",
    frontmatter: { capabilities: { fallback_notes: "Use paste." } },
  };
  const compat = {
    status: "supported",
    mode: "degraded",
    notes: "Partial bridge.",
  };
  const out = transformSkillMdForCursor(raw, skill, compat);
  assert.ok(out.includes("> **Note (Cursor):**"));
  assert.ok(out.includes("LIMITATION (supported/degraded):"));
  assert.ok(out.includes("Partial bridge."));
  assert.ok(out.includes("> **Fallback:** Use paste."));
});

test("transformSkillMdForCursor throws without description", () => {
  const raw = `---
skill: x
---
Body
`;
  assert.throws(
    () =>
      transformSkillMdForCursor(
        raw,
        { skillName: "x", frontmatter: {} },
        undefined,
      ),
    /description required/,
  );
});

test("transformSkillMdForCursor prepends Claude-only note when user-invocable is false", () => {
  const raw = `---
skill: my-skill
description: Internal helper
user-invocable: false
---
Body.
`;
  const skill = { skillName: "my-skill", frontmatter: {} };
  const out = transformSkillMdForCursor(raw, skill, undefined);
  assert.ok(
    out.includes("user-invocable: false"),
    "body note should mention the flag",
  );
  assert.ok(
    out.includes("Claude Code"),
    "note should name Claude Code semantics",
  );
  const fm = out.match(/^---\n([\s\S]*?)\n---\n/);
  assert.ok(fm, "frontmatter block present");
  assert.ok(
    !fm[1].includes("user-invocable"),
    "user-invocable must not remain in YAML frontmatter",
  );
  assert.ok(out.includes("Body."));
});

test("transformSkillMdForCursor omits Claude-only note when user-invocable is true", () => {
  const raw = `---
skill: my-skill
description: Public
user-invocable: true
---
Hi.
`;
  const out = transformSkillMdForCursor(
    raw,
    { skillName: "my-skill", frontmatter: {} },
    undefined,
  );
  assert.ok(!out.includes("user-invocable: false"));
  assert.ok(!out.includes("only the agent may invoke"));
});

test("transformSkillMdForCursor throws when skill id exceeds 64 chars", () => {
  const longId = `a${"b".repeat(63)}`;
  assert.equal(longId.length, 64);
  const raw = `---
skill: x
description: y
---
`;
  assert.throws(
    () =>
      transformSkillMdForCursor(
        raw,
        { skillName: `${longId}x`, frontmatter: {} },
        undefined,
      ),
    /exceeds 64/,
  );
});

test("transformSkillMdForCursor throws when skill id breaks Cursor name pattern", () => {
  const raw = `---
skill: x
description: y
---
`;
  assert.throws(
    () =>
      transformSkillMdForCursor(
        raw,
        { skillName: "Bad_Name", frontmatter: {} },
        undefined,
      ),
    /pattern/,
  );
});

test("transformSkillMdForCursor throws when description exceeds 1024 chars", () => {
  const longDesc = "z".repeat(1025);
  const raw = `---
skill: x
description: ${longDesc}
---
Body
`;
  assert.throws(
    () =>
      transformSkillMdForCursor(
        raw,
        { skillName: "x", frontmatter: {} },
        undefined,
      ),
    /exceeds 1024/,
  );
});

test("transformSkillMdForCursor throws when skill.skillName is missing", () => {
  const raw = `---
skill: x
description: y
---
`;
  assert.throws(
    () => transformSkillMdForCursor(raw, { frontmatter: {} }, undefined),
    /skill\.skillName is required/,
  );
});

test("transformSkillMdForCursor omits Claude-only note when user-invocable is omitted", () => {
  const raw = `---
skill: my-skill
description: Default public
---
Content.
`;
  const out = transformSkillMdForCursor(
    raw,
    { skillName: "my-skill", frontmatter: {} },
    undefined,
  );
  assert.ok(!out.includes("only the agent may invoke"));
  assert.ok(!out.includes("Cursor has no identical flag"));
});
