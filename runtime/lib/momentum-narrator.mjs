// Momentum Narrator — produces structured prose from task state.
// Pure function: no side effects, no I/O.
// Takes PortableTaskObject + EffectiveExecutionContract → narration output.

import {
  TEMPLATE_VERSION,
  strengthLabels,
  provenancePrefixes,
  taskTypeLabels,
  templates,
  upgradeUnlocksDescriptions,
} from './momentum-templates.mjs';

const ROUTE_STRENGTH_ORDER = ['pasted_diff', 'github_pr', 'uploaded_bundle', 'local_repo'];

function getStrength(routeId) {
  return strengthLabels[routeId] || {
    level: 'limited',
    label: routeId,
    description: 'Unknown route',
  };
}

function getTaskTypeLabel(taskType) {
  return taskTypeLabels[taskType] || taskType;
}

function getRouteLabel(routeId) {
  const strength = strengthLabels[routeId];
  return strength ? strength.label : routeId;
}

function interpolate(template, vars) {
  if (template === null || template === undefined) return null;
  let result = template;
  for (const [key, value] of Object.entries(vars)) {
    result = result.replace(new RegExp(`\\{${key}\\}`, 'g'), String(value ?? ''));
  }
  return result;
}

function isStrongerRoute(a, b) {
  return ROUTE_STRENGTH_ORDER.indexOf(a) > ROUTE_STRENGTH_ORDER.indexOf(b);
}

function findStrongerRoute(currentRoute, contract) {
  if (contract?.stronger_host_guidance) {
    const match = contract.stronger_host_guidance.match(/route '([a-z_]+)'/);
    if (match) return match[1];
    const preferMatch = contract.stronger_host_guidance.match(/Prefer '([a-z_]+)'/);
    if (preferMatch) return preferMatch[1];
  }
  // Fallback: find the strongest available route
  for (let i = ROUTE_STRENGTH_ORDER.length - 1; i >= 0; i--) {
    const candidate = ROUTE_STRENGTH_ORDER[i];
    if (isStrongerRoute(candidate, currentRoute)) return candidate;
  }
  return null;
}

function buildFindingNarrative(finding) {
  const status = finding?.provenance?.status || 'hypothesis';
  const prefix = provenancePrefixes[status] || 'Possible';
  const summary = finding?.summary || 'unknown finding';
  return {
    finding_id: finding.finding_id,
    narrative: `${prefix} ${summary}`,
    confidence_change: null,
    evidence_summary: finding.evidence?.length
      ? finding.evidence.join('; ')
      : null,
  };
}

function buildFindingNarrativeWithEvolution(finding, previousStatus, newStatus) {
  const prefix = provenancePrefixes[newStatus] || 'Possible';
  const summary = finding?.summary || 'unknown finding';
  return {
    finding_id: finding.finding_id,
    narrative: `${prefix} ${summary}`,
    confidence_change: { from: previousStatus, to: newStatus },
    evidence_summary: finding.evidence?.length
      ? finding.evidence.join('; ')
      : null,
  };
}

function buildUpgradeBlock(currentRoute, strongerRoute) {
  if (!strongerRoute) return null;
  return {
    before: `${getRouteLabel(currentRoute)} — ${getStrength(currentRoute).description}`,
    now: getRouteLabel(strongerRoute),
    unlocks: upgradeUnlocksDescriptions[strongerRoute] || getStrength(strongerRoute).description,
  };
}

export function createNarrator(options = {}) {
  const tmpl = options.templates || templates;
  const tmplVersion = options.templateVersion || TEMPLATE_VERSION;

  return {
    templateVersion: tmplVersion,

    onStart(task, contract) {
      const routeId = task.current_route;
      const strength = getStrength(routeId);
      const taskTypeLabel = getTaskTypeLabel(task.task_type);
      const routeLabel = getRouteLabel(routeId);

      const strongerRoute = findStrongerRoute(routeId, contract);

      const vars = {
        taskTypeLabel,
        routeLabel,
        strongerRouteLabel: strongerRoute ? getRouteLabel(strongerRoute) : null,
        upgradeUnlocks: strongerRoute
          ? (upgradeUnlocksDescriptions[strongerRoute] || getStrength(strongerRoute).description)
          : null,
      };

      const headline = interpolate(tmpl.onStart.headline, vars);
      const upgradeText = strongerRoute
        ? interpolate(tmpl.onStart.upgrade_available, vars)
        : null;

      const findings = (task.findings || []).map(buildFindingNarrative);

      return {
        headline,
        progress: null,
        strength,
        next_action: task.next_action || contract?.required_inputs?.join(', ') || null,
        upgrade: strongerRoute ? buildUpgradeBlock(routeId, strongerRoute) : null,
        findings,
      };
    },

    onResume(task, contract, previousContract) {
      const routeId = task.current_route;
      const strength = getStrength(routeId);
      const taskTypeLabel = getTaskTypeLabel(task.task_type);
      const findingsCount = (task.findings || []).length;
      const previousRoute = previousContract?.selected_route?.route_id;
      const upgraded = previousRoute && previousRoute !== routeId;

      const strongerRoute = findStrongerRoute(routeId, contract);
      const upgradeDescription = upgraded
        ? `full verification with ${getRouteLabel(routeId)}`
        : (strongerRoute ? `verification with ${getRouteLabel(strongerRoute)}` : 'continued analysis');

      const vars = {
        taskTypeLabel,
        findingsCount,
        upgradeDescription,
      };

      const headline = interpolate(tmpl.onResume.headline, vars);
      const progress = findingsCount > 0
        ? interpolate(
          upgraded ? tmpl.onResume.progress_with_upgrade : tmpl.onResume.progress_without_upgrade,
          vars,
        )
        : null;

      const findings = (task.findings || []).map(buildFindingNarrative);
      const upgrade = upgraded ? buildUpgradeBlock(previousRoute, routeId) : null;

      return {
        headline,
        progress,
        strength,
        next_action: task.next_action || null,
        upgrade,
        findings,
      };
    },

    onFindingEvolved(task, finding, previousConfidence, newConfidence) {
      const narrative = buildFindingNarrativeWithEvolution(finding, previousConfidence, newConfidence);

      return {
        headline: interpolate(tmpl.onFindingEvolved.headline, {
          provenancePrefix: provenancePrefixes[newConfidence] || 'Possible',
          findingSummary: finding?.summary || 'unknown finding',
        }),
        progress: null,
        strength: getStrength(task.current_route),
        next_action: task.next_action || null,
        upgrade: null,
        findings: [narrative],
      };
    },

    onUpgradeAvailable(task, currentContract, availableContract) {
      const currentRoute = task.current_route;
      const strongerRoute = availableContract?.selected_route?.route_id || findStrongerRoute(currentRoute, currentContract);
      const findingsCount = (task.findings || []).length;

      const headline = interpolate(tmpl.onUpgradeAvailable.headline, {
        strongerRouteLabel: strongerRoute ? getRouteLabel(strongerRoute) : 'a stronger environment',
        findingsCount,
      });

      return {
        headline,
        progress: null,
        strength: getStrength(currentRoute),
        next_action: tmpl.onUpgradeAvailable.prompt,
        upgrade: buildUpgradeBlock(currentRoute, strongerRoute),
        findings: (task.findings || []).map(buildFindingNarrative),
      };
    },

    onShelfView(tasks, currentCapabilities) {
      return (tasks || []).map((task) => {
        const taskTypeLabel = getTaskTypeLabel(task.task_type);
        const findingsCount = (task.findings || []).length;
        const pendingCount = (task.findings || []).filter(
          (f) => f?.provenance?.status === 'hypothesis' || f?.provenance?.status === 'reused',
        ).length;

        // Determine if an upgrade is available based on current capabilities
        const strongerRoute = findStrongerRoute(task.current_route, null);
        const hasUpgrade = Boolean(strongerRoute);
        const upgradeDescription = hasUpgrade
          ? `verification with ${getRouteLabel(strongerRoute)}`
          : null;
        const strongerRouteLabel = hasUpgrade ? getRouteLabel(strongerRoute) : null;

        const vars = {
          taskTypeLabel,
          findingsCount,
          upgradeDescription,
          strongerRouteLabel,
          pendingCount,
        };

        const headline = hasUpgrade
          ? interpolate(tmpl.onShelfView.headline_with_upgrade, vars)
          : interpolate(tmpl.onShelfView.headline_without_upgrade, vars);

        const continuation_reason = hasUpgrade
          ? interpolate(tmpl.onShelfView.continuation_with_upgrade, vars)
          : interpolate(tmpl.onShelfView.continuation_without_upgrade, vars);

        return {
          task_id: task.task_id,
          headline,
          continuation_reason,
          environment_fit: hasUpgrade ? 'strong' : 'neutral',
        };
      });
    },
  };
}
