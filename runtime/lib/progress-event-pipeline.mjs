import { validateContract } from '../../shared/contracts/validate.mjs';

function clone(value) {
  return JSON.parse(JSON.stringify(value));
}

function assertNonEmptyString(name, value) {
  if (typeof value !== 'string' || value.trim().length === 0) {
    throw new Error(`${name} is required`);
  }
}

function isPlainObject(value) {
  if (value === null || typeof value !== 'object' || Array.isArray(value)) {
    return false;
  }

  const prototype = Object.getPrototypeOf(value);
  return prototype === Object.prototype || prototype === null;
}

export class ProgressEventConflictError extends Error {
  constructor(message, details = {}) {
    super(message);
    this.name = 'ProgressEventConflictError';
    this.code = 'progress_event_conflict';
    this.details = details;
  }
}

export function createProgressEvent({
  taskId,
  eventId,
  type,
  message,
  createdAt = new Date().toISOString(),
  metadata,
} = {}) {
  assertNonEmptyString('taskId', taskId);
  assertNonEmptyString('eventId', eventId);
  assertNonEmptyString('type', type);
  assertNonEmptyString('message', message);
  assertNonEmptyString('createdAt', createdAt);

  if (metadata !== undefined && !isPlainObject(metadata)) {
    throw new Error('metadata must be a plain object when provided');
  }

  const payload = {
    schema_version: '1.0.0',
    task_id: taskId,
    event_id: eventId,
    type,
    message,
    created_at: createdAt,
  };

  if (metadata !== undefined) {
    payload.metadata = clone(metadata);
  }

  return validateContract('progressEvent', payload);
}

export class ProgressEventStore {
  constructor() {
    this.eventsByTask = new Map();
  }

  append(input) {
    const event = createProgressEvent(input);
    const events = this.eventsByTask.get(event.task_id) || [];

    if (events.some((existing) => existing.event_id === event.event_id)) {
      throw new ProgressEventConflictError(
        `Duplicate progress event id '${event.event_id}' for task '${event.task_id}'`,
        { taskId: event.task_id, eventId: event.event_id },
      );
    }

    events.push(event);
    this.eventsByTask.set(event.task_id, events);
    return clone(event);
  }

  listByTaskId(taskId) {
    assertNonEmptyString('taskId', taskId);
    const events = this.eventsByTask.get(taskId) || [];
    return clone(events);
  }
}
