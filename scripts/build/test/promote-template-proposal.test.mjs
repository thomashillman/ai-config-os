import { test } from "node:test";
import assert from "node:assert/strict";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { mkdirSync, rmSync, readFileSync } from "node:fs";
import { createImprovementProposal } from "../../../runtime/lib/improvement-proposal.mjs";
import { promoteTemplateProposal } from "../../../runtime/lib/promote-template-proposal.mjs";

function templateProposal(overrides = {}) {
  return {
    id: "proposal_001",
    type: "template_change",
    target: "templates.onStart",
    status: "pending_review",
    insight_id: "insight_001",
    current: "Old template text",
    proposed: `# Starting Your Task

Welcome! Here's how to begin:
- Understand the requirements
- Ask clarifying questions
- Then start implementation`,
    evidence: { best_point: "onStart" },
    confidence: 0.85,
    created_at: new Date().toISOString(),
    ...overrides,
  };
}

test("promoteTemplateProposal succeeds when eval passes", async () => {
  const tempDir = tmpdir();
  const testDir = join(tempDir, `promote-test-${Date.now()}`);
  mkdirSync(testDir, { recursive: true });

  try {
    const proposal = templateProposal();
    const templatePath = join(testDir, "templates.json");

    const result = await promoteTemplateProposal({
      proposal,
      templateFilePath: templatePath,
    });

    assert.equal(result.success, true);
    assert.ok(result.eval_result);
    assert.equal(result.eval_result.success, true);
    assert.equal(result.proposed_status, "promoted");
    assert.ok(result.message);
  } finally {
    rmSync(testDir, { recursive: true });
  }
});

test("promoteTemplateProposal fails and does not update file when eval fails", async () => {
  const tempDir = tmpdir();
  const testDir = join(tempDir, `promote-test-${Date.now()}`);
  mkdirSync(testDir, { recursive: true });

  try {
    const proposal = templateProposal({
      proposed: null,
    });
    const templatePath = join(testDir, "templates.json");

    const result = await promoteTemplateProposal({
      proposal,
      templateFilePath: templatePath,
    });

    assert.equal(result.success, false);
    assert.ok(result.eval_result);
    assert.equal(result.eval_result.success, false);
    assert.equal(result.proposed_status, "eval_failed");
  } finally {
    rmSync(testDir, { recursive: true });
  }
});

test("promoteTemplateProposal includes eval errors in result", async () => {
  const tempDir = tmpdir();
  const testDir = join(tempDir, `promote-test-${Date.now()}`);
  mkdirSync(testDir, { recursive: true });

  try {
    const proposal = templateProposal({
      proposed: "",
    });
    const templatePath = join(testDir, "templates.json");

    const result = await promoteTemplateProposal({
      proposal,
      templateFilePath: templatePath,
    });

    assert.equal(result.success, false);
    assert.ok(result.eval_result.errors.length > 0);
  } finally {
    rmSync(testDir, { recursive: true });
  }
});

test("promoteTemplateProposal creates proposal status update object", async () => {
  const tempDir = tmpdir();
  const testDir = join(tempDir, `promote-test-${Date.now()}`);
  mkdirSync(testDir, { recursive: true });

  try {
    const proposal = templateProposal();
    const templatePath = join(testDir, "templates.json");

    const result = await promoteTemplateProposal({
      proposal,
      templateFilePath: templatePath,
    });

    assert.ok(result.updated_proposal);
    assert.equal(result.updated_proposal.id, proposal.id);
    assert.equal(result.updated_proposal.status, "promoted");
    assert.ok(result.updated_proposal.promoted_at);
  } finally {
    rmSync(testDir, { recursive: true });
  }
});

test("promoteTemplateProposal requires proposal", async () => {
  assert.rejects(
    () =>
      promoteTemplateProposal({
        templateFilePath: "/tmp/test.json",
      }),
    /proposal is required/,
  );
});

test("promoteTemplateProposal requires templateFilePath", async () => {
  const proposal = templateProposal();
  assert.rejects(
    () =>
      promoteTemplateProposal({
        proposal,
      }),
    /templateFilePath is required/,
  );
});

test("promoteTemplateProposal returns stable result shape", async () => {
  const tempDir = tmpdir();
  const testDir = join(tempDir, `promote-test-${Date.now()}`);
  mkdirSync(testDir, { recursive: true });

  try {
    const proposal = templateProposal();
    const templatePath = join(testDir, "templates.json");

    const result = await promoteTemplateProposal({
      proposal,
      templateFilePath: templatePath,
    });

    assert.ok(typeof result.success === "boolean");
    assert.ok(result.eval_result);
    assert.ok(result.proposed_status);
    assert.ok(result.updated_proposal);
    assert.ok(result.message);
    assert.ok(result.promoted_at);
  } finally {
    rmSync(testDir, { recursive: true });
  }
});
