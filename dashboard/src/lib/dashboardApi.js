export function getOutcomeContract(payload) {
  if (!payload) {
    return null
  }
  // Canonical envelope (contract_version present): success responses need no degraded panel;
  // error responses are normalised into the legacy degraded shape for ResponseContractPanel.
  if (payload.contract_version) {
    if (payload.error) {
      return {
        status: 'Degraded',
        selectedRoute: 'manual-input-correction',
        missingCapabilities: [payload.error.code],
        requiredUserInput: [payload.error.hint || payload.error.message],
        guidanceEquivalentRoute: payload.error.message,
        guidanceFullWorkflowHigherCapabilityEnvironment:
          payload.error.hint || 'Retry from a full-capability environment.',
      }
    }
    return null
  }
  // Legacy shape: extract effectiveOutcomeContract if present, otherwise return payload.
  return payload.effectiveOutcomeContract ?? payload
}

export function buildFetchError(message = "Could not connect to dashboard API") {
  return {
    output: message,
    success: false,
    effectiveOutcomeContract: {
      status: "Degraded",
      selectedRoute: "manual-input-correction",
      missingCapabilities: ["dashboard-api-connectivity"],
      requiredUserInput: ["Ensure the dashboard API is running and retry the request."],
      guidanceEquivalentRoute: "Run the corresponding runtime script directly from the repository root.",
      guidanceFullWorkflowHigherCapabilityEnvironment:
        "Retry this action from an environment where the local dashboard API can execute runtime scripts.",
    },
  }
}

