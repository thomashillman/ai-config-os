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
import YAML from 'yaml';

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
  const data = YAML.parse(readFileSync(path, 'utf8'));
  const tools = Array.isArray(data?.tools) ? data.tools : [];
  return tools.map(tool => tool.id).filter(Boolean).sort();
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

  const outcomeIds = new Set(outcomes.map(outcome => outcome.id));
  const toolIds = new Set(tools.map(tool => tool.id));
  const skillIds = new Set(skills.map(skill => skill.id));

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

function loadWorkflowGraph(skillIds, toolIds) {
  const workflowRoot = join(REPO_ROOT, 'shared', 'workflows');
  if (!existsSync(workflowRoot)) return null;

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

  const routes = [];
  const outcomes = [];

  for (const file of files) {
    const workflow = readJson(file);
    const workflowId = workflow.name ?? workflow.workflow ?? file;
    const steps = Array.isArray(workflow.execution_flow) ? workflow.execution_flow : [];

    for (const step of steps) {
      const stepId = String(step.step ?? routes.length + 1);
      const routeId = `${workflowId}:step-${stepId}`;
      const outcomeId = `${workflowId}:${step.output_to ?? step.output_key ?? `outcome-${stepId}`}`;

      routes.push({ id: routeId, outcomeId });

      const refs = {
        tools: [],
        skills: typeof step.skill === 'string' && step.skill.length > 0 ? [step.skill] : [],
      };

      outcomes.push({ id: outcomeId, refs });
    }
  }

  return {
    sourceLabel: 'workflow-runtime',
    graph: {
      routes,
      outcomes,
      tools: toolIds.map(id => ({ id })),
      skills: skillIds.map(id => ({ id })),
    },
  };
}

function loadMcpRuntimeGraph(skillIds, toolIds) {
  const serverPath = join(REPO_ROOT, 'runtime', 'mcp', 'server.js');
  const handlersPath = join(REPO_ROOT, 'runtime', 'mcp', 'handlers.mjs');

  const serverSource = readFileSync(serverPath, 'utf8');
  const handlersSource = readFileSync(handlersPath, 'utf8');

  const routeIds = [...serverSource.matchAll(/name:\s*"([a-z_]+)"/g)]
    .map(match => match[1])
    .sort();

  const outcomeIds = [...handlersSource.matchAll(/case\s+'([a-z_]+)'\s*:/g)]
    .map(match => match[1])
    .sort();

  const outcomes = outcomeIds.map(id => ({
    id,
    refs: {
      tools: id === 'sync_tools' || id === 'list_tools' ? [...toolIds] : [],
      skills: [],
    },
  }));

  return {
    sourceLabel: 'mcp-runtime',
    graph: {
      routes: routeIds.map(id => ({ id, outcomeId: id })),
      outcomes,
      tools: toolIds.map(id => ({ id })),
      skills: skillIds.map(id => ({ id })),
    },
  };
}

describe('graph reference contract — live artefacts and runtime modules', () => {
  test('registry, plugin, workflows, and runtime route/outcome definitions resolve with no dangling IDs', () => {
    ensureFreshDist();

    const registry = readJson(join(REPO_ROOT, 'dist', 'registry', 'index.json'));
    const plugin = readJson(
      join(REPO_ROOT, 'dist', 'clients', 'claude-code', '.claude-plugin', 'plugin.json')
    );

    const registrySkillIds = (registry.skills ?? []).map(skill => skill.id).sort();
    const pluginSkillIds = (plugin.skills ?? []).map(skill => skill.name).sort();
    const toolIds = parseToolRegistryIds(join(REPO_ROOT, 'runtime', 'tool-registry.yaml'));

    assert.deepEqual(
      registrySkillIds,
      pluginSkillIds,
      'dist registry and plugin manifests should declare the same skill IDs'
    );

    assert.ok(toolIds.length > 0, 'Expected runtime/tool-registry.yaml to declare at least one tool');

    const workflowGraph = loadWorkflowGraph(registrySkillIds, toolIds);
    assert.ok(workflowGraph, 'Expected at least one workflow graph to validate');
    validateGraphReferences(workflowGraph.graph, workflowGraph.sourceLabel);

    const mcpGraph = loadMcpRuntimeGraph(registrySkillIds, toolIds);
    validateGraphReferences(mcpGraph.graph, mcpGraph.sourceLabel);
  });
});

describe('graph reference contract — error message diagnostics', () => {
  test('route -> outcome failures include path and identifier', () => {
    assert.throws(
      () => validateGraphReferences({
        routes: [{ id: 'r1', outcomeId: 'missing-outcome' }],
        outcomes: [{ id: 'ok-outcome', refs: { tools: [], skills: [] } }],
        tools: [{ id: 't1' }],
        skills: [{ id: 's1' }],
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
        skills: [{ id: 's1' }],
      }, 'fixture-outcome-tool'),
      /fixture-outcome-tool: outcomes\.o1\.refs\.tools -> "missing-tool"/
    );
  });

  test('outcome -> skill failures include path and identifier', () => {
    assert.throws(
      () => validateGraphReferences({
        routes: [{ id: 'r1', outcomeId: 'o1' }],
        outcomes: [{ id: 'o1', refs: { tools: [], skills: ['missing-skill'] } }],
        tools: [{ id: 't1' }],
        skills: [{ id: 'existing-skill' }],
      }, 'fixture-outcome-skill'),
      /fixture-outcome-skill: outcomes\.o1\.refs\.skills -> "missing-skill"/
    );
  });

  test('duplicate IDs are rejected per namespace with path and identifier', () => {
    assert.throws(
      () => validateGraphReferences({
        routes: [{ id: 'r1', outcomeId: 'o1' }, { id: 'r1', outcomeId: 'o2' }],
        outcomes: [
          { id: 'o1', refs: { tools: [], skills: [] } },
          { id: 'o2', refs: { tools: [], skills: [] } },
        ],
        tools: [{ id: 't1' }],
        skills: [{ id: 's1' }],
      }, 'fixture-duplicate-route'),
      /fixture-duplicate-route: duplicate routes id at routes\.r1 -> "r1"/
    );
  });
});
