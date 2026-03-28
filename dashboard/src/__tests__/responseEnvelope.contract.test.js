import { describe, it, expect } from 'vitest'
import { buildFetchError, getOutcomeContract } from '../lib/dashboardApi'

const CONTRACT_FIXTURES = {
  localOnly: {
    output: 'local route selected',
    success: true,
    effectiveOutcomeContract: {
      status: 'Full',
      selectedRoute: 'local-runtime-script',
      missingCapabilities: [],
      requiredUserInput: [],
    },
  },
  workerBackedLegacy: {
    status: 'Degraded',
    selectedRoute: 'worker-executor-proxy',
    missingCapabilities: ['shell.exec'],
    requiredUserInput: ['Retry from a higher capability environment'],
  },
}

describe('dashboard response envelope contracts', () => {
  it('normalizes local-only fixture with required envelope fields', () => {
    const contract = getOutcomeContract(CONTRACT_FIXTURES.localOnly)

    expect(contract).not.toBeNull()
    expect(contract.status).toBe('Full')
    expect(contract.selectedRoute).toBe('local-runtime-script')
    expect(Array.isArray(contract.missingCapabilities)).toBe(true)
    expect(Array.isArray(contract.requiredUserInput)).toBe(true)
  })

  it('supports worker-backed legacy payloads still consumed by existing clients', () => {
    const contract = getOutcomeContract(CONTRACT_FIXTURES.workerBackedLegacy)

    expect(contract).toBe(CONTRACT_FIXTURES.workerBackedLegacy)
    expect(contract.status).toBe('Degraded')
    expect(contract.selectedRoute).toBe('worker-executor-proxy')
  })

  it('provides deterministic attention-required guidance with non-empty concise summary', () => {
    const degraded = buildFetchError('Could not connect to dashboard API')
    const contract = degraded.effectiveOutcomeContract

    expect(degraded.success).toBe(false)
    expect(typeof degraded.output).toBe('string')
    expect(degraded.output.length).toBeGreaterThan(0)
    expect(degraded.output.length).toBeLessThanOrEqual(120)
    expect(contract.status).toBe('Degraded')
    expect(contract.selectedRoute).toBe('manual-input-correction')
    expect(contract.requiredUserInput.length).toBeGreaterThan(0)
    expect(contract.guidanceEquivalentRoute.length).toBeGreaterThan(0)
    expect(contract.guidanceFullWorkflowHigherCapabilityEnvironment.length).toBeGreaterThan(0)
  })
})
