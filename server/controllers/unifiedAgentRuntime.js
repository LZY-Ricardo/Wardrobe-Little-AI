const { createChatCompletion } = require('../utils/deepseekClient')
const { buildSystemPrompt, isProjectIntent } = require('../utils/aichatPrompt')
const { getProfileInsight } = require('./profileInsights')
const { executeAgentTask, confirmAgentTask, cancelAgentTask } = require('./agent')
const {
  appendMessage,
  createSession,
  findLatestSessionByTitle,
  getSessionById,
  listMessagesForSession,
  listSessionsForUser,
  updateSessionMeta,
} = require('./unifiedAgentSessions')
const { getSessionMemory, upsertSessionMemory } = require('./unifiedAgentMemory')
const {
  buildRecentMessagesWindow,
  buildSessionRestorePayload,
  buildUnifiedMessagesForModel,
  deriveSessionTitle,
  tryParseStructuredMemoryPayload,
  summarizeSessionMemoryFromMessages,
} = require('./unifiedAgent.helpers')

const createAgentSession = async (userId, payload = {}) => {
  const session = await createSession(userId, payload)
  return {
    session,
    recent_messages: [],
    session_memory: null,
    preference_summary: await getProfileInsight(userId, {}),
  }
}

const LEGACY_CHAT_SESSION_TITLE = '兼容聊天会话'
const SUMMARY_RETRY_BACKOFF_MS = Number(process.env.UNIFIED_AGENT_SUMMARY_RETRY_BACKOFF_MS || 30000)
const summaryRetryBackoff = new Map()

const getOrCreateLegacyChatSession = async (userId) => {
  const existed = await findLatestSessionByTitle(userId, LEGACY_CHAT_SESSION_TITLE)
  if (existed) return existed
  return createSession(userId, { title: LEGACY_CHAT_SESSION_TITLE })
}

const listAgentSessions = async (userId, limit = 20) => listSessionsForUser(userId, limit)

const appendAgentMessage = async (userId, sessionId, payload = {}) => {
  return appendMessage(userId, sessionId, payload)
}

const restoreAgentSession = async (userId, sessionId) => {
  const session = await getSessionById(userId, sessionId)
  if (!session) {
    const error = new Error('会话不存在')
    error.status = 404
    throw error
  }
  const messages = await listMessagesForSession(userId, sessionId)
  const memory = await getSessionMemory(userId, sessionId)
  const preferenceSummary = await getProfileInsight(userId, {})
  const windowed = buildRecentMessagesWindow(messages, 12)
  return buildSessionRestorePayload({
    session,
    messages: windowed.recentMessages,
    sessionMemory: memory,
    preferenceSummary,
  })
}

const updateAgentSessionMemory = async (userId, sessionId, payload = {}) => {
  return upsertSessionMemory(userId, sessionId, payload)
}

const refreshSessionMemoryIfNeeded = async (userId, sessionId, deps = {}) => {
  const messages = await listMessagesForSession(userId, sessionId)
  if (!messages.length) return null
  const currentMemory = await getSessionMemory(userId, sessionId)
  if (messages.length <= 12) return currentMemory

  const retryUntil = summaryRetryBackoff.get(sessionId) || 0
  if (currentMemory?.summary && retryUntil > Date.now()) {
    return currentMemory
  }

  const omittedCount = messages.length - 12
  const olderMessages = messages.slice(0, omittedCount)
  const latestOlderMessageId = olderMessages.length ? olderMessages[olderMessages.length - 1].id || null : null
  if (currentMemory?.last_summarized_message_id === latestOlderMessageId) {
    return currentMemory
  }

  const summaryPayload = await generateStructuredSessionMemory(olderMessages, deps, currentMemory)
  if (currentMemory?.summary && summaryPayload === currentMemory) {
    summaryRetryBackoff.set(sessionId, Date.now() + SUMMARY_RETRY_BACKOFF_MS)
    return currentMemory
  }
  summaryRetryBackoff.delete(sessionId)
  return upsertSessionMemory(userId, sessionId, summaryPayload)
}

const safeRefreshSessionMemory = async (userId, sessionId, deps = {}) => {
  try {
    return await refreshSessionMemoryIfNeeded(userId, sessionId, deps)
  } catch {
    return getSessionMemory(userId, sessionId)
  }
}

const defaultGenerateReply = async (messages) => {
  const response = await createChatCompletion(
    {
      model: process.env.DEEPSEEK_CHAT_MODEL || 'deepseek-chat',
      messages,
      stream: false,
      temperature: 0.4,
    },
    { timeout: Number(process.env.DEEPSEEK_TIMEOUT_MS) || 120000 }
  )
  return response?.data?.choices?.[0]?.message?.content || ''
}

const defaultGenerateTitle = async (messages) => {
  const response = await createChatCompletion(
    {
      model: process.env.DEEPSEEK_CHAT_MODEL || 'deepseek-chat',
      messages,
      stream: false,
      temperature: 0.2,
    },
    { timeout: Number(process.env.DEEPSEEK_TITLE_TIMEOUT_MS || 15000) }
  )
  return response?.data?.choices?.[0]?.message?.content || ''
}

const defaultGenerateSummary = async (messages) => {
  const response = await createChatCompletion(
    {
      model: process.env.DEEPSEEK_CHAT_MODEL || 'deepseek-chat',
      messages,
      stream: false,
      temperature: 0.2,
    },
    { timeout: Number(process.env.DEEPSEEK_SUMMARY_TIMEOUT_MS || 20000) }
  )
  return response?.data?.choices?.[0]?.message?.content || ''
}

const generateSessionTitle = async (messages, fallbackTitle, deps = {}) => {
  const generateTitle = deps.generateTitle || defaultGenerateTitle
  try {
    const promptMessages = [
      {
        role: 'system',
        content:
          '你是会话标题生成器。请为以下对话生成一个 8 到 16 个字的中文标题。不要输出解释、引号、编号，不要照搬“帮我…”。',
      },
      ...messages,
    ]
    const raw = String(await generateTitle(promptMessages)).trim()
    const normalized = raw.replace(/["“”]/g, '').trim()
    if (!normalized) return fallbackTitle
    return deriveSessionTitle(normalized)
  } catch {
    return fallbackTitle
  }
}

const generateStructuredSessionMemory = async (messages, deps = {}, currentMemory = null) => {
  const generateSummary = deps.generateSummary || defaultGenerateSummary
  try {
    const promptMessages = [
      {
        role: 'system',
        content:
          '你是会话摘要生成器。请基于以下历史对话输出 JSON，必须包含字段 summary, key_facts, active_goals, pending_actions，不要输出任何额外文本。',
      },
      ...messages,
    ]
    const raw = await generateSummary(promptMessages)
    const parsed = tryParseStructuredMemoryPayload(raw, messages)
    if (!parsed.ok && currentMemory?.summary) {
      return currentMemory
    }
    return parsed.payload
  } catch {
    return currentMemory?.summary ? currentMemory : summarizeSessionMemoryFromMessages(messages)
  }
}

const resolveWriteActionOptions = (input, latestTask) => {
  const text = String(input || '')
  if (!latestTask) return null
  if (text.includes('保存') && text.includes('套装')) {
    return {
      action: 'save_suit',
      latestResult: latestTask,
      suitIndex: 0,
    }
  }
  if ((text.includes('记录') || text.includes('加入')) && text.includes('穿搭')) {
    return {
      action: 'create_outfit_log',
      latestResult: latestTask,
      suitIndex: 0,
    }
  }
  return null
}

const sendUnifiedAgentMessage = async (userId, sessionId, input, deps = {}) => {
  const trimmed = String(input || '').trim()
  if (!trimmed) {
    const error = new Error('消息内容不能为空')
    error.status = 400
    throw error
  }

  const restored = await restoreAgentSession(userId, sessionId)
  const currentSession = restored.session
  await appendMessage(userId, sessionId, {
    role: 'user',
    content: trimmed,
    messageType: 'chat',
  })

  const writeActionOptions = resolveWriteActionOptions(trimmed, deps.latestTask)
  const taskResult = await executeAgentTask(
    userId,
    trimmed,
    'unified-agent',
    writeActionOptions || {}
  )
  const taskType = taskResult?.taskType
  const canUseTask =
    taskResult?.requiresConfirmation ||
    taskType === 'closet_query' ||
    taskType === 'recommendation' ||
    taskType === 'profile' ||
    taskType === 'analytics'

  if (canUseTask) {
    const nextTitle =
      currentSession?.title === '新会话'
        ? await generateSessionTitle([{ role: 'user', content: trimmed }], deriveSessionTitle(trimmed), deps)
        : currentSession?.title
    await updateSessionMeta(userId, sessionId, {
      current_task_type: taskResult.taskType,
      title: nextTitle,
    })
    const messageType = taskResult?.requiresConfirmation ? 'confirm_request' : 'task_result'
    const assistantMessage = await appendMessage(userId, sessionId, {
      role: 'assistant',
      content: taskResult.summary,
      messageType,
      taskId: taskResult.historyId || null,
      confirmationStatus: taskResult?.requiresConfirmation ? 'pending' : '',
    })
    await safeRefreshSessionMemory(userId, sessionId, deps)
    const restoredNext = await restoreAgentSession(userId, sessionId)
    return {
      message: assistantMessage,
      restored: restoredNext,
      latest_task: taskResult,
    }
  }

  const intent = isProjectIntent(trimmed) ? 'project' : 'clothing'
  const nextTitle =
    currentSession?.title === '新会话'
      ? await generateSessionTitle([{ role: 'user', content: trimmed }], deriveSessionTitle(trimmed), deps)
      : currentSession?.title
  await updateSessionMeta(userId, sessionId, {
    current_task_type: 'chat',
    title: nextTitle,
  })
  const messages = buildUnifiedMessagesForModel({
    systemPrompt: buildSystemPrompt({ intent }),
    recentMessages: restored.recent_messages,
    sessionMemory: restored.session_memory,
    preferenceSummary: restored.preference_summary,
    userInput: trimmed,
  })

  const generateReply = deps.generateReply || defaultGenerateReply
  const reply = await generateReply(messages)

  const assistantMessage = await appendMessage(userId, sessionId, {
    role: 'assistant',
    content: reply || '我暂时没有生成有效回复，请稍后再试。',
    messageType: 'chat',
  })

  await safeRefreshSessionMemory(userId, sessionId, deps)
  const restoredNext = await restoreAgentSession(userId, sessionId)
  return {
    message: assistantMessage,
    restored: restoredNext,
    latest_task: null,
  }
}

const confirmUnifiedAgentAction = async (userId, sessionId, confirmId) => {
  const result = await confirmAgentTask(userId, confirmId)
  await appendMessage(userId, sessionId, {
    role: 'assistant',
    content: result.summary,
    messageType: 'confirm_result',
    taskId: result.historyId || null,
    confirmationStatus: 'confirmed',
  })
  await safeRefreshSessionMemory(userId, sessionId)
  const restored = await restoreAgentSession(userId, sessionId)
  return {
    restored,
    latest_task: result,
  }
}

const cancelUnifiedAgentAction = async (userId, sessionId, confirmId) => {
  const result = await cancelAgentTask(userId, confirmId)
  await appendMessage(userId, sessionId, {
    role: 'assistant',
    content: '已取消待确认任务',
    messageType: 'confirm_result',
    taskId: result.historyId || null,
    confirmationStatus: 'cancelled',
  })
  await safeRefreshSessionMemory(userId, sessionId)
  const restored = await restoreAgentSession(userId, sessionId)
  return {
    restored,
    latest_task: null,
  }
}

module.exports = {
  appendAgentMessage,
  cancelUnifiedAgentAction,
  confirmUnifiedAgentAction,
  createAgentSession,
  getOrCreateLegacyChatSession,
  listAgentSessions,
  refreshSessionMemoryIfNeeded,
  restoreAgentSession,
  sendUnifiedAgentMessage,
  updateAgentSessionMemory,
}
