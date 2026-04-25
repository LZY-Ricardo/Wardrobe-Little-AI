const { clampLen, trimToString } = require('../utils/validate')

const buildRecentMessagesWindow = (messages = [], limit = 12) => {
  const list = Array.isArray(messages) ? messages : []
  const safeLimit = Math.max(1, Number(limit) || 12)
  const omittedCount = Math.max(0, list.length - safeLimit)
  return {
    recentMessages: list.slice(-safeLimit),
    omittedCount,
  }
}

const buildSessionRestorePayload = ({
  session = null,
  messages = [],
  sessionMemory = null,
  preferenceSummary = null,
}) => ({
  session,
  recent_messages: Array.isArray(messages) ? messages : [],
  session_memory: sessionMemory,
  preference_summary: preferenceSummary,
})

const buildUnifiedMessagesForModel = ({
  systemPrompt = '',
  recentMessages = [],
  sessionMemory = null,
  preferenceSummary = null,
  userInput = '',
}) => {
  const messages = [{ role: 'system', content: systemPrompt }]
  if (preferenceSummary?.summary) {
    messages.push({
      role: 'system',
      content: `【长期偏好摘要】${preferenceSummary.summary}`,
    })
  }
  if (sessionMemory?.summary) {
    messages.push({
      role: 'system',
      content: `【会话摘要】${sessionMemory.summary}`,
    })
  }
  ;(Array.isArray(recentMessages) ? recentMessages : []).forEach((item) => {
    if (!item?.role || !item?.content) return
    messages.push({
      role: item.role,
      content: item.content,
    })
  })
  if (userInput) {
    messages.push({ role: 'user', content: String(userInput) })
  }
  return messages
}

const summarizeSessionMemoryFromMessages = (messages = []) => {
  const list = Array.isArray(messages) ? messages : []
  const contents = list
    .map((item) => String(item?.content || '').trim())
    .filter(Boolean)
    .slice(-6)

  return {
    summary: clampLen(contents.join('；'), 500),
    key_facts: contents.slice(0, 3),
    active_goals: [],
    pending_actions: [],
    last_summarized_message_id: list.length ? list[list.length - 1].id || null : null,
  }
}

const parseStructuredMemoryPayload = (raw, fallbackMessages = []) => {
  const fallback = summarizeSessionMemoryFromMessages(fallbackMessages)
  try {
    const parsed = typeof raw === 'string' ? JSON.parse(raw) : raw
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return fallback
    const summary = trimToString(parsed.summary)
    const keyFacts = Array.isArray(parsed.key_facts) ? parsed.key_facts.map((item) => trimToString(item)).filter(Boolean) : []
    const activeGoals = Array.isArray(parsed.active_goals) ? parsed.active_goals.map((item) => trimToString(item)).filter(Boolean) : []
    const pendingActions = Array.isArray(parsed.pending_actions) ? parsed.pending_actions.map((item) => trimToString(item)).filter(Boolean) : []
    if (!summary) return fallback
    return {
      summary: clampLen(summary, 500),
      key_facts: keyFacts,
      active_goals: activeGoals,
      pending_actions: pendingActions,
      last_summarized_message_id: fallback.last_summarized_message_id,
    }
  } catch {
    return fallback
  }
}

const tryParseStructuredMemoryPayload = (raw, fallbackMessages = []) => {
  const fallback = summarizeSessionMemoryFromMessages(fallbackMessages)
  try {
    const parsed = typeof raw === 'string' ? JSON.parse(raw) : raw
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
      return { ok: false, payload: fallback }
    }
    const summary = trimToString(parsed.summary)
    const keyFacts = Array.isArray(parsed.key_facts) ? parsed.key_facts.map((item) => trimToString(item)).filter(Boolean) : []
    const activeGoals = Array.isArray(parsed.active_goals) ? parsed.active_goals.map((item) => trimToString(item)).filter(Boolean) : []
    const pendingActions = Array.isArray(parsed.pending_actions) ? parsed.pending_actions.map((item) => trimToString(item)).filter(Boolean) : []
    if (!summary) {
      return { ok: false, payload: fallback }
    }
    return {
      ok: true,
      payload: {
        summary: clampLen(summary, 500),
        key_facts: keyFacts,
        active_goals: activeGoals,
        pending_actions: pendingActions,
        last_summarized_message_id: fallback.last_summarized_message_id,
      },
    }
  } catch {
    return { ok: false, payload: fallback }
  }
}

const MAX_TITLE_LEN = 16

const stripLeadingFiller = (s) => s.replace(/^(帮我|请|给我|能不能|你可以|我想|我想问|麻烦|麻烦你)[\s，。、]*/, '')

const deriveSessionTitle = (text = '') => {
  const input = trimToString(text)
  if (!input) return '新会话'
  const cleaned = stripLeadingFiller(input).replace(/\s+/g, ' ')
  return clampLen(cleaned, MAX_TITLE_LEN)
}

module.exports = {
  buildRecentMessagesWindow,
  buildSessionRestorePayload,
  deriveSessionTitle,
  buildUnifiedMessagesForModel,
  parseStructuredMemoryPayload,
  tryParseStructuredMemoryPayload,
  summarizeSessionMemoryFromMessages,
}
