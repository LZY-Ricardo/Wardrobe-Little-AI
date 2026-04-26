const { clampLen, trimToString } = require('../utils/validate')
const {
  buildNavigationAction,
  replaceKnownRoutesWithPageNames,
} = require('../agent/tools/runtime/uiMetadataResolver')
const {
  buildAgentContextState,
  resolveFocusFromLatestTask,
} = require('../agent/context/agentContextProtocol')

const resolveSelectedCloth = (latestTask = null) => {
  const focus = resolveFocusFromLatestTask(latestTask)
  if (focus?.type === 'cloth' && Number.parseInt(focus.entity?.cloth_id, 10) > 0) return focus.entity
  if (latestTask?.result && Number.parseInt(latestTask.result?.cloth_id, 10) > 0) return latestTask.result
  return null
}

const resolveSelectedSuit = (latestTask = null) => {
  const focus = resolveFocusFromLatestTask(latestTask)
  if (focus?.type === 'suit' && Number.parseInt(focus.entity?.suit_id, 10) > 0) return focus.entity
  return latestTask?.result?.suit && Number.parseInt(latestTask.result.suit?.suit_id, 10) > 0
    ? latestTask.result.suit
    : null
}

const resolveOutfitLog = (latestTask = null) => {
  const focus = resolveFocusFromLatestTask(latestTask)
  if (focus?.type === 'outfitLog' && Number.parseInt(focus.entity?.id, 10) > 0) return focus.entity
  if (latestTask?.result && Number.parseInt(latestTask.result?.id, 10) > 0) return latestTask.result
  return null
}

const buildAssistantActionButton = ({ intent = '', reply = '', latestTask = null } = {}) => {
  if (intent !== 'clothing') return null

  const normalized = `${String(reply || '')}`.replace(/\s+/g, '')
  const taskType = String(latestTask?.taskType || '').trim()
  const selectedCloth = resolveSelectedCloth(latestTask)
  const selectedSuit = resolveSelectedSuit(latestTask)
  const outfitLog = resolveOutfitLog(latestTask)

  if (taskType === 'create_cloth' || taskType === 'update_cloth_fields' || taskType === 'toggle_favorite') {
    if (!selectedCloth) return null
    return buildNavigationAction({
      pageKey: 'editCloth',
      label: '打开编辑衣物',
      state: buildAgentContextState({
        focus: {
          type: 'cloth',
          entity: selectedCloth,
        },
      }),
      reason: '查看或调整这件衣物的详细信息',
    })
  }

  if (taskType === 'recommendation' || taskType === 'save_suit' || taskType === 'create_outfit_log') {
    return buildNavigationAction({
      pageKey: taskType === 'save_suit' ? 'suitCollection' : taskType === 'create_outfit_log' ? 'outfitLogs' : 'recommend',
      label: taskType === 'save_suit' ? '打开套装列表' : taskType === 'create_outfit_log' ? '打开穿搭记录' : '打开场景推荐',
      state: taskType === 'save_suit' && selectedSuit
        ? buildAgentContextState({ focus: { type: 'suit', entity: selectedSuit } })
        : taskType === 'create_outfit_log' && outfitLog
          ? buildAgentContextState({ focus: { type: 'outfitLog', entity: outfitLog } })
          : null,
    })
  }

  if (taskType === 'suit_detail') {
    return buildNavigationAction({
      pageKey: 'suitCollection',
      label: '打开套装列表',
      state: selectedSuit ? buildAgentContextState({ focus: { type: 'suit', entity: selectedSuit } }) : null,
    })
  }

  if (taskType === 'outfit_log_detail') {
    return buildNavigationAction({
      pageKey: 'outfitLogs',
      label: '打开穿搭记录',
      state: outfitLog ? buildAgentContextState({ focus: { type: 'outfitLog', entity: outfitLog } }) : null,
    })
  }

  if (taskType === 'delete_cloth') {
    return buildNavigationAction({ pageKey: 'wardrobe', label: '打开虚拟衣柜' })
  }

  if (taskType === 'delete_suit') {
    return buildNavigationAction({
      pageKey: 'suitCollection',
      label: '打开套装列表',
      state: selectedSuit ? buildAgentContextState({ focus: { type: 'suit', entity: selectedSuit } }) : null,
    })
  }

  if (taskType === 'delete_outfit_log') {
    return buildNavigationAction({
      pageKey: 'outfitLogs',
      label: '打开穿搭记录',
      state: outfitLog ? buildAgentContextState({ focus: { type: 'outfitLog', entity: outfitLog } }) : null,
    })
  }

  if (taskType === 'profile') {
    return buildNavigationAction({
      pageKey: 'profileInsights',
      label: '打开偏好洞察',
    })
  }

  if (taskType === 'analytics') {
    return buildNavigationAction({
      pageKey: 'wardrobeAnalytics',
      label: '打开衣橱统计',
    })
  }

  if (taskType === 'update_user_sex') {
    return buildNavigationAction({
      pageKey: 'person',
      label: '打开个人中心',
      reason: '继续完善个人信息或模特设置',
    })
  }

  if (taskType === 'update_confirmation_preferences') {
    return buildNavigationAction({
      pageKey: 'profileInsights',
      label: '打开偏好洞察',
      reason: '查看或继续调整低风险操作免确认设置',
    })
  }

  if (
    selectedCloth &&
    /(修改|编辑|补充|完善|品牌|季节|场合|材质|颜色|类型|名称)/.test(normalized)
  ) {
    return buildNavigationAction({
      pageKey: 'editCloth',
      label: '打开编辑衣物',
      state: buildAgentContextState({
        focus: {
          type: 'cloth',
          entity: selectedCloth,
        },
      }),
      reason: '继续补充品牌、季节、材质等信息',
    })
  }

  if (/(搭配|怎么搭|推荐|场景)/.test(normalized)) {
    return buildNavigationAction({ pageKey: 'recommend', label: '打开场景推荐' })
  }

  if (/(上传|添加|录入|存入衣橱)/.test(normalized)) {
    return buildNavigationAction({ pageKey: 'addCloth', label: '打开添加衣物' })
  }

  if (/(画像|偏好|风格总结|风格分析)/.test(normalized)) {
    return buildNavigationAction({ pageKey: 'profileInsights', label: '打开偏好洞察' })
  }

  if (/(统计|分析|采纳率|趋势)/.test(normalized)) {
    return buildNavigationAction({ pageKey: 'wardrobeAnalytics', label: '打开衣橱统计' })
  }

  if (/(天气|今日建议|今天怎么穿|穿什么)/.test(normalized)) {
    return buildNavigationAction({ pageKey: 'home', label: '打开首页' })
  }

  return null
}

const sanitizeAssistantReply = (text = '', options = {}) => {
  const input = String(text || '')
  if (!input) return ''

  let cleaned = input
    .replace(/(?:【|\[)\s*TOOL_RESULT[^\]\n】]*(?:】|\])[\s\S]*?(?:【|\[)\s*\/TOOL_RESULT\s*(?:】|\])/gi, '')
    .replace(/\n{3,}/g, '\n\n')
    .trim()

  if (options.intent === 'clothing') {
    cleaned = cleaned
      .replace(
        /如果你需要修改这[件双套条个][^。！？\n]*?，可以前往\s*\/[a-z-]+\s*页面[^。！？\n]*[。！？]?/gi,
        '你的衣物小助手可以直接帮你补充或修改这些信息。你也可以点击下方按钮自行操作。'
      )
      .replace(
        /你可以前往\s*\/[a-z-]+\s*页面[^。！？\n]*[。！？]?/gi,
        '你的衣物小助手也可以直接帮你代办。你也可以点击下方按钮自行操作。'
      )
      .replace(
        /前往\s*\/[a-z-]+\s*页面[^。！？\n]*[。！？]?/gi,
        '你的衣物小助手也可以直接帮你代办。你也可以点击下方按钮自行操作。'
      )
      .replace(/\n{3,}/g, '\n\n')
      .trim()
  }

  cleaned = replaceKnownRoutesWithPageNames(cleaned)
    .replace(/[（(]\s*路由[:：]\s*([^）)]+)\s*[）)]/gi, (_, pageName) => `（页面：${replaceKnownRoutesWithPageNames(pageName)}）`)
    .replace(/`([^`]+)`/g, (_, codeText) => `\`${replaceKnownRoutesWithPageNames(codeText)}\``)
    .replace(/\n{3,}/g, '\n\n')
    .trim()

  if (/^(?:\{[\s\S]*\}|\[[\s\S]*\])$/.test(cleaned)) {
    cleaned = ''
  }

  return cleaned
}

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
    const entry = { role: item.role, content: item.content }
    if (item.role === 'assistant' && item.meta?.reasoningContent) {
      entry.reasoning_content = item.meta.reasoningContent
    }
    messages.push(entry)
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
  buildAssistantActionButton,
  deriveSessionTitle,
  buildUnifiedMessagesForModel,
  parseStructuredMemoryPayload,
  sanitizeAssistantReply,
  tryParseStructuredMemoryPayload,
  summarizeSessionMemoryFromMessages,
}
