import Ajv2020 from 'ajv/dist/2020.js';
import addFormats from 'ajv-formats';

import skillSchema from '../../schemas/skill.schema.json' assert { type: 'json' };

import manifestSchema from './schemas/v1/manifest.schema.json' assert { type: 'json' };
import capabilityProfileSchema from './schemas/v1/capability-profile.schema.json' assert { type: 'json' };
import toolDefinitionSchema from './schemas/v1/tool-definition.schema.json' assert { type: 'json' };
import skillDefinitionSchema from './schemas/v1/skill-definition.schema.json' assert { type: 'json' };
import outcomeDefinitionSchema from './schemas/v1/outcome-definition.schema.json' assert { type: 'json' };
import routeDefinitionSchema from './schemas/v1/route-definition.schema.json' assert { type: 'json' };
import effectiveOutcomeContractSchema from './schemas/v1/effective-outcome-contract.schema.json' assert { type: 'json' };

import portableTaskObjectSchema from './schemas/v1/portable-task-object.schema.json' assert { type: 'json' };
import taskStateSnapshotSchema from './schemas/v1/task-state-snapshot.schema.json' assert { type: 'json' };
import taskRouteDefinitionSchema from './schemas/v1/task-route-definition.schema.json' assert { type: 'json' };
import effectiveExecutionContractSchema from './schemas/v1/effective-execution-contract.schema.json' assert { type: 'json' };
import progressEventSchema from './schemas/v1/progress-event.schema.json' assert { type: 'json' };
import provenanceMarkerSchema from './schemas/v1/provenance-marker.schema.json' assert { type: 'json' };
import findingsLedgerEntrySchema from './schemas/v1/findings-ledger-entry.schema.json' assert { type: 'json' };
import continuationPackageSchema from './schemas/v1/continuation-package.schema.json' assert { type: 'json' };
import handoffTokenSchema from './schemas/v1/handoff-token.schema.json' assert { type: 'json' };

const kindToSchemaId = {
  manifest: manifestSchema.$id,
  capabilityProfile: capabilityProfileSchema.$id,
  toolDefinition: toolDefinitionSchema.$id,
  skillDefinition: skillDefinitionSchema.$id,
  outcomeDefinition: outcomeDefinitionSchema.$id,
  routeDefinition: routeDefinitionSchema.$id,
  effectiveOutcomeContract: effectiveOutcomeContractSchema.$id,

  portableTaskObject: portableTaskObjectSchema.$id,
  taskStateSnapshot: taskStateSnapshotSchema.$id,
  taskRouteDefinition: taskRouteDefinitionSchema.$id,
  effectiveExecutionContract: effectiveExecutionContractSchema.$id,
  progressEvent: progressEventSchema.$id,
  provenanceMarker: provenanceMarkerSchema.$id,
  findingsLedgerEntry: findingsLedgerEntrySchema.$id,
  continuationPackage: continuationPackageSchema.$id,
  handoffToken: handoffTokenSchema.$id,
};

const ajv = new Ajv2020({ allErrors: true, strict: false });
addFormats(ajv);

ajv.addSchema(skillSchema);
ajv.addSchema(manifestSchema);
ajv.addSchema(capabilityProfileSchema);
ajv.addSchema(toolDefinitionSchema);
ajv.addSchema(skillDefinitionSchema);
ajv.addSchema(outcomeDefinitionSchema);
ajv.addSchema(routeDefinitionSchema);
ajv.addSchema(effectiveOutcomeContractSchema);

ajv.addSchema(provenanceMarkerSchema);
ajv.addSchema(findingsLedgerEntrySchema);
ajv.addSchema(taskRouteDefinitionSchema);
ajv.addSchema(effectiveExecutionContractSchema);
ajv.addSchema(portableTaskObjectSchema);
ajv.addSchema(taskStateSnapshotSchema);
ajv.addSchema(progressEventSchema);
ajv.addSchema(continuationPackageSchema);
ajv.addSchema(handoffTokenSchema);

const validators = Object.fromEntries(
  Object.entries(kindToSchemaId).map(([kind, schemaId]) => [kind, ajv.getSchema(schemaId)])
);

export function validateContract(kind, payload) {
  const validate = validators[kind];
  if (!validate) {
    throw new Error(`Unknown contract kind: ${kind}`);
  }

  if (!validate(payload)) {
    const details = (validate.errors || [])
      .map(err => `${err.instancePath || '/'} ${err.message}`)
      .join('; ');
    throw new Error(`Invalid ${kind}: ${details}`);
  }

  return payload;
}
