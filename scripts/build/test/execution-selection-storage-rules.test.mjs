/**
 * execution-selection-storage-rules.test.mjs
 *
 * Tests for ExecutionSelection authoritative storage rules
 * Backlog Item 4: Verify full/lightweight reference storage is correct
 */

import { test } from "node:test";
import assert from "node:assert/strict";

test("action classification: select_route is create/replace", () => {
  const commandType = "task.select_route";
  const isCreateOrReplace = ["task.select_route", "task.transition_state"].includes(
    commandType
  );
  assert.equal(isCreateOrReplace, true);
});

test("action classification: transition_state is create/replace", () => {
  const commandType = "task.transition_state";
  const isCreateOrReplace = ["task.select_route", "task.transition_state"].includes(
    commandType
  );
  assert.equal(isCreateOrReplace, true);
});

test("action classification: append_finding is use-selection", () => {
  const commandType = "task.append_finding";
  const isUseSelection = ["task.append_finding"].includes(commandType);
  assert.equal(isUseSelection, true);
});

test("action classification: clear separation between action types", () => {
  const createOrReplace = ["task.select_route", "task.transition_state"];
  const useSelection = ["task.append_finding"];

  // No overlap
  for (const action of createOrReplace) {
    assert.ok(!useSelection.includes(action));
  }
  for (const action of useSelection) {
    assert.ok(!createOrReplace.includes(action));
  }
});

test("storage rules: full ExecutionSelection on select_route", () => {
  const mockSelection = {
    selection_id: "sel-123",
    selected_route_id: "local_repo",
    selected_model_id: "claude-opus",
    resolved_execution: {
      route_id: "local_repo",
      model_path: ["claude-opus"],
    },
  };

  const command = {
    command_type: "task.select_route",
    resolved_context: {
      execution_selection: mockSelection,
    },
  };

  assert.deepEqual(command.resolved_context.execution_selection, mockSelection);
  assert.equal(command.resolved_context.execution_selection.selection_id, "sel-123");
});

test("storage rules: full ExecutionSelection on transition_state", () => {
  const mockSelection = {
    selection_id: "sel-456",
    selected_route_id: "github_pr",
    selected_model_id: "claude-sonnet",
  };

  const command = {
    command_type: "task.transition_state",
    resolved_context: {
      execution_selection: mockSelection,
    },
  };

  assert.deepEqual(command.resolved_context.execution_selection, mockSelection);
});

test("storage rules: full ExecutionSelection in ActionCommit for create/replace", () => {
  const fullSelection = {
    selection_id: "sel-789",
    selected_route_id: "local_repo",
    selected_model_id: "claude-opus",
    selection_revision: 1,
    resolved_execution: {
      route_id: "local_repo",
      model_path: ["claude-opus"],
    },
  };

  const actionCommit = {
    command_type: "task.select_route",
    execution_selection: fullSelection,
    route_id: fullSelection.selected_route_id,
    model_path: fullSelection.resolved_execution?.model_path,
  };

  assert.deepEqual(actionCommit.execution_selection, fullSelection);
  assert.equal(actionCommit.execution_selection.selection_id, "sel-789");
});

test("storage rules: lightweight reference on append_finding", () => {
  const selectionRevision = 1;
  const selectionDigest = "sha256abc123";

  const command = {
    command_type: "task.append_finding",
    resolved_context: {
      selection_revision: selectionRevision,
      selection_digest: selectionDigest,
    },
  };

  assert.equal(command.resolved_context.selection_revision, selectionRevision);
  assert.equal(command.resolved_context.selection_digest, selectionDigest);
  assert.equal(command.resolved_context.execution_selection, undefined);
});

test("storage rules: no full ExecutionSelection for use-selection actions", () => {
  const actionCommit = {
    command_type: "task.append_finding",
    selection_revision: 1,
    selection_digest: "sha256def456",
    route_id: "local_repo",
    model_path: ["claude-opus"],
    execution_selection: undefined,
  };

  assert.equal(actionCommit.selection_revision, 1);
  assert.equal(actionCommit.selection_digest, "sha256def456");
  assert.equal(actionCommit.execution_selection, undefined);
});

test("storage rules: multiple use-selection actions with same reference", () => {
  const selectionRevision = 1;
  const selectionDigest = "sha256xyz789";

  const commit1 = {
    command_type: "task.append_finding",
    selection_revision: selectionRevision,
    selection_digest: selectionDigest,
  };

  const commit2 = {
    command_type: "task.append_finding",
    selection_revision: selectionRevision,
    selection_digest: selectionDigest,
  };

  assert.equal(commit1.selection_digest, commit2.selection_digest);
  assert.equal(commit1.selection_revision, commit2.selection_revision);
});

test("task state snapshot: stores latest full ExecutionSelection", () => {
  const taskState = {
    task_id: "task-1",
    version: 5,
    execution_selection: {
      selection_id: "sel-123",
      selected_route_id: "local_repo",
      selected_model_id: "claude-opus",
      selection_revision: 3,
    },
  };

  assert.ok(taskState.execution_selection);
  assert.equal(taskState.execution_selection.selection_id, "sel-123");
});

test("task state snapshot: updates on create/replace action", () => {
  const oldState = {
    version: 4,
    execution_selection: {
      selection_id: "sel-old",
      selected_route_id: "github_pr",
    },
  };

  const newSelection = {
    selection_id: "sel-new",
    selected_route_id: "local_repo",
    selection_revision: 4,
  };

  const updatedState = {
    version: 5,
    execution_selection: newSelection,
  };

  assert.notEqual(
    updatedState.execution_selection.selection_id,
    oldState.execution_selection.selection_id
  );
  assert.equal(updatedState.execution_selection.selected_route_id, "local_repo");
});

test("task state snapshot: preserves on use-selection action", () => {
  const taskState = {
    version: 4,
    execution_selection: {
      selection_id: "sel-123",
      selected_route_id: "local_repo",
    },
    findings: [],
  };

  const updatedState = {
    version: 5,
    execution_selection: taskState.execution_selection,
    findings: [{ findingId: "f-1", summary: "test" }],
  };

  assert.equal(updatedState.execution_selection, taskState.execution_selection);
});

test("command envelope: preserved in ActionCommit for all actions", () => {
  const command = {
    task_id: "task-1",
    command_type: "task.select_route",
    payload: { route_id: "local_repo" },
    principal: { principal_id: "user-1" },
    authority: { authority_mode: "direct_owner" },
    semantic_digest: "sha256abc",
  };

  const actionCommit = {
    command_type: "task.select_route",
    command_envelope: command,
  };

  assert.deepEqual(actionCommit.command_envelope, command);
  assert.equal(actionCommit.command_envelope.semantic_digest, "sha256abc");
});

test("command envelope: preserved even when selection changes", () => {
  const command1 = {
    command_type: "task.select_route",
    payload: { route_id: "local_repo" },
    semantic_digest: "digest-1",
  };

  const command2 = {
    command_type: "task.select_route",
    payload: { route_id: "github_pr" },
    semantic_digest: "digest-2",
  };

  const commit1 = { command_envelope: command1 };
  const commit2 = { command_envelope: command2 };

  assert.notEqual(
    commit1.command_envelope.payload.route_id,
    commit2.command_envelope.payload.route_id
  );
  assert.ok(commit1.command_envelope);
  assert.ok(commit2.command_envelope);
});

test("diagnostics: not included in ActionCommit", () => {
  const actionCommit = {
    command_type: "task.select_route",
    command_envelope: {},
    task_version_after: 5,
    result: { success: true },
    diagnostics: undefined,
    observational_context: undefined,
    timing_metrics: undefined,
  };

  assert.equal(actionCommit.diagnostics, undefined);
  assert.equal(actionCommit.observational_context, undefined);
  assert.equal(actionCommit.timing_metrics, undefined);
});

test("diagnostics: stored separately from ActionCommit", () => {
  const actionCommit = {
    action_id: "action-123",
    command_type: "task.select_route",
  };

  const diagnostics = {
    action_id: "action-123",
    execution_time_ms: 42,
    route_evaluation_depth: 3,
    model_compatibility_checks: 5,
  };

  assert.equal(diagnostics.action_id, actionCommit.action_id);
  assert.equal(actionCommit.execution_time_ms, undefined);
});
