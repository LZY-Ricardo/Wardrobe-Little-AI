const createCircuitBreaker = ({
  name = 'breaker',
  failureThreshold = 3,
  cooldownMs = 30 * 1000,
} = {}) => {
  const state = {
    failures: 0,
    openedAt: 0,
  }

  const isOpen = () => state.openedAt > 0 && Date.now() - state.openedAt < cooldownMs

  const markSuccess = () => {
    state.failures = 0
    state.openedAt = 0
  }

  const markFailure = () => {
    state.failures += 1
    if (state.failures >= failureThreshold && state.openedAt === 0) {
      state.openedAt = Date.now()
    }
  }

  const exec = async (fn) => {
    if (isOpen()) {
      const error = new Error(`${name}: CIRCUIT_OPEN`)
      error.code = 'CIRCUIT_OPEN'
      error.status = 503
      throw error
    }
    try {
      const result = await fn()
      markSuccess()
      return result
    } catch (err) {
      markFailure()
      throw err
    }
  }

  const snapshot = () => ({
    name,
    failures: state.failures,
    openedAt: state.openedAt,
    open: isOpen(),
    cooldownMs,
    failureThreshold,
  })

  return { exec, snapshot, isOpen }
}

module.exports = {
  createCircuitBreaker,
}

