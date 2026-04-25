const { createChatCompletion } = require('../utils/deepseekClient')
const { normalizeLlmError } = require('../utils/llmError')
const { buildSystemPrompt, isProjectIntent } = require('../utils/aichatPrompt')
const { getTodayInChina } = require('../utils/date')
const { writeSse, endSse } = require('../utils/sseHelpers')
const {
  buildErrorEvent,
  buildMessageSavedEvent,
  buildMetaEvent,
  buildTaskResultEvent,
} = require('../utils/unifiedAgentSseEvents')
const { runAgentWorkflow } = require('./agentOrchestrator')
const { getProfileInsight } = require('./profileInsights')
const { executeAgentTask, executeAgentToolIntent, confirmAgentTask, cancelAgentTask } = require('./agent')
const { resolveWriteActionOptions } = require('./legacyTaskFallbackService')
const { executeTool } = require('../utils/toolRegistry')
const { runAutonomousToolLoop, defaultStreamAssistantTurn } = require('../agent/tools/runtime/autonomousToolRuntime')
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
const { buildAssistantImageAttachments } = require('./unifiedAgentAttachments')
const {
  buildAssistantActionButton,
  buildRecentMessagesWindow,
  buildSessionRestorePayload,
  buildUnifiedMessagesForModel,
  deriveSessionTitle,
  sanitizeAssistantReply,
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

const streamReplyFromMessages = async ({
  messages,
  emit,
  isClientGone,
  createChatCompletionImpl = createChatCompletion,
}) => {
  let fullReply = ''
  let reasoningAccum = ''
  let streamResponse
  try {
    streamResponse = await createChatCompletionImpl(
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
    (reasoning) => {
      reasoningAccum += reasoning
      emit({ type: 'reasoning', text: reasoning })
    },
    isClientGone
  )

  return { reply: fullReply, reasoningContent: reasoningAccum }
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
    modelInput: attachments.length ? buildMultimodalPrompt({ text, attachments }) : text,
  }
}

const initializeAgentMessage = async (userId, sessionId, input, deps = {}) => {
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

  return {
    restored,
    currentSession,
    trimmed,
    multimodal,
  }
}

const prepareAgentMessage = async (userId, sessionId, input, deps = {}) => {
  const shouldUseAutonomousTools = Boolean(deps.enableAutonomousTools || deps.requestAssistantTurn)
  const { restored, currentSession, trimmed, multimodal } = await initializeAgentMessage(userId, sessionId, input, deps)

  if (!shouldUseAutonomousTools) {
    const workflowResult = await runAgentWorkflow({
      userId,
      input: multimodal.text,
      multimodal,
      sourceEntry: 'unified-agent',
      deps,
    })
    if (workflowResult) {
      return {
        restored,
        currentSession,
        taskResult: workflowResult,
        autonomousResult: null,
        canUseTask:
          workflowResult?.requiresConfirmation ||
          workflowResult?.taskType === 'create_cloth' ||
          workflowResult?.status === 'needs_clarification',
        trimmed,
        multimodal,
      }
    }
  }

  const intent = isProjectIntent(trimmed) ? 'project' : 'clothing'
  if (shouldUseAutonomousTools) {
    const autonomousMessages = buildUnifiedMessagesForModel({
      systemPrompt: buildSystemPrompt({ intent, currentDate: getTodayInChina() }),
      recentMessages: restored.recent_messages,
      sessionMemory: restored.session_memory,
      preferenceSummary: restored.preference_summary,
      userInput: trimmed,
    })
    const autonomousResult = await runAutonomousToolLoop({
      userId,
      input: trimmed,
      sourceEntry: 'unified-agent',
      intent,
      messages: autonomousMessages,
      multimodal,
      latestTask: deps.latestTask || null,
      deps: {
        ...deps,
        executeTool,
        executeAgentToolIntent,
        preferenceSummary: restored.preference_summary,
        clientContext: deps.clientContext || null,
        sessionMemory: restored.session_memory,
      },
      sanitizeAssistantReply,
    })
    if (autonomousResult) {
      return {
        restored,
        currentSession,
        taskResult: autonomousResult.kind === 'task' ? autonomousResult.taskResult : null,
        autonomousResult,
        canUseTask: autonomousResult.kind === 'task',
        trimmed,
        multimodal,
        intent,
      }
    }
  }

  if (shouldUseAutonomousTools) {
    return {
      restored,
      currentSession,
      taskResult: null,
      autonomousResult: null,
      canUseTask: false,
      trimmed,
      multimodal,
      intent,
    }
  }

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
    taskType === 'cloth_detail' ||
    taskType === 'suit_detail' ||
    taskType === 'outfit_log_detail' ||
    taskType === 'closet_query' ||
    taskType === 'recommendation' ||
    taskType === 'profile' ||
    taskType === 'analytics'
  )

  return { restored, currentSession, taskResult, canUseTask, trimmed, multimodal }
}

const sendUnifiedAgentMessage = async (userId, sessionId, input, deps = {}) => {
  const { restored, currentSession, taskResult, autonomousResult, canUseTask, trimmed, multimodal, intent: preparedIntent } = await prepareAgentMessage(userId, sessionId, input, deps)

  if (canUseTask) {
    const nextTitle =
      currentSession?.title === '新会话'
        ? await generateSessionTitle([{ role: 'user', content: trimmed }], deriveSessionTitle(trimmed), deps)
        : currentSession?.title

    await updateSessionMeta(userId, sessionId, {
      current_task_type: taskResult.taskType,
      title: nextTitle,
    })

    const actionButton = taskResult?.requiresConfirmation
      ? null
      : buildAssistantActionButton({
        intent: preparedIntent || 'clothing',
        reply: taskResult.summary,
        latestTask: taskResult,
      })
    const attachments = await resolveAssistantAttachments({
      userId,
      input: trimmed,
      taskResult,
      deps,
    })

    const messageType = taskResult?.requiresConfirmation ? 'confirm_request' : 'task_result'
    const assistantMessage = await appendMessage(userId, sessionId, {
      role: 'assistant',
      content: taskResult.summary,
      messageType,
      taskId: taskResult.historyId || null,
      confirmationStatus: taskResult?.requiresConfirmation ? 'pending' : '',
      meta: buildAssistantMessageMeta({
        attachments,
        pendingConfirmation: taskResult?.requiresConfirmation ? taskResult.confirmation : null,
        actionButton,
      }),
    })

    await safeRefreshSessionMemory(userId, sessionId, deps)
    const restoredNext = await restoreAgentSession(userId, sessionId)
    return {
      message: assistantMessage,
      restored: restoredNext,
      latest_task: taskResult,
    }
  }

  if (autonomousResult?.kind === 'reply') {
    const nextTitle =
      currentSession?.title === '新会话'
        ? await generateSessionTitle([{ role: 'user', content: trimmed }], deriveSessionTitle(trimmed), deps)
        : currentSession?.title

    await updateSessionMeta(userId, sessionId, {
      current_task_type: 'chat',
      title: nextTitle,
    })

    const actionButton = buildAssistantActionButton({
      intent: preparedIntent || 'clothing',
      reply: autonomousResult.reply,
      latestTask: deps.latestTask || null,
    })
    const attachments = await resolveAssistantAttachments({
      userId,
      input: trimmed,
      latestTask: deps.latestTask || null,
      deps,
    })

    const assistantMessage = await appendMessage(userId, sessionId, {
      role: 'assistant',
      content: autonomousResult.reply || '我暂时没有生成有效回复，请稍后再试。',
      messageType: 'chat',
      meta: buildAssistantMessageMeta({
        toolMeta: autonomousResult.toolMeta,
        attachments,
        actionButton,
        reasoningContent: autonomousResult.reasoningContent,
      }),
    })

    await safeRefreshSessionMemory(userId, sessionId, deps)
    const restoredNext = await restoreAgentSession(userId, sessionId)
    return {
      message: assistantMessage,
      restored: restoredNext,
      latest_task: null,
    }
  }

  const intent = preparedIntent || (isProjectIntent(trimmed) ? 'project' : 'clothing')
  const nextTitle =
    currentSession?.title === '新会话'
      ? await generateSessionTitle([{ role: 'user', content: trimmed }], deriveSessionTitle(trimmed), deps)
      : currentSession?.title

  await updateSessionMeta(userId, sessionId, {
    current_task_type: 'chat',
    title: nextTitle,
  })

  const messages = buildUnifiedMessagesForModel({
    systemPrompt: buildSystemPrompt({ intent, currentDate: getTodayInChina() }),
    recentMessages: restored.recent_messages,
    sessionMemory: restored.session_memory,
    preferenceSummary: restored.preference_summary,
    userInput: trimmed,
  })

  const generateReply = deps.generateReply || defaultGenerateReply
  const reply = sanitizeAssistantReply(await generateReply(messages), { intent })
  const actionButton = buildAssistantActionButton({
    intent,
    reply,
    latestTask: deps.latestTask || null,
  })
  const attachments = await resolveAssistantAttachments({
    userId,
    input: trimmed,
    latestTask: deps.latestTask || null,
    deps,
  })

  const assistantMessage = await appendMessage(userId, sessionId, {
    role: 'assistant',
    content: reply || '我暂时没有生成有效回复，请稍后再试。',
    messageType: 'chat',
    meta: buildAssistantMessageMeta({ attachments, actionButton }),
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
    const delta = parsed?.choices?.[0]?.delta
    if (!delta) return null
    const result = {}
    if (delta.content != null) result.text = delta.content
    if (delta.reasoning_content != null) result.reasoning = delta.reasoning_content
    return Object.keys(result).length ? result : null
  } catch {
    return null
  }
}

const consumeDeepSeekStream = async (stream, onChunk, onReasoning, isClientGone) => {
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
      if (parsed.reasoning != null) onReasoning?.(parsed.reasoning)
    }
  }
}

const resolveStreamingAutonomousMode = (deps = {}) => {
  const hasStreamAssistantTurnOverride = Object.prototype.hasOwnProperty.call(deps, 'streamAssistantTurn')
  const streamAssistantTurn = hasStreamAssistantTurnOverride
    ? deps.streamAssistantTurn
    : defaultStreamAssistantTurn

  return {
    streamAssistantTurn,
    shouldUseStreamingAutonomous: Boolean(
      deps.enableAutonomousTools &&
      typeof streamAssistantTurn === 'function'
    ),
  }
}

const buildAssistantMessageMeta = ({
  actionButton = null,
  attachments = null,
  pendingConfirmation = null,
  reasoningContent = '',
  toolMeta = null,
} = {}) => {
  const meta = {
    ...(toolMeta && typeof toolMeta === 'object' ? toolMeta : {}),
    ...(Array.isArray(attachments) && attachments.length ? { attachments } : {}),
    ...(actionButton ? { actionButton } : {}),
    ...(pendingConfirmation ? { pendingConfirmation } : {}),
    ...(reasoningContent ? { reasoningContent } : {}),
  }

  return Object.keys(meta).length ? meta : null
}

const resolveAssistantAttachments = async ({
  userId,
  input = '',
  taskResult = null,
  latestTask = null,
  deps = {},
} = {}) => buildAssistantImageAttachments({
  userId,
  taskResult,
  latestTask,
  input,
  deps,
})

const sendUnifiedAgentMessageStream = async (userId, sessionId, input, ctx, deps = {}) => {
  const res = ctx.res
  const isClientGone = deps.isClientGone || (() => false)

  const emit = (data) => writeSse(res, data)
  const finish = () => endSse(res)

  const { shouldUseStreamingAutonomous, streamAssistantTurn } = resolveStreamingAutonomousMode(deps)
  if (shouldUseStreamingAutonomous) {
    let initialized
    try {
      initialized = await initializeAgentMessage(userId, sessionId, input, deps)
    } catch (err) {
      emit(buildErrorEvent(err.message || '发送失败'))
      finish()
      return
    }

    const { restored, currentSession, trimmed, multimodal } = initialized
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
    emit(buildMetaEvent({ title: nextTitle }))

    const autonomousMessages = buildUnifiedMessagesForModel({
      systemPrompt: buildSystemPrompt({ intent, currentDate: getTodayInChina() }),
      recentMessages: restored.recent_messages,
      sessionMemory: restored.session_memory,
      preferenceSummary: restored.preference_summary,
      userInput: trimmed,
    })

    let autonomousResult
    try {
      autonomousResult = await runAutonomousToolLoop({
        userId,
        input: trimmed,
        sourceEntry: 'unified-agent',
        intent,
        messages: autonomousMessages,
        multimodal,
        latestTask: deps.latestTask || null,
      deps: {
        ...deps,
        executeTool,
        executeAgentToolIntent,
        preferenceSummary: restored.preference_summary,
        clientContext: deps.clientContext || null,
        sessionMemory: restored.session_memory,
        streamAssistantTurn,
        isClientGone,
        },
        emit,
        sanitizeAssistantReply,
      })
    } catch (error) {
      emit(buildErrorEvent(error.message || '生成回复时出错'))
      finish()
      return
    }

    if (!autonomousResult) {
      emit(buildErrorEvent('暂时无法对话'))
      finish()
      return
    }

    if (autonomousResult.kind === 'aborted' || isClientGone()) {
      finish()
      return
    }

    if (autonomousResult.kind === 'task') {
      const taskResult = autonomousResult.taskResult
      if (isClientGone()) { finish(); return }
      await updateSessionMeta(userId, sessionId, {
        current_task_type: taskResult.taskType,
        title: nextTitle,
      })

      const actionButton = taskResult?.requiresConfirmation
        ? null
        : buildAssistantActionButton({
          intent,
          reply: taskResult.summary,
          latestTask: taskResult,
        })
      const attachments = await resolveAssistantAttachments({
        userId,
        input: trimmed,
        taskResult,
        deps,
      })

      const messageType = taskResult?.requiresConfirmation ? 'confirm_request' : 'task_result'
      const assistantMessage = await appendMessage(userId, sessionId, {
        role: 'assistant',
        content: taskResult.summary,
        messageType,
        taskId: taskResult.historyId || null,
        confirmationStatus: taskResult?.requiresConfirmation ? 'pending' : '',
        meta: buildAssistantMessageMeta({
          attachments,
          pendingConfirmation: taskResult?.requiresConfirmation ? taskResult.confirmation : null,
          actionButton,
        }),
      })

      safeRefreshSessionMemory(userId, sessionId, deps).catch(() => {})
      const restoredNext = await restoreAgentSession(userId, sessionId)
      emit(buildTaskResultEvent({ message: assistantMessage, latest_task: taskResult, restored: restoredNext }))
      finish()
      return
    }

    if (isClientGone()) { finish(); return }

    const actionButton = buildAssistantActionButton({
      intent,
      reply: autonomousResult.reply,
      latestTask: deps.latestTask || null,
    })
    const attachments = await resolveAssistantAttachments({
      userId,
      input: trimmed,
      latestTask: deps.latestTask || null,
      deps,
    })

    const assistantMessage = await appendMessage(userId, sessionId, {
      role: 'assistant',
      content: autonomousResult.reply || '我暂时没有生成有效回复，请稍后再试。',
      messageType: 'chat',
      meta: buildAssistantMessageMeta({
        toolMeta: autonomousResult.toolMeta,
        attachments,
        actionButton,
        reasoningContent: autonomousResult.reasoningContent,
      }),
    })

    safeRefreshSessionMemory(userId, sessionId, deps).catch(() => {})
    const restoredNext = await restoreAgentSession(userId, sessionId)
    emit(buildMessageSavedEvent({ message: assistantMessage, restored: restoredNext }))
    finish()
    return
  }

  let prepared
  try {
    prepared = await prepareAgentMessage(userId, sessionId, input, {
      ...deps,
      enableAutonomousTools: false,
      requestAssistantTurn: undefined,
    })
  } catch (err) {
    emit(buildErrorEvent(err.message || '发送失败'))
    finish()
    return
  }

  const { restored, currentSession, taskResult, canUseTask, trimmed, intent: preparedIntent } = prepared

  if (canUseTask) {
    if (isClientGone()) { finish(); return }
    const nextTitle =
      currentSession?.title === '新会话'
        ? await generateSessionTitle([{ role: 'user', content: trimmed }], deriveSessionTitle(trimmed), deps)
        : currentSession?.title

    await updateSessionMeta(userId, sessionId, {
      current_task_type: taskResult.taskType,
      title: nextTitle,
    })

    const actionButton = taskResult?.requiresConfirmation
      ? null
      : buildAssistantActionButton({
        intent: preparedIntent || 'clothing',
        reply: taskResult.summary,
        latestTask: taskResult,
      })
    const attachments = await resolveAssistantAttachments({
      userId,
      input: trimmed,
      taskResult,
      deps,
    })

    const messageType = taskResult?.requiresConfirmation ? 'confirm_request' : 'task_result'
    const assistantMessage = await appendMessage(userId, sessionId, {
      role: 'assistant',
      content: taskResult.summary,
      messageType,
      taskId: taskResult.historyId || null,
      confirmationStatus: taskResult?.requiresConfirmation ? 'pending' : '',
      meta: buildAssistantMessageMeta({
        attachments,
        pendingConfirmation: taskResult?.requiresConfirmation ? taskResult.confirmation : null,
        actionButton,
      }),
    })

    safeRefreshSessionMemory(userId, sessionId, deps).catch(() => {})
    const restoredNext = await restoreAgentSession(userId, sessionId)

    emit(buildTaskResultEvent({ message: assistantMessage, latest_task: taskResult, restored: restoredNext }))
    finish()
    return
  }

  const intent = preparedIntent || (isProjectIntent(trimmed) ? 'project' : 'clothing')
  const nextTitle =
    currentSession?.title === '新会话'
      ? await generateSessionTitle([{ role: 'user', content: trimmed }], deriveSessionTitle(trimmed), deps)
      : currentSession?.title

  await updateSessionMeta(userId, sessionId, {
    current_task_type: 'chat',
    title: nextTitle,
  })

  if (isClientGone()) { finish(); return }

  emit(buildMetaEvent({ title: nextTitle }))

  const messages = buildUnifiedMessagesForModel({
    systemPrompt: buildSystemPrompt({ intent, currentDate: getTodayInChina() }),
    recentMessages: restored.recent_messages,
    sessionMemory: restored.session_memory,
    preferenceSummary: restored.preference_summary,
    userInput: trimmed,
  })

  let streamResult
  try {
    streamResult = await streamReplyFromMessages({
      messages,
      emit,
      isClientGone,
    })
  } catch (error) {
    emit(buildErrorEvent(error.message || '生成回复时出错'))
    finish()
    return
  }

  if (isClientGone()) { finish(); return }

  const cleanedReply = sanitizeAssistantReply(streamResult.reply, { intent })
  const actionButton = buildAssistantActionButton({
    intent,
    reply: cleanedReply,
    latestTask: deps.latestTask || null,
  })
  const attachments = await resolveAssistantAttachments({
    userId,
    input: trimmed,
    latestTask: deps.latestTask || null,
    deps,
  })

  const assistantMessage = await appendMessage(userId, sessionId, {
    role: 'assistant',
    content: cleanedReply || '我暂时没有生成有效回复，请稍后再试。',
    messageType: 'chat',
    meta: buildAssistantMessageMeta({
      attachments,
      actionButton,
      reasoningContent: streamResult.reasoningContent,
    }),
  })

  safeRefreshSessionMemory(userId, sessionId, deps).catch(() => {})
  const restoredNext = await restoreAgentSession(userId, sessionId)

  emit(buildMessageSavedEvent({ message: assistantMessage, restored: restoredNext }))
  finish()
}

const confirmUnifiedAgentAction = async (userId, sessionId, confirmId) => {
  const result = await confirmAgentTask(userId, confirmId)
  const actionButton = buildAssistantActionButton({
    intent: 'clothing',
    reply: result.summary,
    latestTask: result,
  })
  await appendMessage(userId, sessionId, {
    role: 'assistant',
    content: result.summary,
    messageType: 'confirm_result',
    taskId: result.historyId || null,
    confirmationStatus: 'confirmed',
    meta: buildAssistantMessageMeta({ actionButton }),
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
  __testables: {
    buildAssistantMessageMeta,
    initializeAgentMessage,
    parseDeepSeekStreamChunk,
    resolveStreamingAutonomousMode,
    streamReplyFromMessages,
  },
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
