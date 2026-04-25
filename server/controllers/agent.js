const {
  getPendingAgentTaskByConfirmId: getPendingAgentTaskRecordByConfirmId,
  insertAgentTaskHistory,
  listAgentTaskHistoryForUser,
  updateAgentTaskHistory,
} = require('./agentTaskHistoryRepository')
const {
  confirmAgentTask: confirmAgentTaskViaService,
  cancelAgentTask: cancelAgentTaskViaService,
  getPendingAgentTaskByConfirmId,
} = require('./confirmationService')
const {
  executeLegacyAgentTask,
  mapToolIntentToTaskOptions,
} = require('./legacyTaskFallbackService')

const executeAgentToolIntent = async (
  userId,
  input,
  sourceEntry = 'agent-page',
  toolName = '',
  toolArgs = {},
  runtimeContext = {}
) => {
  const options = mapToolIntentToTaskOptions(toolName, toolArgs, runtimeContext)
  if (!options) {
    const error = new Error('UNSUPPORTED_AGENT_TOOL_INTENT')
    error.status = 400
    throw error
  }
  return executeAgentTask(userId, input, sourceEntry, options)
}

const executeAgentTask = async (userId, input, sourceEntry = 'agent-page', options = {}) => {
  return executeLegacyAgentTask(userId, input, sourceEntry, options, {
    historyRepo: {
      insertAgentTaskHistory,
    },
  })
}

module.exports = {
  cancelAgentTask: async (userId, confirmId) => cancelAgentTaskViaService(userId, confirmId, {
    getPendingAgentTaskByConfirmId: (uid, cid) => getPendingAgentTaskByConfirmId(uid, cid, {
      getPendingAgentTaskRecordByConfirmId,
    }),
    updateAgentTaskHistory,
  }),
  confirmAgentTask: async (userId, confirmId) => confirmAgentTaskViaService(userId, confirmId, {
    getPendingAgentTaskByConfirmId: (uid, cid) => getPendingAgentTaskByConfirmId(uid, cid, {
      getPendingAgentTaskRecordByConfirmId,
    }),
    updateAgentTaskHistory,
  }),
  executeAgentToolIntent,
  executeAgentTask,
  listAgentTaskHistoryForUser,
  __clearPendingAgentOpsForTest: () => require('./confirmationService').__clearPendingAgentOpsForTest(),
}
