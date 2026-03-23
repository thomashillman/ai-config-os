// Momentum Observer — records narration events and user responses.
// Uses existing ProgressEventStore — no new storage system.

const VALID_RESPONSE_TYPES = [
  'engaged',
  'ignored',
  'follow_up',
  'changed_course',
  'accepted_upgrade',
  'declined_upgrade',
];

const VALID_NARRATION_POINTS = [
  'onStart',
  'onResume',
  'onFindingEvolved',
  'onUpgradeAvailable',
  'onShelfView',
];

function assertNonEmptyString(name, value) {
  if (typeof value !== 'string' || value.trim().length === 0) {
    throw new Error(`${name} is required`);
  }
}

function assertObject(name, value) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new Error(`${name} must be an object`);
  }
}

export class MomentumObserver {
  constructor({ progressEventStore } = {}) {
    assertObject('progressEventStore', progressEventStore);
    this.store = progressEventStore;
    this.narrationCounter = 0;
  }

  recordNarration({ taskId, narrationPoint, templateVersion, narratorOutput, taskSnapshot } = {}) {
    assertNonEmptyString('taskId', taskId);
    assertNonEmptyString('narrationPoint', narrationPoint);
    assertNonEmptyString('templateVersion', templateVersion);
    assertObject('narratorOutput', narratorOutput);

    if (!VALID_NARRATION_POINTS.includes(narrationPoint)) {
      throw new Error(`Invalid narration point: ${narrationPoint}. Must be one of: ${VALID_NARRATION_POINTS.join(', ')}`);
    }

    const version = taskSnapshot?.version || 0;
    this.narrationCounter += 1;
    const eventId = `evt_${version}_narration_${narrationPoint.toLowerCase()}_${Date.now()}_${this.narrationCounter}`;

    return this.store.append({
      taskId,
      eventId,
      type: 'narration_shown',
      message: `Narration shown: ${narrationPoint}`,
      createdAt: new Date().toISOString(),
      metadata: {
        narration_point: narrationPoint,
        template_version: templateVersion,
        narration_output: narratorOutput,
        route_at_narration: taskSnapshot?.current_route || null,
        findings_count_at_narration: taskSnapshot?.findings?.length || 0,
      },
    });
  }

  recordResponse({ taskId, narrationEventId, responseType, timeToActionMs, followUpText } = {}) {
    assertNonEmptyString('taskId', taskId);
    assertNonEmptyString('narrationEventId', narrationEventId);
    assertNonEmptyString('responseType', responseType);

    if (!VALID_RESPONSE_TYPES.includes(responseType)) {
      throw new Error(`Invalid response type: ${responseType}. Must be one of: ${VALID_RESPONSE_TYPES.join(', ')}`);
    }

    const timestamp = Date.now();
    const eventId = `evt_t${timestamp}_user_response_${responseType}`;

    const metadata = {
      narration_event_id: narrationEventId,
      response_type: responseType,
      time_to_action_ms: typeof timeToActionMs === 'number' ? timeToActionMs : null,
      follow_up_text: responseType === 'follow_up' && followUpText ? followUpText : null,
    };

    return this.store.append({
      taskId,
      eventId,
      type: 'user_response',
      message: `User responded to narration: ${responseType}`,
      createdAt: new Date().toISOString(),
      metadata,
    });
  }

  getObservationPairs({ taskId } = {}) {
    assertNonEmptyString('taskId', taskId);
    const events = this.store.listByTaskId(taskId);

    const narrations = events.filter((e) => e.type === 'narration_shown');
    const responses = events.filter((e) => e.type === 'user_response');

    return narrations.map((narration) => {
      const response = responses.find(
        (r) => r.metadata?.narration_event_id === narration.event_id,
      ) || null;
      return { narration, response };
    });
  }

  getRecentObservations({ since, limit = 100 } = {}) {
    assertNonEmptyString('since', since);

    const sinceDate = new Date(since);
    const allPairs = [];

    for (const [taskId] of this.store.eventsByTask) {
      const events = this.store.listByTaskId(taskId);
      const narrations = events.filter(
        (e) => e.type === 'narration_shown' && new Date(e.created_at) >= sinceDate,
      );
      const responses = events.filter((e) => e.type === 'user_response');

      for (const narration of narrations) {
        const response = responses.find(
          (r) => r.metadata?.narration_event_id === narration.event_id,
        ) || null;
        allPairs.push({ narration, response });
      }
    }

    allPairs.sort((a, b) => new Date(b.narration.created_at) - new Date(a.narration.created_at));
    return allPairs.slice(0, limit);
  }
}
