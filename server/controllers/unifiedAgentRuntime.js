const { createChatCompletion } = require('../utils/deepseekClient')
const { normalizeLlmError } = require('../utils/llmError')
const { buildSystemPrompt, isProjectIntent } = require('../utils/aichatPrompt')
const { writeSse, endSse } = require('../utils/sseHelpers')
const { analyzeImageWithVisionTool } = require('./qwenVision')
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
const {
  buildMultimodalPrompt,
  buildUserMessageContent,
  getUserMessageType,
  normalizeAttachments,
} = require('../utils/unifiedAgentMultimodal')

const CHAT_ERROR_MESSAGES = {
  unavailable: '暂时无法对话',
  config: '对话服务异常',
  quota: '对话额度不足',
  rateLimit: '请稍后再试',
  failed: '发送失败',
}

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
const IMAGE_TOOL_NAME = 'analyze_image'
const IMAGE_TOOL_DEFINITION = {
  type: 'function',
  function: {
    name: IMAGE_TOOL_NAME,
    description: '分析当前用户消息中的图片，返回适用于穿搭问答的结构化结果',
    parameters: {
      type: 'object',
      additionalProperties: false,
      properties: {
        attachmentIndex: {
          type: 'integer',
          minimum: 0,
          maximum: 0,
          description: '当前仅支持分析第 1 张图片，因此固定为 0',
        },
        question: {
          type: 'string',
          description: '用户当前关于图片的提问或关注点，可为空',
        },
      },
    },
  },
}

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
  try {
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
  } catch (error) {
    throw normalizeLlmError(error, 'DeepSeek 对话服务', CHAT_ERROR_MESSAGES)
  }
}

const defaultGenerateTitle = async (messages) => {
  try {
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
  } catch (error) {
    throw normalizeLlmError(error, 'DeepSeek 标题生成服务', CHAT_ERROR_MESSAGES)
  }
}

const defaultGenerateSummary = async (messages) => {
  try {
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
  } catch (error) {
    throw normalizeLlmError(error, 'DeepSeek 会话总结服务', CHAT_ERROR_MESSAGES)
  }
}

const generateSessionTitle = async (messages, fallbackTitle, deps = {}) => {
  const generateTitle = deps.generateTitle || defaultGenerateTitle
  try {
    const promptMessages = [
      {
        role: 'system',
        content:
          '你是会话标题生成器。规则：\n1. 输出 4-12 个中文字的标题，仅输出标题本身\n2. 不要输出引号、序号、解释、标点（结尾不用句号）\n3. 不要照搬”帮我””请”等开头\n4. 标题要高度概括，像新闻标题一样精炼\n5. 绝对不要超过 12 个字',
      },
      ...messages,
    ]
    const raw = String(await generateTitle(promptMessages)).trim()
    const normalized = raw.replace(/["“”]/g, '').replace(/[。！？，、；：…—]+$/g, '').trim()
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
          '你是会话摘要生成器。请基于以下历史对话输出 JSON，必须包含 summary、key_facts、active_goals、pending_actions 这几个字段，不要输出任何额外文本。',
      },
      ...messages,
    ]
    const raw = await generateSummary(promptMessages)
    const parsed = tryParseStructuredMemoryPayload(raw, messages)
    if (!parsed.ok && currentMemory?.summary) {
      return currentMemory
    }
    return parsed.ok ? parsed.payload : summarizeSessionMemoryFromMessages(messages)
  } catch {
    if (currentMemory?.summary) return currentMemory
    return summarizeSessionMemoryFromMessages(messages)
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

const extractAssistantText = (message = {}) => {
  if (typeof message?.content === 'string') return message.content
  if (Array.isArray(message?.content)) {
    return message.content
      .map((item) => (typeof item?.text === 'string' ? item.text : ''))
      .filter(Boolean)
      .join('')
  }
  return ''
}

const parseToolArguments = (toolCall = {}) => {
  const raw = toolCall?.function?.arguments
  if (!raw) return {}
  try {
    const parsed = typeof raw === 'string' ? JSON.parse(raw) : raw
    return parsed && typeof parsed === 'object' ? parsed : {}
  } catch {
    return {}
  }
}

const buildImageToolMeta = (toolResult = {}, status = 'success') => ({
  toolCalls: [
    {
      name: IMAGE_TOOL_NAME,
      status,
      at: Date.now(),
    },
  ],
  toolResultsSummary: [
    typeof toolResult?.summary === 'string'
      ? toolResult.summary
      : String(toolResult?.error || '').trim(),
  ].filter(Boolean),
})

const requestToolDecision = async (messages) => {
  try {
    const response = await createChatCompletion(
      {
        model: process.env.DEEPSEEK_CHAT_MODEL || 'deepseek-chat',
        messages,
        tools: [IMAGE_TOOL_DEFINITION],
        tool_choice: 'auto',
        temperature: 0.2,
        stream: false,
      },
      { timeout: Number(process.env.DEEPSEEK_TIMEOUT_MS) || 120000 }
    )
    return response?.data?.choices?.[0]?.message || {}
  } catch (error) {
    throw normalizeLlmError(error, 'DeepSeek 工具决策服务', CHAT_ERROR_MESSAGES)
  }
}

const prepareImageToolConversation = async ({ messages, multimodal, emit }) => {
  if (!multimodal?.attachments?.length) {
    return { messages, toolMeta: null }
  }

  const assistantDecision = await requestToolDecision(messages)
  const toolCalls = Array.isArray(assistantDecision?.tool_calls) ? assistantDecision.tool_calls : []
  const shouldFallbackToTool = !multimodal.text.trim()

  let selectedToolCall = toolCalls.find((item) => item?.function?.name === IMAGE_TOOL_NAME) || null
  if (!selectedToolCall && !shouldFallbackToTool) {
    return { messages, toolMeta: null }
  }

  if (!selectedToolCall) {
    selectedToolCall = {
      id: `fallback-${Date.now()}`,
      type: 'function',
      function: {
        name: IMAGE_TOOL_NAME,
        arguments: JSON.stringify({
          attachmentIndex: 0,
          question: multimodal.text || '',
        }),
      },
    }
  }

  const args = parseToolArguments(selectedToolCall)
  const attachmentIndex = Number.isInteger(args.attachmentIndex) ? args.attachmentIndex : 0
  const attachment = multimodal.attachments[attachmentIndex]
  if (!attachment) {
    return {
      messages,
      toolMeta: buildImageToolMeta({ error: '图片工具未找到可分析的附件' }, 'failed'),
    }
  }

  emit?.({
    type: 'tool_call_started',
    tool: IMAGE_TOOL_NAME,
    message: '正在分析图片',
  })

  let toolResult
  let toolStatus = 'success'
  try {
    toolResult = await analyzeImageWithVisionTool({
      dataUrl: attachment.dataUrl,
      question: String(args.question || multimodal.text || '').trim(),
    })
    emit?.({
      type: 'tool_call_completed',
      tool: IMAGE_TOOL_NAME,
      ok: true,
      summary: toolResult.summary || '',
      message: '图片分析完成',
    })
  } catch (error) {
    toolStatus = 'failed'
    toolResult = {
      error: error.message || '图片分析失败',
      summary: '图片分析失败，请结合用户文字继续给出保守回答。',
    }
    emit?.({
      type: 'tool_call_completed',
      tool: IMAGE_TOOL_NAME,
      ok: false,
      summary: toolResult.summary,
      message: toolResult.error,
    })
  }

  const assistantToolMessage = {
    role: 'assistant',
    content: extractAssistantText(assistantDecision),
    tool_calls: [
      {
        id: selectedToolCall.id,
        type: 'function',
        function: {
          name: IMAGE_TOOL_NAME,
          arguments: JSON.stringify({
            attachmentIndex,
            question: String(args.question || multimodal.text || '').trim(),
          }),
        },
      },
    ],
  }

  const toolMessage = {
    role: 'tool',
    tool_call_id: selectedToolCall.id,
    content: JSON.stringify(toolResult),
  }

  return {
    messages: [...messages, assistantToolMessage, toolMessage],
    toolMeta: buildImageToolMeta(toolResult, toolStatus),
  }
}

const streamReplyFromMessages = async ({ messages, emit, isClientGone }) => {
  let fullReply = ''
  let streamResponse
  try {
    streamResponse = await createChatCompletion(
      {
        model: process.env.DEEPSEEK_CHAT_MODEL || 'deepseek-chat',
        messages,
        stream: true,
        temperature: 0.4,
      },
      { stream: true, timeout: Number(process.env.DEEPSEEK_TIMEOUT_MS) || 120000 }
    )
  } catch (error) {
    throw normalizeLlmError(error, 'DeepSeek 对话服务', CHAT_ERROR_MESSAGES)
  }

  const stream = streamResponse.data
  await consumeDeepSeekStream(
    stream,
    (text) => {
      fullReply += text
      emit({ type: 'content', text })
    },
    isClientGone
  )

  return fullReply
}

const resolveMultimodalInput = async (rawInput, deps = {}) => {
  const text = String(rawInput || '').trim()
  const attachments = normalizeAttachments(deps.attachments || [])

  if (!text && !attachments.length) {
    const error = new Error('消息内容不能为空')
    error.status = 400
    throw error
  }

  return {
    text,
    attachments,
    messageType: getUserMessageType({ text, attachments }),
    storedContent: buildUserMessageContent({ text, attachments }),
    modelInput: attachments.length ? buildMultimodalPrompt({ text }) : text,
  }
}

const prepareAgentMessage = async (userId, sessionId, input, deps = {}) => {
  const multimodal = await resolveMultimodalInput(input, deps)
  const trimmed = multimodal.modelInput

  const restored = await restoreAgentSession(userId, sessionId)
  const currentSession = restored.session
  await appendMessage(userId, sessionId, {
    role: 'user',
    content: multimodal.storedContent,
    messageType: multimodal.messageType,
    meta: multimodal.attachments.length ? { attachments: multimodal.attachments } : null,
  })

  const writeActionOptions = resolveWriteActionOptions(trimmed, deps.latestTask)
  const shouldUseTaskPipeline =
    Boolean(writeActionOptions) ||
    (!multimodal.attachments.length && !writeActionOptions)

  let taskResult = null
  if (shouldUseTaskPipeline) {
    taskResult = await executeAgentTask(
      userId,
      trimmed,
      'unified-agent',
      writeActionOptions || {}
    )
  }

  const taskType = taskResult?.taskType
  const canUseTask = Boolean(taskResult) && (
    taskResult?.requiresConfirmation ||
    taskType === 'closet_query' ||
    taskType === 'recommendation' ||
    taskType === 'profile' ||
    taskType === 'analytics'
  )

  return { restored, currentSession, taskResult, canUseTask, trimmed, multimodal }
}

const sendUnifiedAgentMessage = async (userId, sessionId, input, deps = {}) => {
  const { restored, currentSession, taskResult, canUseTask, trimmed, multimodal } = await prepareAgentMessage(userId, sessionId, input, deps)

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

  let finalMessages = messages
  let toolMeta = null
  if (multimodal.attachments.length) {
    const preparedConversation = await prepareImageToolConversation({ messages, multimodal })
    finalMessages = preparedConversation.messages
    toolMeta = preparedConversation.toolMeta
  }

  const generateReply = deps.generateReply || defaultGenerateReply
  const reply = await generateReply(finalMessages)

  const assistantMessage = await appendMessage(userId, sessionId, {
    role: 'assistant',
    content: reply || '我暂时没有生成有效回复，请稍后再试。',
    messageType: 'chat',
    meta: toolMeta,
  })

  await safeRefreshSessionMemory(userId, sessionId, deps)
  const restoredNext = await restoreAgentSession(userId, sessionId)
  return {
    message: assistantMessage,
    restored: restoredNext,
    latest_task: null,
  }
}

const parseDeepSeekStreamChunk = (line) => {
  if (!line || !line.startsWith('data: ')) return null
  const payload = line.slice(6).trim()
  if (payload === '[DONE]') return { done: true }
  try {
    const parsed = JSON.parse(payload)
    const content = parsed?.choices?.[0]?.delta?.content
    return content != null ? { text: content } : null
  } catch {
    return null
  }
}

const consumeDeepSeekStream = async (stream, onChunk, isClientGone) => {
  let buffer = ''
  for await (const chunk of stream) {
    if (isClientGone()) return
    buffer += chunk.toString()
    const frames = buffer.split('\n')
    buffer = frames.pop() || ''
    for (const frame of frames) {
      const parsed = parseDeepSeekStreamChunk(frame.trim())
      if (!parsed) continue
      if (parsed.done) return
      if (parsed.text != null) onChunk(parsed.text)
    }
  }
}

const sendUnifiedAgentMessageStream = async (userId, sessionId, input, ctx, deps = {}) => {
  const res = ctx.res
  const isClientGone = deps.isClientGone || (() => false)

  const emit = (data) => writeSse(res, data)
  const finish = () => endSse(res)

  let prepared
  try {
    prepared = await prepareAgentMessage(userId, sessionId, input, deps)
  } catch (err) {
    emit({ type: 'error', msg: err.message || '发送失败' })
    finish()
    return
  }

  const { restored, currentSession, taskResult, canUseTask, trimmed, multimodal } = prepared

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

    safeRefreshSessionMemory(userId, sessionId, deps).catch(() => {})
    const restoredNext = await restoreAgentSession(userId, sessionId)

    emit({ type: 'task_result', message: assistantMessage, latest_task: taskResult, restored: restoredNext })
    finish()
    return
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

  if (isClientGone()) { finish(); return }

  emit({ type: 'meta', title: nextTitle })

  const messages = buildUnifiedMessagesForModel({
    systemPrompt: buildSystemPrompt({ intent }),
    recentMessages: restored.recent_messages,
    sessionMemory: restored.session_memory,
    preferenceSummary: restored.preference_summary,
    userInput: trimmed,
  })

  let finalMessages = messages
  let toolMeta = null
  try {
    if (multimodal.attachments.length) {
      const preparedConversation = await prepareImageToolConversation({
        messages,
        multimodal,
        emit,
      })
      finalMessages = preparedConversation.messages
      toolMeta = preparedConversation.toolMeta
    }
  } catch (error) {
    const normalized = normalizeLlmError(error, 'DeepSeek 对话服务', CHAT_ERROR_MESSAGES)
    emit({ type: 'error', msg: normalized.message || '对话服务暂时不可用' })
    finish()
    return
  }

  let fullReply = ''
  try {
    fullReply = await streamReplyFromMessages({
      messages: finalMessages,
      emit,
      isClientGone,
    })
  } catch (error) {
    emit({ type: 'error', msg: error.message || '生成回复时出错' })
    finish()
    return
  }

  if (isClientGone()) { finish(); return }

  const assistantMessage = await appendMessage(userId, sessionId, {
    role: 'assistant',
    content: fullReply || '我暂时没有生成有效回复，请稍后再试。',
    messageType: 'chat',
    meta: toolMeta,
  })

  safeRefreshSessionMemory(userId, sessionId, deps).catch(() => {})
  const restoredNext = await restoreAgentSession(userId, sessionId)

  emit({ type: 'message_saved', message: assistantMessage, restored: restoredNext })
  finish()
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
  sendUnifiedAgentMessageStream,
  updateAgentSessionMemory,
}
