const { resolveConfirmationRequirement } = require('../policies/confirmationPolicy')

const routeToolExecution = ({ tool, context = {} } = {}) => {
  const confirmation = resolveConfirmationRequirement(tool, context)
  return confirmation.requiresConfirmation
    ? { type: 'confirm', confirmation }
    : { type: 'direct', confirmation }
}

module.exports = {
  routeToolExecution,
}
