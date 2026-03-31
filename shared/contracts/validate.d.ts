import type {
  CapabilityProfile,
  EffectiveOutcomeContract,
  Manifest,
  OutcomeDefinition,
  RouteDefinition,
  SkillDefinition,
  ToolDefinition,
} from "./types";

export type ContractKind =
  | "manifest"
  | "capabilityProfile"
  | "toolDefinition"
  | "skillDefinition"
  | "outcomeDefinition"
  | "routeDefinition"
  | "effectiveOutcomeContract";

export interface ContractByKind {
  manifest: Manifest;
  capabilityProfile: CapabilityProfile;
  toolDefinition: ToolDefinition;
  skillDefinition: SkillDefinition;
  outcomeDefinition: OutcomeDefinition;
  routeDefinition: RouteDefinition;
  effectiveOutcomeContract: EffectiveOutcomeContract;
}

export function validateContract<K extends ContractKind>(
  kind: K,
  payload: ContractByKind[K],
): ContractByKind[K];
