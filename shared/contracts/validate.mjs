import { readFileSync } from "fs";
import { dirname, resolve } from "path";
import { fileURLToPath } from "url";
import Ajv2020 from "ajv/dist/2020.js";
import addFormats from "ajv-formats";

const __dirname = dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = resolve(__dirname, "..", "..");

function loadSchema(relativePath) {
  const absolutePath = resolve(REPO_ROOT, relativePath);
  return JSON.parse(readFileSync(absolutePath, "utf8"));
}

const resourceBudgetSchema = loadSchema(
  "shared/contracts/schemas/v1/resource-budget.schema.json",
);
const skillSchema = loadSchema("schemas/skill.schema.json");

const manifestSchema = loadSchema(
  "shared/contracts/schemas/v1/manifest.schema.json",
);
const capabilityProfileSchema = loadSchema(
  "shared/contracts/schemas/v1/capability-profile.schema.json",
);
const toolDefinitionSchema = loadSchema(
  "shared/contracts/schemas/v1/tool-definition.schema.json",
);
const skillDefinitionSchema = loadSchema(
  "shared/contracts/schemas/v1/skill-definition.schema.json",
);
const outcomeDefinitionSchema = loadSchema(
  "shared/contracts/schemas/v1/outcome-definition.schema.json",
);
const routeDefinitionSchema = loadSchema(
  "shared/contracts/schemas/v1/route-definition.schema.json",
);
const effectiveOutcomeContractSchema = loadSchema(
  "shared/contracts/schemas/v1/effective-outcome-contract.schema.json",
);

const portableTaskObjectSchema = loadSchema(
  "shared/contracts/schemas/v1/portable-task-object.schema.json",
);
const taskStateSnapshotSchema = loadSchema(
  "shared/contracts/schemas/v1/task-state-snapshot.schema.json",
);
const taskRouteDefinitionSchema = loadSchema(
  "shared/contracts/schemas/v1/task-route-definition.schema.json",
);
const effectiveExecutionContractSchema = loadSchema(
  "shared/contracts/schemas/v1/effective-execution-contract.schema.json",
);
const progressEventSchema = loadSchema(
  "shared/contracts/schemas/v1/progress-event.schema.json",
);
const provenanceMarkerSchema = loadSchema(
  "shared/contracts/schemas/v1/provenance-marker.schema.json",
);
const findingsLedgerEntrySchema = loadSchema(
  "shared/contracts/schemas/v1/findings-ledger-entry.schema.json",
);
const continuationPackageSchema = loadSchema(
  "shared/contracts/schemas/v1/continuation-package.schema.json",
);
const handoffTokenSchema = loadSchema(
  "shared/contracts/schemas/v1/handoff-token.schema.json",
);
const narrationOutputSchema = loadSchema(
  "shared/contracts/schemas/v1/narration-output.schema.json",
);
const shelfEntrySchema = loadSchema(
  "shared/contracts/schemas/v1/shelf-entry.schema.json",
);
const momentumViewSchema = loadSchema(
  "shared/contracts/schemas/v1/momentum-view.schema.json",
);

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
  narrationOutput: narrationOutputSchema.$id,
  shelfEntry: shelfEntrySchema.$id,
  momentumView: momentumViewSchema.$id,
};

const ajv = new Ajv2020({ allErrors: true, strict: false });
addFormats(ajv);

ajv.addSchema(resourceBudgetSchema);
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
ajv.addSchema(narrationOutputSchema);
ajv.addSchema(shelfEntrySchema);
ajv.addSchema(momentumViewSchema);

const validators = Object.fromEntries(
  Object.entries(kindToSchemaId).map(([kind, schemaId]) => [
    kind,
    ajv.getSchema(schemaId),
  ]),
);

export function validateContract(kind, payload) {
  const validate = validators[kind];
  if (!validate) {
    throw new Error(`Unknown contract kind: ${kind}`);
  }

  if (!validate(payload)) {
    const details = (validate.errors || [])
      .map((err) => `${err.instancePath || "/"} ${err.message}`)
      .join("; ");
    throw new Error(`Invalid ${kind}: ${details}`);
  }

  return payload;
}
