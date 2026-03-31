import { test } from "node:test";
import assert from "node:assert/strict";
import { createImprovementProposal } from "../../../runtime/lib/improvement-proposal.mjs";

function templateInsight() {
  return {
    id: "insight_001",
    type: "template_effectiveness",
    finding: "'onStart' narrations get 90% engagement vs 60% for 'onShelfView'",
    evidence: {
      best_point: "onStart",
      best_rate: 0.9,
      best_total: 10,
      worst_point: "onShelfView",
      worst_rate: 0.6,
      worst_total: 5,
    },
    suggestion: {
      target: "templates.onShelfView",
      current: null,
      proposed: null,
      confidence: 0.85,
    },
  };
}

function intentInsight() {
  return {
    id: "insight_002",
    type: "intent_coverage",
    finding: "3 follow-up phrases could map to known task types",
    evidence: {
      phrases: [
        "How to retry the request?",
        "What about error handling?",
        "Can we add caching?",
      ],
    },
    suggestion: {
      target: "definitions",
      action: "add_patterns",
      patterns: ["How to retry the request?", "What about error handling?"],
      taskType: null,
      confidence: 0.65,
    },
  };
}

test("createImprovementProposal generates template change proposal", () => {
  const insight = templateInsight();
  const proposal = createImprovementProposal({
    insight,
    target: "templates.onShelfView",
    current: "existing template text...",
    proposed: "improved template text...",
  });

  assert.ok(proposal);
  assert.equal(typeof proposal.id, "string");
  assert.ok(proposal.id.startsWith("proposal_"));

  assert.equal(proposal.type, "template_change");
  assert.equal(proposal.target, "templates.onShelfView");
  assert.equal(proposal.status, "pending_review");

  // Required fields
  assert.ok(proposal.created_at);
  assert.ok(proposal.insight_id === "insight_001");
  assert.equal(proposal.current, "existing template text...");
  assert.equal(proposal.proposed, "improved template text...");

  // Evidence and confidence
  assert.ok(proposal.evidence);
  assert.equal(proposal.evidence.best_point, "onStart");
  assert.ok(proposal.confidence >= 0 && proposal.confidence <= 1);
  assert.equal(proposal.confidence, insight.suggestion.confidence);
});

test("createImprovementProposal generates intent definition proposal", () => {
  const insight = intentInsight();
  const proposal = createImprovementProposal({
    insight,
    target: "definitions",
    proposed: {
      phrases: ["How to retry the request?", "What about error handling?"],
      taskType: "debugging",
    },
  });

  assert.ok(proposal);
  assert.equal(proposal.type, "intent_definition");
  assert.equal(proposal.target, "definitions");
  assert.equal(proposal.status, "pending_review");

  assert.ok(proposal.insight_id === "insight_002");
  assert.deepEqual(proposal.proposed, {
    phrases: ["How to retry the request?", "What about error handling?"],
    taskType: "debugging",
  });

  assert.ok(proposal.evidence);
  assert.deepEqual(proposal.evidence.phrases, insight.evidence.phrases);
  assert.equal(proposal.confidence, 0.65);
});

test("createImprovementProposal includes finding from insight", () => {
  const insight = templateInsight();
  const proposal = createImprovementProposal({
    insight,
    target: "templates.onShelfView",
    current: "old text",
    proposed: "new text",
  });

  assert.equal(proposal.finding, insight.finding);
});

test("createImprovementProposal generates unique IDs", () => {
  const insight1 = templateInsight();
  const insight2 = { ...templateInsight(), id: "insight_003" };

  const proposal1 = createImprovementProposal({
    insight: insight1,
    target: "templates.onShelfView",
    current: "old",
    proposed: "new",
  });

  const proposal2 = createImprovementProposal({
    insight: insight2,
    target: "templates.onStart",
    current: "old",
    proposed: "new",
  });

  assert.notEqual(proposal1.id, proposal2.id);
});

test("createImprovementProposal with partial current/proposed", () => {
  const insight = intentInsight();
  const proposal = createImprovementProposal({
    insight,
    target: "definitions",
    current: null,
    proposed: { phrases: ["new phrase"] },
  });

  assert.equal(proposal.current, null);
  assert.deepEqual(proposal.proposed, { phrases: ["new phrase"] });
  assert.ok(proposal.evidence);
});

test("createImprovementProposal requires insight", () => {
  assert.throws(
    () =>
      createImprovementProposal({
        target: "definitions",
        proposed: {},
      }),
    /insight is required/,
  );
});

test("createImprovementProposal requires target", () => {
  const insight = templateInsight();
  assert.throws(
    () =>
      createImprovementProposal({
        insight,
        proposed: "new text",
      }),
    /target is required/,
  );
});

test("createImprovementProposal sets stable timestamp format", () => {
  const insight = templateInsight();
  const proposal = createImprovementProposal({
    insight,
    target: "templates.onStart",
    current: "old",
    proposed: "new",
  });

  assert.ok(proposal.created_at);
  // ISO 8601 format (allows optional milliseconds)
  assert.ok(
    /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d{3})?Z$/.test(
      proposal.created_at,
    ),
  );
});
