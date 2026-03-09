/**
 * graph-reference-contract.test.mjs
 *
 * Validates reference integrity for route/outcome/tool/skill graphs.
 *
 * Contract:
 * 1. Every route references an existing outcome.
 * 2. Every outcome references existing tools/skills.
 * 3. Every tool/skill reference resolves to a declared object.
 * 4. No dangling IDs and no duplicate IDs across each namespace.
 * 5. Error messages include both broken reference path and identifier.
 */

import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync, existsSync } from 'node:fs';
import { join, resolve, dirname } from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = resolve(__dirname, '../../..');
const COMPILE_MJS = resolve(REPO_ROOT, 'scripts', 'build', 'compile.mjs');

function ensureFreshDist() {
  const result = spawnSync(process.execPath, [COMPILE_MJS], {
    cwd: REPO_ROOT,
    encoding: 'utf8',
    timeout: 30000,
  });

  if (result.status !== 0) {
    console.error('Compiler stderr:', result.stderr);
    console.error('Compiler stdout:', result.stdout);
  }

  assert.equal(result.status, 0, `Compiler failed with status ${result.status}`);
}

function readJson(path) {
  return JSON.parse(readFileSync(path, 'utf8'));
}

function parseToolRegistryIds(path) {
  const yaml = readFileSync(path, 'utf8');
  const lines = yaml.split(/\r?\n/);
  const ids = [];
  let inTools = false;

  for (const line of lines) {
    if (!inTools) {
      if (/^tools:\s*$/.test(line)) {
        inTools = true;
      }
      continue;
    }

    if (/^[^\s#][^:]*:\s*$/.test(line)) {
      break;
    }

    const match = line.match(/^\s{2}([a-zA-Z0-9_-]+):\s*$/);
    if (match) {
      ids.push(match[1]);
    }
  }

  return ids.sort();
}

function assertUniqueIds(items, namespace, sourceLabel) {
  const seen = new Set();
  for (const item of items) {
    assert.ok(item && item.id, `${sourceLabel}: ${namespace} item missing id`);
    assert.ok(
      !seen.has(item.id),
      `${sourceLabel}: duplicate ${namespace} id at ${namespace}.${item.id} -> "${item.id}"`
    );
    seen.add(item.id);
  }
}

function validateGraphReferences(graph, sourceLabel) {
  const routes = [...(graph.routes ?? [])].sort((a, b) => a.id.localeCompare(b.id));
  const outcomes = [...(graph.outcomes ?? [])].sort((a, b) => a.id.localeCompare(b.id));
  const tools = [...(graph.tools ?? [])].sort((a, b) => a.id.localeCompare(b.id));
  const skills = [...(graph.skills ?? [])].sort((a, b) => a.id.localeCompare(b.id));

  assertUniqueIds(routes, 'routes', sourceLabel);
  assertUniqueIds(outcomes, 'outcomes', sourceLabel);
  assertUniqueIds(tools, 'tools', sourceLabel);
  assertUniqueIds(skills, 'skills', sourceLabel);

  const outcomeIds = new Set(outcomes.map(o => o.id));
  const toolIds = new Set(tools.map(t => t.id));
  const skillIds = new Set(skills.map(s => s.id));

  for (const route of routes) {
    assert.ok(route.outcomeId, `${sourceLabel}: routes.${route.id}.outcomeId missing`);
    assert.ok(
      outcomeIds.has(route.outcomeId),
      `${sourceLabel}: routes.${route.id}.outcomeId -> "${route.outcomeId}"`
    );
  }

  for (const outcome of outcomes) {
    const refs = outcome.refs ?? {};
    const refTools = [...(refs.tools ?? [])].sort();
    const refSkills = [...(refs.skills ?? [])].sort();

    for (const toolId of refTools) {
      assert.ok(
        toolIds.has(toolId),
        `${sourceLabel}: outcomes.${outcome.id}.refs.tools -> "${toolId}"`
      );
    }

    for (const skillId of refSkills) {
      assert.ok(
        skillIds.has(skillId),
        `${sourceLabel}: outcomes.${outcome.id}.refs.skills -> "${skillId}"`
      );
    }
  }
}

function loadWorkflowGraphs(skillIds, toolIds) {
  const workflowRoot = join(REPO_ROOT, 'shared', 'workflows');
  if (!existsSync(workflowRoot)) return [];

  const files = [];
  for (const entry of readdirSync(workflowRoot, { withFileTypes: true })) {
    if (entry.isFile() && entry.name.endsWith('.json')) {
      files.push(join(workflowRoot, entry.name));
      continue;
    }
    if (entry.isDirectory()) {
      const nestedWorkflow = join(workflowRoot, entry.name, 'workflow.json');
      if (existsSync(nestedWorkflow)) {
        files.push(nestedWorkflow);
      }
    }
  }

  files.sort();

  return files.map(file => {
    const workflow = readJson(file);
    const workflowId = workflow.name ?? workflow.workflow ?? file;
    const steps = Array.isArray(workflow.execution_flow) ? workflow.execution_flow : [];

    const routes = [];
    const outcomesById = new Map();

    for (const step of steps) {
      const stepIndex = String(step.step ?? routes.length + 1);
      const routeId = `step-${stepIndex}`;
      const outcomeId = step.output_to ?? step.output_key;

      if (!outcomeId) continue;

      routes.push({ id: routeId, outcomeId });

      if (!outcomesById.has(outcomeId)) {
        outcomesById.set(outcomeId, { id: outcomeId, refs: { tools: [], skills: [] } });
      }

      if (typeof step.skill === 'string' && step.skill.length > 0) {
        outcomesById.get(outcomeId).refs.skills.push(step.skill);
      }
    }

    const outcomes = [...outcomesById.values()].map(outcome => ({
      id: outcome.id,
      refs: {
        tools: [...new Set(outcome.refs.tools)].sort(),
        skills: [...new Set(outcome.refs.skills)].sort(),
      },
    }));

    return {
      sourceLabel: `workflow:${workflowId}`,
      graph: {
        routes,
        outcomes,
        tools: toolIds.map(id => ({ id })),
        skills: skillIds.map(id => ({ id })),
      },
    };
  });
}

describe('graph reference contract — live artefacts and runtime workflow graphs', () => {
  test('registry, plugin, and workflow-derived references resolve with no dangling IDs', () => {
    ensureFreshDist();

    const registry = readJson(join(REPO_ROOT, 'dist', 'registry', 'index.json'));
    const plugin = readJson(
      join(REPO_ROOT, 'dist', 'clients', 'claude-code', '.claude-plugin', 'plugin.json')
    );

    const registrySkillIds = (registry.skills ?? []).map(s => s.id).sort();
    const pluginSkillIds = (plugin.skills ?? []).map(s => s.name).sort();
    const toolIds = parseToolRegistryIds(join(REPO_ROOT, 'runtime', 'tool-registry.yaml'));

    assert.deepEqual(
      registrySkillIds,
      pluginSkillIds,
      'dist registry and plugin manifests should declare the same skill IDs'
    );

    const workflowGraphs = loadWorkflowGraphs(registrySkillIds, toolIds);
    assert.ok(workflowGraphs.length > 0, 'Expected at least one workflow graph to validate');

    for (const { sourceLabel, graph } of workflowGraphs) {
      validateGraphReferences(graph, sourceLabel);
    }
  });
});

describe('graph reference contract — error message diagnostics', () => {
  test('route -> outcome failures include path and identifier', () => {
    assert.throws(
      () => validateGraphReferences({
        routes: [{ id: 'r1', outcomeId: 'missing-outcome' }],
        outcomes: [{ id: 'ok-outcome', refs: { tools: [], skills: [] } }],
        tools: [],
        skills: [],
      }, 'fixture-route-outcome'),
      /fixture-route-outcome: routes\.r1\.outcomeId -> "missing-outcome"/
    );
  });

  test('outcome -> tool failures include path and identifier', () => {
    assert.throws(
      () => validateGraphReferences({
        routes: [{ id: 'r1', outcomeId: 'o1' }],
        outcomes: [{ id: 'o1', refs: { tools: ['missing-tool'], skills: [] } }],
        tools: [{ id: 'existing-tool' }],
        skills: [],
      }, 'fixture-outcome-tool'),
      /fixture-outcome-tool: outcomes\.o1\.refs\.tools -> "missing-tool"/
    );
  });

  test('outcome -> skill failures include path and identifier', () => {
    assert.throws(
      () => validateGraphReferences({
        routes: [{ id: 'r1', outcomeId: 'o1' }],
        outcomes: [{ id: 'o1', refs: { tools: [], skills: ['missing-skill'] } }],
        tools: [],
        skills: [{ id: 'existing-skill' }],
      }, 'fixture-outcome-skill'),
      /fixture-outcome-skill: outcomes\.o1\.refs\.skills -> "missing-skill"/
    );
  });

  test('duplicate IDs are rejected per namespace with path and identifier', () => {
    assert.throws(
      () => validateGraphReferences({
        routes: [{ id: 'r1', outcomeId: 'o1' }, { id: 'r1', outcomeId: 'o2' }],
        outcomes: [{ id: 'o1', refs: { tools: [], skills: [] } }, { id: 'o2', refs: { tools: [], skills: [] } }],
        tools: [],
        skills: [],
      }, 'fixture-duplicate-route'),
      /fixture-duplicate-route: duplicate routes id at routes\.r1 -> "r1"/
    );
  });
});
