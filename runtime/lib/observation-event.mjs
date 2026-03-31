// Observation Event Contract — canonical shape for observation producers and readers.
// Validates event structure and provides a helper to construct valid events.
// Plain JS contract for internal normalisation; no persistence or schema wiring yet.

/**
 * Validates that an observation event conforms to the canonical shape.
 * Required fields: type, taskId, createdAt
 * Optional fields: metadata, message, eventId
 *
 * @param {object} event - The event to validate
 * @throws {Error} if event is invalid
 */
export function validateObservationEvent(event) {
  if (!event || typeof event !== "object" || Array.isArray(event)) {
    throw new Error("Event must be an object");
  }

  // Validate required fields
  if (typeof event.type !== "string" || event.type.trim().length === 0) {
    throw new Error("Event type is required and must be a non-empty string");
  }

  if (typeof event.taskId !== "string" || event.taskId.trim().length === 0) {
    throw new Error("Event taskId is required and must be a non-empty string");
  }

  if (
    typeof event.createdAt !== "string" ||
    event.createdAt.trim().length === 0
  ) {
    throw new Error(
      "Event createdAt is required and must be a non-empty string",
    );
  }

  // Validate createdAt is ISO 8601 format
  const isoRegex = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d{3})?Z$/;
  if (!isoRegex.test(event.createdAt)) {
    throw new Error("Event createdAt must be an ISO 8601 timestamp");
  }

  // Validate optional metadata is an object if present
  if (
    event.metadata !== undefined &&
    (typeof event.metadata !== "object" ||
      event.metadata === null ||
      Array.isArray(event.metadata))
  ) {
    throw new Error("Event metadata, if provided, must be a plain object");
  }

  // eventId and message are strings but optional — no validation if absent
  if (event.eventId !== undefined && typeof event.eventId !== "string") {
    throw new Error("Event eventId, if provided, must be a string");
  }

  if (event.message !== undefined && typeof event.message !== "string") {
    throw new Error("Event message, if provided, must be a string");
  }
}

/**
 * Creates a valid observation event with required fields and optional metadata.
 * Automatically sets createdAt to current timestamp.
 *
 * @param {object} input - Input object with { type, taskId, metadata?, eventId?, message? }
 * @returns {object} A valid observation event
 * @throws {Error} if required fields are missing
 */
export function createObservationEvent({
  type,
  taskId,
  metadata,
  eventId,
  message,
} = {}) {
  // Validate inputs
  if (typeof type !== "string" || type.trim().length === 0) {
    throw new Error("type is required and must be a non-empty string");
  }

  if (typeof taskId !== "string" || taskId.trim().length === 0) {
    throw new Error("taskId is required and must be a non-empty string");
  }

  // Build the event with required fields
  const event = {
    type,
    taskId,
    createdAt: new Date().toISOString(),
  };

  // Add optional fields if provided
  if (metadata !== undefined) {
    event.metadata = metadata;
  }

  if (eventId !== undefined) {
    event.eventId = eventId;
  }

  if (message !== undefined) {
    event.message = message;
  }

  // Validate before returning
  validateObservationEvent(event);

  return event;
}
