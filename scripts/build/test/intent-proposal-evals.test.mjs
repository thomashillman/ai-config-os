import { test } from "node:test";
import assert from "node:assert/strict";
import { runIntentProposalEvals } from "../../../runtime/lib/run-intent-evals.mjs";

function intentProposal(overrides = {}) {
  return {
    id: "proposal_intent_001",
    type: "intent_definition",
    target: "definitions",
    status: "pending_review",
    insight_id: "insight_intent_001",
    proposed: {
      phrases: ["How to retry the request?", "What about error handling?"],
      taskType: "debugging",
    },
    evidence: {
      phrases: ["phrase1", "phrase2", "phrase3"],
    },
    confidence: 0.65,
    created_at: new Date().toISOString(),
    ...overrides,
  };
}

test("runIntentProposalEvals accepts valid intent proposal with new phrases", async () => {
  const proposal = intentProposal({
    proposed: {
      phrases: ["How to debug this?", "What caused the error?"],
      taskType: "debugging",
    },
  });

  const result = await runIntentProposalEvals(proposal);

  assert.equal(result.success, true);
  assert.ok(result.errors.length === 0);
  assert.ok(result.phrases_checked >= 2);
  assert.equal(result.proposal_id, proposal.id);
});

test("runIntentProposalEvals checks that proposed intent is not empty", async () => {
  const proposal = intentProposal({
    proposed: {
      phrases: [],
      taskType: "debugging",
    },
  });

  const result = await runIntentProposalEvals(proposal);

  assert.equal(result.success, false);
  assert.ok(result.errors.length > 0);
});

test("runIntentProposalEvals validates phrases are strings", async () => {
  const proposal = intentProposal({
    proposed: {
      phrases: ["valid phrase", null, "another phrase"],
      taskType: "debugging",
    },
  });

  const result = await runIntentProposalEvals(proposal);

  assert.equal(result.success, false);
  assert.ok(result.errors.length > 0);
});

test("runIntentProposalEvals requires taskType", async () => {
  const proposal = intentProposal({
    proposed: {
      phrases: ["How to fix this?"],
      taskType: null,
    },
  });

  const result = await runIntentProposalEvals(proposal);

  assert.equal(result.success, false);
});

test("runIntentProposalEvals produces stable output shape", async () => {
  const proposal = intentProposal();
  const result = await runIntentProposalEvals(proposal);

  assert.ok(typeof result.success === "boolean");
  assert.ok(Array.isArray(result.errors));
  assert.ok(typeof result.phrases_checked === "number");
  assert.ok(result.proposal_id);
  assert.ok(result.evaluated_at);
  assert.ok(result.task_type !== undefined);
});

test("runIntentProposalEvals tracks phrase count", async () => {
  const phrases = [
    "How should I handle this?",
    "What is the best approach?",
    "Can we optimize this?",
  ];
  const proposal = intentProposal({
    proposed: {
      phrases,
      taskType: "optimization",
    },
  });

  const result = await runIntentProposalEvals(proposal);

  assert.equal(result.success, true);
  assert.equal(result.phrases_checked, phrases.length);
  assert.equal(result.task_type, "optimization");
});

test("runIntentProposalEvals requires proposal", async () => {
  assert.rejects(() => runIntentProposalEvals(null), /proposal is required/);
});

test("runIntentProposalEvals requires proposal.id", async () => {
  assert.rejects(
    () => runIntentProposalEvals({ type: "intent_definition" }),
    /proposal.id is required/,
  );
});

test("runIntentProposalEvals requires proposed to be an object", async () => {
  const proposal = intentProposal({
    proposed: "not an object",
  });

  const result = await runIntentProposalEvals(proposal);

  assert.equal(result.success, false);
});
