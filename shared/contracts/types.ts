export type CapabilityStatus = 'supported' | 'unsupported' | 'unknown';

export interface CapabilityProfile {
  id: string;
  name?: string;
  surface: string;
  default_package: 'skill' | 'plugin' | 'rules' | 'file' | 'api';
  capabilities: Record<string, { status: CapabilityStatus; verified_at?: string; confidence?: 'low' | 'medium' | 'high'; source?: 'vendor-doc' | 'manual-test' | 'probe' | 'inference' }>;
  notes?: string;
}

export interface ToolDefinition {
  name: string;
  description: string;
  input_schema: Record<string, unknown>;
  output_schema?: Record<string, unknown>;
  tags?: string[];
}

export interface SkillDefinition {
  skill: string;
  version: string;
  description: string;
  type: 'prompt' | 'hook' | 'agent' | 'workflow-blueprint';
  status: 'stable' | 'experimental' | 'deprecated';
  capabilities: {
    required: string[];
    optional?: string[];
    fallback_mode?: 'none' | 'manual' | 'prompt-only';
    fallback_notes?: string;
  };
  [key: string]: unknown;
}

export interface OutcomeDefinition {
  id: string;
  summary: string;
  status: 'planned' | 'in_progress' | 'completed' | 'failed';
  artifacts?: string[];
  metadata?: Record<string, unknown>;
}

export interface RouteDefinition {
  id: string;
  method: 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE' | 'OPTIONS';
  path: string;
  outcome_id: string;
  auth_required?: boolean;
}

export interface EffectiveOutcomeContract {
  skill: SkillDefinition;
  route: RouteDefinition;
  outcome: OutcomeDefinition;
  resolved_capabilities: Record<string, CapabilityStatus>;
  degraded?: boolean;
}

export interface ManifestSkillSummary {
  id: string;
  version: string;
  description: string;
  type: string;
  status: string;
  [key: string]: unknown;
}

export interface Manifest {
  version: string;
  built_at?: string;
  build_id?: string;
  source_commit?: string;
  skill_count: number;
  platform_count: number;
  platforms: string[];
  skills: ManifestSkillSummary[];
}
