const {
  buildToolStartedEventMeta,
  buildToolCompletedEventMeta,
} = require('../agent/tools/runtime/toolEventAdapter')

const buildMetaEvent = ({ title = '' } = {}) => ({
  type: 'meta',
  ...(title ? { title: String(title) } : {}),
})

const buildReasoningEvent = (text = '') => ({
  type: 'reasoning',
  text: String(text || ''),
})

const buildContentEvent = (text = '') => ({
  type: 'content',
  text: String(text || ''),
})

const buildErrorEvent = (input = '') => {
  if (input && typeof input === 'object' && !Array.isArray(input)) {
    const msg = String(input.msg || input.message || '').trim()
    const detail = String(input.detail || '').trim()
    const stage = String(input.stage || '').trim()
    const code = String(input.code || '').trim()
    const providerMessage = String(input.providerMessage || '').trim()
    const debugMessage = String(input.debugMessage || '').trim()
    const status = Number(input.status)
    const upstreamStatus = Number(input.upstreamStatus)
    const requestSummary =
      input.requestSummary && typeof input.requestSummary === 'object' && !Array.isArray(input.requestSummary)
        ? input.requestSummary
        : null

    return {
      type: 'error',
      msg,
      ...(detail ? { detail } : {}),
      ...(stage ? { stage } : {}),
      ...(code ? { code } : {}),
      ...(providerMessage ? { providerMessage } : {}),
      ...(debugMessage ? { debugMessage } : {}),
      ...(Number.isFinite(status) ? { status } : {}),
      ...(Number.isFinite(upstreamStatus) ? { upstreamStatus } : {}),
      ...(requestSummary ? { requestSummary } : {}),
      ...(typeof input.retryable === 'boolean' ? { retryable: input.retryable } : {}),
    }
  }

  return {
    type: 'error',
    msg: String(input || ''),
  }
}

const buildTaskResultEvent = ({ message = null, latest_task = null, restored = null } = {}) => ({
  type: 'task_result',
  ...(message ? { message } : {}),
  ...(latest_task ? { latest_task } : {}),
  ...(restored ? { restored } : {}),
})

const buildMessageSavedEvent = ({ message = null, restored = null } = {}) => ({
  type: 'message_saved',
  ...(message ? { message } : {}),
  ...(restored ? { restored } : {}),
})

const buildToolCallStartedEvent = ({ toolName = '', message = '' } = {}) => ({
  type: 'tool_call_started',
  tool: String(toolName || ''),
  message: String(message || (toolName ? `正在执行 ${toolName}` : '正在执行工具')),
  meta: buildToolStartedEventMeta({ toolName }),
})

const buildToolCallCompletedEvent = ({
  toolName = '',
  ok = true,
  summary = '',
  message = '',
} = {}) => ({
  type: 'tool_call_completed',
  tool: String(toolName || ''),
  ok: Boolean(ok),
  summary: String(summary || ''),
  message: String(message || summary || ''),
  meta: buildToolCompletedEventMeta({
    toolName,
    ok,
    summary,
  }),
})

module.exports = {
  buildContentEvent,
  buildErrorEvent,
  buildMessageSavedEvent,
  buildMetaEvent,
  buildReasoningEvent,
  buildTaskResultEvent,
  buildToolCallCompletedEvent,
  buildToolCallStartedEvent,
}
