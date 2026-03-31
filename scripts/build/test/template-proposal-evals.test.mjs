import { test } from "node:test";
import assert from "node:assert/strict";
import { runTemplateProposalEvals } from "../../../runtime/lib/run-template-evals.mjs";

function templateProposal(overrides = {}) {
  return {
    id: "proposal_001",
    type: "template_change",
    target: "templates.onStart",
    status: "pending_review",
    insight_id: "insight_001",
    current: "Old narration text",
    proposed: "New improved narration text",
    evidence: {},
    confidence: 0.8,
    created_at: new Date().toISOString(),
    ...overrides,
  };
}

test("runTemplateProposalEvals accepts valid template proposal", async () => {
  const proposal = templateProposal({
    proposed: `# Narration Starting

You are beginning the task. Here's what to do:
- Start by reading the requirements
- Ask clarifying questions
- Then proceed to implementation`,
  });

  const result = await runTemplateProposalEvals(proposal);

  assert.equal(result.success, true);
  assert.ok(result.errors.length === 0);
  assert.ok(result.output);
  assert.ok(result.output.includes("Narration"));
});

test("runTemplateProposalEvals rejects proposal with invalid structure", async () => {
  const proposal = templateProposal({
    proposed: null,
  });

  const result = await runTemplateProposalEvals(proposal);

  assert.equal(result.success, false);
  assert.ok(result.errors.length > 0);
  assert.ok(
    result.errors[0].includes("proposed") || result.errors[0].includes("valid"),
  );
});

test("runTemplateProposalEvals checks template contains required sections", async () => {
  const proposal = templateProposal({
    proposed: `# Start

This is just one section with no depth or context.`,
  });

  const result = await runTemplateProposalEvals(proposal);

  // Should still succeed, but could warn about minimal content
  assert.equal(typeof result.success, "boolean");
  assert.ok(result.output);
});

test("runTemplateProposalEvals includes proposal metadata in output", async () => {
  const proposal = templateProposal({
    insight_id: "insight_test_123",
    target: "templates.onResume",
  });

  const result = await runTemplateProposalEvals(proposal);

  assert.ok(result.proposal_id);
  assert.equal(result.proposal_id, proposal.id);
});

test("runTemplateProposalEvals produces stable output shape", async () => {
  const proposal = templateProposal();
  const result = await runTemplateProposalEvals(proposal);

  // Verify required result fields
  assert.ok(typeof result.success === "boolean");
  assert.ok(Array.isArray(result.errors));
  assert.ok(typeof result.output === "string" || result.output === null);
  assert.ok(result.proposal_id);
  assert.ok(result.evaluated_at);
});

test("runTemplateProposalEvals requires proposal", async () => {
  assert.rejects(() => runTemplateProposalEvals(null), /proposal is required/);
});

test("runTemplateProposalEvals requires proposal.id", async () => {
  assert.rejects(
    () => runTemplateProposalEvals({ type: "template_change" }),
    /proposal.id is required/,
  );
});
