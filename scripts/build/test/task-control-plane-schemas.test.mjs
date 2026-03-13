import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import Ajv2020 from 'ajv/dist/2020.js';
import addFormats from 'ajv-formats';

const __dirname = dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = resolve(__dirname, '..', '..', '..');
const SCHEMAS_DIR = resolve(REPO_ROOT, 'shared', 'contracts', 'schemas', 'v1');

const schemaFiles = {
  portableTaskObject: 'portable-task-object.schema.json',
  taskStateSnapshot: 'task-state-snapshot.schema.json',
  taskRouteDefinition: 'task-route-definition.schema.json',
  effectiveExecutionContract: 'effective-execution-contract.schema.json',
  progressEvent: 'progress-event.schema.json',
  provenanceMarker: 'provenance-marker.schema.json',
  findingsLedgerEntry: 'findings-ledger-entry.schema.json',
  continuationPackage: 'continuation-package.schema.json',
  handoffToken: 'handoff-token.schema.json',
};

function loadSchema(fileName) {
  const path = resolve(SCHEMAS_DIR, fileName);
  return JSON.parse(readFileSync(path, 'utf8'));
}

test('T002 control-plane schemas exist with versioned ids and schema_version guards', () => {
  for (const fileName of Object.values(schemaFiles)) {
    const schema = loadSchema(fileName);
    assert.equal(schema.$schema, 'https://json-schema.org/draft/2020-12/schema');
    assert.ok(schema.$id.includes('/contracts/v1/'), `${fileName} should be versioned under /contracts/v1/`);
    assert.ok(schema.properties?.schema_version, `${fileName} must define schema_version`);
    assert.equal(schema.properties.schema_version.const, '1.0.0', `${fileName} schema_version must be pinned to 1.0.0`);
  }
});

test('portable-task-object and snapshot schemas validate minimal canonical payloads', () => {
  const ajv = new Ajv2020({ allErrors: true, strict: false });
  addFormats(ajv);

  const portableTaskObjectSchema = loadSchema(schemaFiles.portableTaskObject);
  const taskStateSnapshotSchema = loadSchema(schemaFiles.taskStateSnapshot);
  const findingsLedgerEntrySchema = loadSchema(schemaFiles.findingsLedgerEntry);
  const provenanceMarkerSchema = loadSchema(schemaFiles.provenanceMarker);

  ajv.addSchema(provenanceMarkerSchema);
  ajv.addSchema(findingsLedgerEntrySchema);
  ajv.addSchema(portableTaskObjectSchema);
  ajv.addSchema(taskStateSnapshotSchema);

  const validateTask = ajv.getSchema(portableTaskObjectSchema.$id);
  const validateSnapshot = ajv.getSchema(taskStateSnapshotSchema.$id);

  const task = {
    schema_version: '1.0.0',
    task_id: 'task_review_repository_001',
    task_type: 'review_repository',
    goal: 'Review repository changes for correctness and risk.',
    current_route: 'github_pr',
    state: 'active',
    progress: { completed_steps: 1, total_steps: 3 },
    findings: [],
    unresolved_questions: [],
    approvals: [],
    route_history: [{ route: 'github_pr', selected_at: '2026-03-12T12:00:00.000Z' }],
    next_action: 'collect_more_context',
    version: 1,
    updated_at: '2026-03-12T12:00:00.000Z',
  };

  assert.equal(validateTask(task), true, JSON.stringify(validateTask.errors));

  const snapshot = {
    schema_version: '1.0.0',
    task_id: 'task_review_repository_001',
    snapshot_version: 1,
    created_at: '2026-03-12T12:00:00.000Z',
    task,
  };

  assert.equal(validateSnapshot(snapshot), true, JSON.stringify(validateSnapshot.errors));
});

test('schema strictness rejects unknown fields for security and determinism', () => {
  const ajv = new Ajv2020({ allErrors: true, strict: false });
  addFormats(ajv);
  const schema = loadSchema(schemaFiles.handoffToken);
  const validate = ajv.compile(schema);

  const token = {
    schema_version: '1.0.0',
    token_id: 'handoff_abc123',
    task_id: 'task_review_repository_001',
    issued_at: '2026-03-12T12:00:00.000Z',
    expires_at: '2026-03-12T12:10:00.000Z',
    signature: 'deadbeef',
    replay_nonce: 'nonce_123',
    extra: true,
  };

  assert.equal(validate(token), false, 'unexpected fields must be rejected');
  assert.ok(validate.errors.some(err => err.keyword === 'additionalProperties'));
});
