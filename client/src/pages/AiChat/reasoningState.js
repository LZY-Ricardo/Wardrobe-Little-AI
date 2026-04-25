export const REASONING_CHARS_PER_SECOND = 30

export const computeReasoningSeconds = (message, now = Date.now()) => {
  if (!message?.reasoningContent) return 0

  if (typeof message.reasoningDurationMs === 'number' && message.reasoningDurationMs > 0) {
    return Math.max(1, Math.round(message.reasoningDurationMs / 1000))
  }

  if (typeof message.reasoningStartTime === 'number' && message.reasoningStartTime > 0) {
    return Math.max(1, Math.round((now - message.reasoningStartTime) / 1000))
  }

  return Math.max(1, Math.round(String(message.reasoningContent).length / REASONING_CHARS_PER_SECOND))
}

export const formatReasoningSummary = (message, now = Date.now()) =>
  `思考了 ${computeReasoningSeconds(message, now)} 秒`

export const migrateExpandedMessageId = (prev, sourceId, targetId) => {
  if (!targetId) return prev
  const next = new Set(prev)
  if (next.has(sourceId)) {
    next.delete(sourceId)
    next.add(targetId)
  }
  return next
}
