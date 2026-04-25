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

const buildErrorEvent = (msg = '') => ({
  type: 'error',
  msg: String(msg || ''),
})

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
