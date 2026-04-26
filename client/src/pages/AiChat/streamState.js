export const createStreamPlaceholder = ({ imageCount = 0, streamMessageId = '' } = {}) => ({
  id: streamMessageId || `stream-${Date.now()}`,
  role: 'assistant',
  content: '',
  reasoningContent: '',
  messageType: 'chat',
  confirmationStatus: '',
  deliveryStatus: 'streaming',
  toolCalls: [],
  toolResultsSummary: [],
  toolPhase: imageCount > 0 ? '正在准备图片消息…' : '',
  reasoningStartTime: null,
  reasoningDurationMs: null,
  errorDetail: '',
  errorStage: '',
  errorStatus: null,
})

export const applyStreamContent = (message, {
  fullText = '',
  reasoningText = '',
  reasoningStartTime = null,
  reasoningDurationMs = null,
} = {}) => ({
  ...message,
  content: fullText,
  toolPhase: '',
  reasoningContent: reasoningText,
  reasoningStartTime,
  reasoningDurationMs,
})

export const applyToolStartedEvent = (message, event = {}) => {
  const nextToolCall = Array.isArray(event.meta?.toolCalls) && event.meta.toolCalls.length
    ? event.meta.toolCalls[0]
    : {
      name: event.tool || '',
      label: String(event.tool || '工具执行'),
      status: 'running',
      at: Date.now(),
    }

  return {
    ...message,
    toolPhase: event.message || '正在分析图片…',
    toolCalls: [
      ...(Array.isArray(message.toolCalls) ? message.toolCalls : []),
      nextToolCall,
    ],
  }
}

export const applyToolCompletedEvent = (message, event = {}) => {
  const completedMeta = Array.isArray(event.meta?.toolCalls) && event.meta.toolCalls.length
    ? event.meta.toolCalls[0]
    : null

  return {
    ...message,
    toolPhase: event.message || (event.ok ? '图片分析完成' : '图片分析失败'),
    toolCalls: (Array.isArray(message.toolCalls) ? message.toolCalls : []).map((toolCall, index, list) => {
      const shouldUpdate =
        toolCall?.name === (event.tool || '') &&
        index === list.map((item) => item?.name).lastIndexOf(event.tool || '')

      return shouldUpdate
        ? {
          ...toolCall,
          ...(completedMeta || {}),
          label: completedMeta?.label || toolCall.label || String(toolCall?.name || '工具执行'),
          status: completedMeta?.status || (event.ok ? 'success' : 'failed'),
        }
        : toolCall
    }),
    toolResultsSummary: event.summary
      ? [...(Array.isArray(message.toolResultsSummary) ? message.toolResultsSummary : []), String(event.summary)]
      : message.toolResultsSummary,
  }
}

export const applyStreamFailure = (message, {
  fullText = '',
  reasoningText = '',
  reasoningStartTime = null,
  reasoningDurationMs = null,
  deliveryStatus = 'failed',
  errorDetail = '',
  errorStage = '',
  errorStatus = null,
} = {}) => ({
  ...message,
  deliveryStatus,
  content: fullText,
  reasoningContent: reasoningText,
  reasoningStartTime,
  reasoningDurationMs,
  errorDetail: String(errorDetail || '').trim(),
  errorStage: String(errorStage || '').trim(),
  errorStatus: Number.isFinite(Number(errorStatus)) ? Number(errorStatus) : null,
})

export const finalizeOptimisticUserMessage = (messages = [], {
  optimisticMessageId = '',
  userMessagePersisted = false,
} = {}) => {
  const source = Array.isArray(messages) ? messages : []

  return source.flatMap((message) => {
    if (message.id !== optimisticMessageId) {
      return [message]
    }

    return userMessagePersisted
      ? [{ ...message, deliveryStatus: 'sent' }]
      : []
  })
}

export const applyStreamAbort = (messages = [], {
  optimisticMessageId = '',
  streamMessageId = '',
  fullText = '',
  reasoningText = '',
  reasoningStartTime = null,
  reasoningDurationMs = null,
  userMessagePersisted = false,
} = {}) => {
  const source = finalizeOptimisticUserMessage(messages, {
    optimisticMessageId,
    userMessagePersisted,
  })

  return source.flatMap((message) => {
    if (message.id !== streamMessageId) {
      return [message]
    }

    const existingContent = String(message.content || '')
    const existingReasoning = String(message.reasoningContent || '')
    const nextContent = String(fullText || existingContent)
    const nextReasoning = String(reasoningText || existingReasoning)
    const hasAssistantDraft = Boolean(nextContent || nextReasoning)

    if (!hasAssistantDraft) {
      return []
    }

    return [applyStreamFailure(message, {
      fullText: nextContent,
      reasoningText: nextReasoning,
      reasoningStartTime: reasoningStartTime ?? message.reasoningStartTime ?? null,
      reasoningDurationMs: reasoningDurationMs ?? message.reasoningDurationMs ?? null,
      deliveryStatus: 'cancelled',
    })]
  })
}
