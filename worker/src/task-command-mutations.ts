import type { TaskCommand } from "./task-command";

export interface AppliedTaskMutation {
  task: Record<string, unknown>;
  summary: string;
}

function clone<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T;
}

function appendRouteSelectionLocal(input: {
  task: Record<string, unknown>;
  routeId: string;
  expectedVersion: number;
  selectedAt: string;
}): Record<string, unknown> {
  if (Number(input.task.version) !== input.expectedVersion) {
    throw new Error(
      `Task lifecycle expectedVersion ${input.expectedVersion} does not match task version ${String(input.task.version)}`,
    );
  }

  const routeHistory = Array.isArray(input.task.route_history)
    ? (input.task.route_history as unknown[])
    : [];

  return {
    ...clone(input.task),
    current_route: input.routeId,
    route_history: [
      ...routeHistory,
      { route: input.routeId, selected_at: input.selectedAt },
    ],
    version: input.expectedVersion + 1,
    updated_at: input.selectedAt,
  };
}

function transitionStateLocal(input: {
  task: Record<string, unknown>;
  expectedVersion: number;
  nextState: string;
  nextAction: string;
  updatedAt: string;
}): Record<string, unknown> {
  if (Number(input.task.version) !== input.expectedVersion) {
    throw new Error(
      `Task lifecycle expectedVersion ${input.expectedVersion} does not match task version ${String(input.task.version)}`,
    );
  }

  return {
    ...clone(input.task),
    state: input.nextState,
    next_action: input.nextAction,
    version: input.expectedVersion + 1,
    updated_at: input.updatedAt,
  };
}

function appendFindingLocal(input: {
  task: Record<string, unknown>;
  expectedVersion: number;
  finding: Record<string, unknown>;
  updatedAt: string;
}): Record<string, unknown> {
  if (Number(input.task.version) !== input.expectedVersion) {
    throw new Error(
      `Task lifecycle expectedVersion ${input.expectedVersion} does not match task version ${String(input.task.version)}`,
    );
  }

  const findings = Array.isArray(input.task.findings)
    ? (input.task.findings as unknown[])
    : [];

  return {
    ...clone(input.task),
    findings: [...findings, input.finding],
    version: input.expectedVersion + 1,
    updated_at: input.updatedAt,
  };
}

export function applyTaskCommandMutation(input: {
  command: TaskCommand;
  task: Record<string, unknown>;
  taskVersion: number;
}): AppliedTaskMutation {
  const { command, task, taskVersion } = input;

  switch (command.command_type) {
    case "task.select_route": {
      const payload = command.payload as { route_id?: string };
      if (
        typeof payload.route_id !== "string" ||
        payload.route_id.length === 0
      ) {
        throw new Error("route_id required for select_route");
      }

      const updated = appendRouteSelectionLocal({
        task,
        routeId: payload.route_id,
        expectedVersion: taskVersion,
        selectedAt: String(
          (command.request_context as Record<string, unknown>).selected_at ??
            new Date().toISOString(),
        ),
      });
      return { task: updated, summary: "Route selected" };
    }

    case "task.transition_state": {
      const payload = command.payload as {
        next_state?: string;
        next_action?: string;
      };
      if (
        typeof payload.next_state !== "string" ||
        payload.next_state.length === 0
      ) {
        throw new Error("next_state required for transition_state");
      }
      if (
        typeof payload.next_action !== "string" ||
        payload.next_action.length === 0
      ) {
        throw new Error("next_action required for transition_state");
      }

      const updated = transitionStateLocal({
        task,
        expectedVersion: taskVersion,
        nextState: payload.next_state,
        nextAction: payload.next_action,
        updatedAt: String(
          (command.request_context as Record<string, unknown>).updated_at ??
            new Date().toISOString(),
        ),
      });
      return { task: updated, summary: "State transitioned" };
    }

    case "task.append_finding": {
      const payload = command.payload as { finding?: Record<string, unknown> };
      if (!payload.finding || typeof payload.finding !== "object") {
        throw new Error("finding required for append_finding");
      }

      const updated = appendFindingLocal({
        task,
        expectedVersion: taskVersion,
        finding: payload.finding,
        updatedAt: String(
          (command.request_context as Record<string, unknown>).updated_at ??
            new Date().toISOString(),
        ),
      });
      return { task: updated, summary: "Finding appended" };
    }

    default:
      throw new Error(
        `Unsupported command type for mutation apply: ${command.command_type}`,
      );
  }
}
