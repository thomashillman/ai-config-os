import { validateContract } from '../../shared/contracts/validate.mjs';
import { confidenceForRoute, canUpgradeConfidence } from './confidence-rules.mjs';

function clone(value) {
  return JSON.parse(JSON.stringify(value));
}

const EQUIVALENCE_LEVELS = Object.freeze(['equal', 'degraded']);

function assertNonEmptyString(name, value) {
  if (typeof value !== 'string' || value.trim().length === 0) {
    throw new Error(`${name} is required`);
  }
}

export function createFindingsLedgerEntry({
  findingId,
  summary,
  evidence = [],
  status,
  recordedAt,
  recordedByRoute,
  note,
  confidence: confidenceOverride,
  confidenceBasis: confidenceBasisOverride,
  verificationStatus,
} = {}) {
  assertNonEmptyString('findingId', findingId);
  assertNonEmptyString('summary', summary);
  assertNonEmptyString('status', status);
  assertNonEmptyString('recordedAt', recordedAt);
  assertNonEmptyString('recordedByRoute', recordedByRoute);

  if (!Array.isArray(evidence)) {
    throw new Error('evidence must be an array');
  }

  // Derive confidence from route unless explicitly overridden
  const { confidence, confidence_basis } = confidenceForRoute(recordedByRoute);
  const resolvedConfidence = confidenceOverride || confidence;
  const resolvedBasis = confidenceBasisOverride || confidence_basis;

  return validateContract('findingsLedgerEntry', {
    schema_version: '1.0.0',
    finding_id: findingId,
    summary,
    evidence,
    verification_status: verificationStatus || 'unverified',
    provenance: {
      schema_version: '1.0.0',
      status,
      recorded_at: recordedAt,
      recorded_by_route: recordedByRoute,
      confidence: resolvedConfidence,
      confidence_basis: resolvedBasis,
      ...(note ? { note } : {}),
    },
  });
}

export function appendFindingToTask({ task, expectedVersion, finding, updatedAt } = {}) {
  if (!task || typeof task !== 'object') {
    throw new Error('appendFindingToTask requires task object');
  }
  assertNonEmptyString('updatedAt', updatedAt);

  if (!Number.isInteger(expectedVersion)) {
    throw new Error('expectedVersion must be an integer');
  }
  if (task.version !== expectedVersion) {
    throw new Error(`Task lifecycle expectedVersion ${expectedVersion} does not match task version ${task.version}`);
  }

  const entry = createFindingsLedgerEntry(finding);
  const next = {
    ...clone(task),
    findings: [...task.findings, entry],
    version: task.version + 1,
    updated_at: updatedAt,
  };

  return validateContract('portableTaskObject', next);
}

export function transitionFindingsForRouteUpgrade({
  findings,
  toRouteId,
  upgradedAt,
  toEquivalenceLevel,
} = {}) {
  if (!Array.isArray(findings)) {
    throw new Error('transitionFindingsForRouteUpgrade requires findings array');
  }
  assertNonEmptyString('toRouteId', toRouteId);
  assertNonEmptyString('upgradedAt', upgradedAt);
  assertNonEmptyString('toEquivalenceLevel', toEquivalenceLevel);
  if (!EQUIVALENCE_LEVELS.includes(toEquivalenceLevel)) {
    throw new Error(`transitionFindingsForRouteUpgrade requires toEquivalenceLevel to be one of: ${EQUIVALENCE_LEVELS.join(', ')}`);
  }

  if (toEquivalenceLevel !== 'equal') {
    return clone(findings);
  }

  const { confidence: newConfidence, confidence_basis: newBasis } = confidenceForRoute(toRouteId);

  return findings.map((entry) => {
    const validated = validateContract('findingsLedgerEntry', clone(entry));
    const sameRoute = validated.provenance.recorded_by_route === toRouteId;
    const shouldDowngrade = !sameRoute && validated.provenance.status === 'verified';

    // Upgrade confidence if the new route offers higher confidence
    const currentConfidence = validated.provenance.confidence;
    const shouldUpgradeConfidence = currentConfidence
      ? canUpgradeConfidence(currentConfidence, newConfidence)
      : true;

    const updatedProvenance = {
      ...validated.provenance,
      ...(shouldUpgradeConfidence ? { confidence: newConfidence, confidence_basis: newBasis } : {}),
    };

    if (!shouldDowngrade) {
      return validateContract('findingsLedgerEntry', {
        ...validated,
        provenance: updatedProvenance,
      });
    }

    return validateContract('findingsLedgerEntry', {
      ...validated,
      provenance: {
        ...updatedProvenance,
        status: 'reused',
        recorded_at: upgradedAt,
        recorded_by_route: toRouteId,
        note: `Route upgrade to '${toRouteId}' carried forward verification from weaker route`,
      },
    });
  });
}
