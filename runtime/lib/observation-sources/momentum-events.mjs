// Momentum Events Observation Source — maps progress events to canonical observation events.
// Pure mapper: accepts raw progress events, returns structured observations.
// Does not query storage directly; meant to be called by unified read models.

/**
 * Map momentum-generated progress events to canonical observation events.
 * Filters and transforms narration_shown and user_response event types.
 *
 * @param {Array<object>} progressEvents - Raw progress events from ProgressEventStore
 * @returns {Array<object>} Observation events with standardized structure
 */
export function mapMomentumProgressEvents(progressEvents = []) {
  if (!Array.isArray(progressEvents)) {
    throw new Error('progressEvents must be an array');
  }

  return progressEvents
    .map((event) => mapSingleEvent(event))
    .filter(Boolean); // Filter out null/undefined from unmapped types
}

/**
 * Map a single progress event to observation format.
 * Returns null if the event type is not recognized.
 *
 * @param {object} event - Single progress event
 * @returns {object|null} Observation event or null
 */
function mapSingleEvent(event) {
  if (!event || typeof event !== 'object') {
    return null;
  }

  switch (event.type) {
    case 'narration_shown':
      return mapNarrationEvent(event);
    case 'user_response':
      return mapResponseEvent(event);
    default:
      return null;
  }
}

/**
 * Map narration_shown event to observation format.
 *
 * @param {object} event - Progress event with type='narration_shown'
 * @returns {object} Observation narration event
 */
function mapNarrationEvent(event) {
  return {
    task_id: event.task_id,
    event_id: event.event_id,
    type: 'narration',
    created_at: event.created_at,
    metadata: {
      narration_point: event.metadata?.narration_point || null,
      template_version: event.metadata?.template_version || null,
      narration_output: event.metadata?.narration_output || null,
      route_at_narration: event.metadata?.route_at_narration || null,
      findings_count_at_narration: event.metadata?.findings_count_at_narration || 0,
    },
  };
}

/**
 * Map user_response event to observation format.
 *
 * @param {object} event - Progress event with type='user_response'
 * @returns {object} Observation response event
 */
function mapResponseEvent(event) {
  return {
    task_id: event.task_id,
    event_id: event.event_id,
    type: 'response',
    created_at: event.created_at,
    metadata: {
      narration_event_id: event.metadata?.narration_event_id || null,
      response_type: event.metadata?.response_type || null,
      time_to_action_ms: event.metadata?.time_to_action_ms ?? null,
      follow_up_text: event.metadata?.follow_up_text || null,
    },
  };
}
