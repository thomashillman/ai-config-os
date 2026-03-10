export function getOutcomeContract(payload) {
  if (!payload) {
    return null
  }
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

