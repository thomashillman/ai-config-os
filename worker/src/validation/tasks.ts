/**
 * Pure payload validators for task API endpoints.
 *
 * No HTTP imports — all functions return typed result objects.
 * Query parameter parsers that return Response objects stay in handlers/tasks.ts.
 */

import type { AppendFindingPayload, ContinuationPayload, RouteSelectionPayload, TransitionFindingsPayload, TransitionTaskStatePayload } from '../types';

function asObject(payload: unknown): Record<string, unknown> | null {
  if (typeof payload !== 'object' || payload === null || Array.isArray(payload)) {
    return null;
  }
  return payload as Record<string, unknown>;
}

function isIsoDateTime(value: unknown): value is string {
  return typeof value === 'string' && Number.isFinite(Date.parse(value));
}

export function validateTaskCreatePayload(payload: unknown): { ok: true; value: Record<string, unknown> } | { ok: false; error: string } {
  const data = asObject(payload);
  if (!data) {
    return { ok: false, error: 'Payload must be a JSON object' };
  }
  return { ok: true, value: data };
}

export function validateTaskStatePayload(payload: unknown): { ok: true; value: TransitionTaskStatePayload } | { ok: false; error: string } {
  const data = asObject(payload);
  if (!data) return { ok: false, error: 'Payload must be a JSON object' };
  if (!Number.isInteger(data.expected_version)) return { ok: false, error: "Field 'expected_version' must be an integer" };
  if (typeof data.next_state !== 'string' || data.next_state.length === 0) return { ok: false, error: "Field 'next_state' must be a non-empty string" };
  if (typeof data.next_action !== 'string' || data.next_action.length === 0) return { ok: false, error: "Field 'next_action' must be a non-empty string" };
  if (!isIsoDateTime(data.updated_at)) return { ok: false, error: "Field 'updated_at' must be an ISO timestamp" };

  if (data.progress !== undefined) {
    const progress = asObject(data.progress);
    if (!progress) return { ok: false, error: "Field 'progress' must be an object" };
    if (!Number.isInteger(progress.completed_steps) || !Number.isInteger(progress.total_steps)) {
      return { ok: false, error: "Field 'progress' must include integer 'completed_steps' and 'total_steps'" };
    }
  }

  return { ok: true, value: data as unknown as TransitionTaskStatePayload };
}

export function validateRouteSelectionPayload(payload: unknown): { ok: true; value: RouteSelectionPayload } | { ok: false; error: string } {
  const data = asObject(payload);
  if (!data) return { ok: false, error: 'Payload must be a JSON object' };
  if (!Number.isInteger(data.expected_version)) return { ok: false, error: "Field 'expected_version' must be an integer" };
  if (typeof data.route_id !== 'string' || data.route_id.length === 0) return { ok: false, error: "Field 'route_id' must be a non-empty string" };
  if (!isIsoDateTime(data.selected_at)) return { ok: false, error: "Field 'selected_at' must be an ISO timestamp" };
  return { ok: true, value: data as unknown as RouteSelectionPayload };
}

export function validateContinuationPayload(payload: unknown): { ok: true; value: ContinuationPayload } | { ok: false; error: string } {
  const data = asObject(payload);
  if (!data) return { ok: false, error: 'Payload must be a JSON object' };

  if (!asObject(data.handoff_token)) {
    return { ok: false, error: "Field 'handoff_token' must be an object" };
  }
  if (!asObject(data.effective_execution_contract)) {
    return { ok: false, error: "Field 'effective_execution_contract' must be an object" };
  }
  if (data.created_at !== undefined && !isIsoDateTime(data.created_at)) {
    return { ok: false, error: "Field 'created_at' must be an ISO timestamp" };
  }

  return { ok: true, value: data as unknown as ContinuationPayload };
}

export function validateAppendFindingPayload(payload: unknown): { ok: true; value: AppendFindingPayload } | { ok: false; error: string } {
  const data = asObject(payload);
  if (!data) return { ok: false, error: 'Payload must be a JSON object' };
  if (!Number.isInteger(data.expected_version)) return { ok: false, error: "Field 'expected_version' must be an integer" };
  if (!asObject(data.finding)) return { ok: false, error: "Field 'finding' must be an object" };
  if (!isIsoDateTime(data.updated_at)) return { ok: false, error: "Field 'updated_at' must be an ISO timestamp" };
  return { ok: true, value: data as unknown as AppendFindingPayload };
}

export function validateTransitionFindingsPayload(payload: unknown): { ok: true; value: TransitionFindingsPayload } | { ok: false; error: string } {
  const data = asObject(payload);
  if (!data) return { ok: false, error: 'Payload must be a JSON object' };
  if (!Number.isInteger(data.expected_version)) return { ok: false, error: "Field 'expected_version' must be an integer" };
  if (typeof data.to_route_id !== 'string' || data.to_route_id.length === 0) return { ok: false, error: "Field 'to_route_id' must be a non-empty string" };
  if (!isIsoDateTime(data.upgraded_at)) return { ok: false, error: "Field 'upgraded_at' must be an ISO timestamp" };
  if (typeof data.to_equivalence_level !== 'string' || data.to_equivalence_level.length === 0) return { ok: false, error: "Field 'to_equivalence_level' must be a non-empty string" };
  return { ok: true, value: data as unknown as TransitionFindingsPayload };
}
