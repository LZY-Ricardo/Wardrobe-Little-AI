const resolveConfirmationRequirement = (tool = {}, context = {}) => {
  const confirmationPolicy = String(tool.confirmationPolicy || 'never').trim()
  const mode = String(tool.mode || '').trim()
  const profilePreferences = context?.profile?.confirmationPreferences || {}

  if (confirmationPolicy === 'always') {
    return {
      requiresConfirmation: true,
      reason: 'policy_always_confirm',
    }
  }

  if (confirmationPolicy === 'low-risk-optional') {
    if (profilePreferences.lowRiskNoConfirm) {
      return {
        requiresConfirmation: false,
        reason: 'policy_low_risk_auto_execute',
      }
    }
    return {
      requiresConfirmation: true,
      reason: 'policy_low_risk_needs_confirmation',
    }
  }

  if (mode === 'write' || mode === 'write_batch') {
    return {
      requiresConfirmation: Boolean(tool.dangerous),
      reason: tool.dangerous ? 'policy_dangerous_write_confirm' : 'policy_write_no_confirm',
    }
  }

  return {
    requiresConfirmation: false,
    reason: 'policy_read_only',
  }
}

module.exports = {
  resolveConfirmationRequirement,
}
