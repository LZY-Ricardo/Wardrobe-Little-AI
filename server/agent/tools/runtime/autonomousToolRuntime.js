const { createChatCompletion } = require('../../../utils/deepseekClient')
const { normalizeLlmError } = require('../../../utils/llmError')
const { listToolsForLlm, getToolByName } = require('../registry')
const { buildToolContext } = require('../policies/contextPolicy')
const { buildLlmToolDefinitions } = require('./toolDefinitionBuilder')
const { routeToolExecution } = require('./toolExecutionRouter')
const {
  buildToolCompletedEventMeta,
  mergeToolMeta,
} = require('./toolEventAdapter')
const { createRecommendationHistory } = require('../../../controllers/recommendations')
const {
  resolveDraftFromLatestTask,
  resolveFocusFromLatestTask,
  resolveInsightFromLatestTask,
} = require('../../context/agentContextProtocol')
const { summarizeRecommendationResultText } = require('../../../controllers/agent.helpers')
const { presentToolResult } = require('./resultPresenterResolver')
const { IMAGE_TOOL_NAME, executeAnalyzeImageTool } = require('../handlers/vision/analyzeImageTool')
const SHOW_CONTEXT_IMAGES_TOOL_NAME = 'show_context_images'
const GENERATE_OUTFIT_PREVIEW_TOOL_NAME = 'generate_outfit_preview'
const {
  buildContentEvent,
  buildReasoningEvent,
  buildToolCallCompletedEvent,
  buildToolCallStartedEvent,
} = require('../../../utils/unifiedAgentSseEvents')

const CHAT_ERROR_MESSAGES = {
  unavailable: '暂时无法对话',
  config: '对话服务异常',
  quota: '对话额度不足',
  rateLimit: '请稍后再试',
  failed: '发送失败',
}

const MAX_AUTONOMOUS_TOOL_ROUNDS = Number(process.env.UNIFIED_AGENT_MAX_TOOL_ROUNDS || 4)
const MAX_AUTONOMOUS_DURATION_MS = Number(process.env.UNIFIED_AGENT_MAX_AUTONOMOUS_DURATION_MS || 120000)
const TOOL_EXECUTION_TIMEOUT_MS = Number(process.env.UNIFIED_AGENT_TOOL_TIMEOUT_MS || 30000)
const IMAGE_TOOL_EXECUTION_TIMEOUT_MS = Number(
  process.env.UNIFIED_AGENT_IMAGE_TOOL_TIMEOUT_MS ||
    Math.max(TOOL_EXECUTION_TIMEOUT_MS, Number(process.env.SILICONFLOW_TIMEOUT_MS || 30000) + 5000)
)

const AUTONOMOUS_TOOL_PROMPT = `你是 Clothora 的统一业务代理。
你可以自主决定是否调用工具，以及调用哪个工具。

规则：
1. 只在需要真实用户数据、真实业务状态、图片分析或业务执行时调用工具。
2. 读取类工具可以直接调用；写入类工具由系统接管确认，你不要声称“已经完成落库”，除非工具结果明确显示已完成。
3. 如果用户提供了图片且任务和图片内容有关，优先考虑调用 analyze_image。
4. 如果 analyze_image 返回了多件可独立保存的衣物，且用户表达“全部保存/直接存入衣橱/都帮我录入”之类意图，优先调用 create_clothes_batch；若只有一件再调用 create_cloth。
5. 当用户提到“这件 / 这双 / 当前 / 刚刚那套 / 这条记录”等上下文对象时，要优先利用会话上下文。
6. 当用户明确要求“展示图片 / 发图 / 给我看看图 / 展示刚刚那件的图片”且当前上下文已有衣物、套装、穿搭记录或推荐结果时，优先调用 show_context_images，不要再回答自己无法展示图片。
7. 当用户明确要求展示多件指定衣物图片，且上下文里已经有对应衣物编号列表时，优先调用 show_clothes_images，并传入准确的 cloth_ids。
8. 当用户要求“根据当前已选上衣和下衣生成预览图 / 真人试穿图 / 搭配预览图”时，先调用 show_context_images 展示当前单品，再调用 generate_outfit_preview 生成预览图。
9. 当用户在要“推荐穿搭 / 今日穿什么 / 某场景怎么穿 / 晨跑穿什么”这类具体搭配建议时，必须先调用 generate_scene_suits 基于真实衣橱生成结果；不要只根据天气、画像或统计直接脑补具体衣物。
10. 不要编造任何工具未返回的数据。
11. 不要向用户展示 tool_calls、函数参数、原始 JSON、TOOL_RESULT 或其他内部结构。
12. 如果不需要工具，直接给出最终答复。`

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

const summarizeMessageForDebug = (message = {}) => ({
  role: String(message?.role || '').trim(),
  hasContent: Boolean(extractAssistantText(message)),
  hasReasoning: Boolean(extractReasoningContent(message)),
  toolCallCount: Array.isArray(message?.tool_calls) ? message.tool_calls.length : 0,
  toolCallNames: Array.isArray(message?.tool_calls)
    ? message.tool_calls.map((item) => item?.function?.name).filter(Boolean).slice(0, 5)
    : [],
  toolCallId: message?.tool_call_id || '',
  contentPreview: extractAssistantText(message).slice(0, 120),
})

const buildAssistantTurnRequestSummary = ({ messages = [], tools = [] } = {}) => ({
  messageCount: Array.isArray(messages) ? messages.length : 0,
  toolCount: Array.isArray(tools) ? tools.length : 0,
  lastMessages: (Array.isArray(messages) ? messages : []).slice(-4).map(summarizeMessageForDebug),
})

const extractReasoningContent = (message = {}) => {
  const rc = message?.reasoning_content
  return typeof rc === 'string' ? rc : ''
}

const createEmptyStreamedAssistantMessage = () => ({
  role: 'assistant',
  content: '',
  reasoning_content: '',
  tool_calls: [],
})

const mergeMediaAttachments = (...groups) => {
  const seen = new Set()
  const merged = []
  groups
    .flat()
    .filter(Boolean)
    .forEach((item) => {
      const key = [
        item?.type || '',
        item?.variant || '',
        item?.objectType || '',
        item?.objectId || '',
        item?.dataUrl || '',
        item?.name || '',
        item?.content ? JSON.stringify(item.content) : '',
      ].join(':')
      const hasContent = Boolean(item?.dataUrl || item?.content)
      if (!hasContent || seen.has(key)) return
      seen.add(key)
      merged.push(item)
    })
  return merged
}

const createMediaToolConversationEntry = (toolCallId, mediaReply = {}) => ({
  role: 'tool',
  tool_call_id: toolCallId,
  content: normalizeToolResultContent({
    summary: mediaReply.reply || '',
    attachmentCount: Array.isArray(mediaReply.attachments) ? mediaReply.attachments.length : 0,
  }),
})

const parseDeepSeekStreamingPayload = (line) => {
  if (!line || !line.startsWith('data: ')) return null
  const payload = line.slice(6).trim()
  if (!payload) return null
  if (payload === '[DONE]') return { done: true }
  try {
    const parsed = JSON.parse(payload)
    return parsed?.choices?.[0]?.delta || null
  } catch {
    return null
  }
}

const ensureToolCallAtIndex = (message, index) => {
  if (!Array.isArray(message.tool_calls)) {
    message.tool_calls = []
  }
  if (!message.tool_calls[index]) {
    message.tool_calls[index] = {
      id: '',
      type: 'function',
      function: {
        name: '',
        arguments: '',
      },
    }
  }
  return message.tool_calls[index]
}

const mergeToolCallDelta = (message, deltaToolCalls = []) => {
  for (const item of Array.isArray(deltaToolCalls) ? deltaToolCalls : []) {
    const index = Number.isInteger(item?.index) ? item.index : 0
    const target = ensureToolCallAtIndex(message, index)
    if (item?.id) target.id = item.id
    if (item?.type) target.type = item.type
    if (item?.function?.name) {
      target.function.name = `${target.function.name || ''}${item.function.name}`
    }
    if (item?.function?.arguments) {
      target.function.arguments = `${target.function.arguments || ''}${item.function.arguments}`
    }
  }
}

const streamAssistantTurnFromCompletion = async ({
  messages,
  tools = [],
  onReasoning,
  onContent,
  isClientGone = () => false,
  createChatCompletionImpl = createChatCompletion,
}) => {
  let streamResponse
  try {
    streamResponse = await createChatCompletionImpl(
      {
        model: process.env.DEEPSEEK_CHAT_MODEL || 'deepseek-chat',
        messages,
        tools,
        tool_choice: 'auto',
        temperature: 0.2,
        stream: true,
      },
      { stream: true, timeout: Number(process.env.DEEPSEEK_TIMEOUT_MS) || 120000 }
    )
  } catch (error) {
    const normalized = normalizeLlmError(error, 'DeepSeek 工具决策服务', CHAT_ERROR_MESSAGES)
    normalized.requestSummary = buildAssistantTurnRequestSummary({ messages, tools })
    throw normalized
  }

  const stream = streamResponse.data
  const assistantMessage = createEmptyStreamedAssistantMessage()
  let buffer = ''

  for await (const chunk of stream) {
    if (isClientGone()) return assistantMessage
    buffer += chunk.toString()
    const frames = buffer.split('\n')
    buffer = frames.pop() || ''
    for (const frame of frames) {
      const delta = parseDeepSeekStreamingPayload(frame.trim())
      if (!delta) continue
      if (delta.done) return assistantMessage
      if (typeof delta.reasoning_content === 'string' && delta.reasoning_content) {
        assistantMessage.reasoning_content += delta.reasoning_content
        onReasoning?.(delta.reasoning_content)
      }
      if (typeof delta.content === 'string' && delta.content) {
        assistantMessage.content += delta.content
        onContent?.(delta.content)
      }
      if (Array.isArray(delta.tool_calls) && delta.tool_calls.length) {
        mergeToolCallDelta(assistantMessage, delta.tool_calls)
      }
    }
  }

  return assistantMessage
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

const normalizeToolResultContent = (value) => {
  try {
    return JSON.stringify(value)
  } catch {
    return JSON.stringify({ error: 'TOOL_RESULT_SERIALIZE_FAILED' })
  }
}

const createTimeoutErrorResult = (toolName, timeoutMs) => ({
  error: `TOOL_TIMEOUT:${toolName}:${timeoutMs}`,
  message: `工具执行超时（${toolName}，${timeoutMs}ms）`,
  summary: `工具执行超时（${toolName}）`,
})

const resolveToolExecutionTimeoutMs = (toolName, deps = {}) => {
  const explicitTimeout = Number(deps.toolExecutionTimeoutMs)
  if (Number.isFinite(explicitTimeout) && explicitTimeout > 0) return explicitTimeout
  return toolName === IMAGE_TOOL_NAME ? IMAGE_TOOL_EXECUTION_TIMEOUT_MS : TOOL_EXECUTION_TIMEOUT_MS
}

const runWithTimeout = async (factory, timeoutMs, onTimeout) => {
  if (!(timeoutMs > 0)) {
    return factory()
  }

  let timer = null
  try {
    return await Promise.race([
      Promise.resolve().then(factory),
      new Promise((resolve) => {
        timer = setTimeout(() => resolve(onTimeout()), timeoutMs)
      }),
    ])
  } finally {
    if (timer) clearTimeout(timer)
  }
}

const buildAutonomousRuntimeToolContext = ({
  userId,
  intent,
  multimodal,
  latestTask,
  preferenceSummary,
  clientContext,
  sessionMemory,
} = {}) =>
  buildToolContext({
    userId,
    intent,
    multimodal,
    latestTask,
    profile: preferenceSummary,
    clientContext,
    preferenceSummary,
    sessionMemory,
  })

const buildAutonomousToolDefinitions = (toolContext = {}) => {
  const attachmentCount = Array.isArray(toolContext?.multimodal?.attachments)
    ? toolContext.multimodal.attachments.length
    : 0

  return buildLlmToolDefinitions(listToolsForLlm(toolContext)).map((definition) => {
    if (definition?.function?.name !== IMAGE_TOOL_NAME) return definition

    return {
      ...definition,
      function: {
        ...definition.function,
        description: attachmentCount > 1
          ? `分析用户消息中的某张图片（共 ${attachmentCount} 张），返回适用于穿搭问答的结构化结果`
          : definition.function.description,
        parameters: {
          ...(definition.function.parameters || {}),
          properties: {
            ...(definition.function.parameters?.properties || {}),
            attachmentIndex: {
              ...(definition.function.parameters?.properties?.attachmentIndex || {}),
              maximum: Math.max(0, attachmentCount - 1),
              description: attachmentCount > 1
                ? `要分析的图片索引（0 ~ ${attachmentCount - 1}，共 ${attachmentCount} 张）`
                : '图片索引，固定为 0',
            },
          },
        },
      },
    }
  })
}

const completeAutonomousToolResult = ({ emit, tool, toolName, result, fallbackSummary = '' } = {}) => {
  const ok = !result?.error
  const summary = ok
    ? presentToolResult({
        tool,
        result,
        fallbackSummary,
      })
    : String(result?.summary || result?.message || result?.error || fallbackSummary || toolName || '工具执行失败').trim()
  emit?.(buildToolCallCompletedEvent({
    toolName,
    ok,
    summary,
    message: summary,
  }))
  return {
    kind: 'tool_result',
    toolName,
    result,
    content: normalizeToolResultContent(result),
    meta: buildToolCompletedEventMeta({
      toolName,
      ok,
      summary,
    }),
  }
}

const buildContextTaskFromToolResult = ({ toolName = '', result = null, input = '' } = {}) => {
  if (!result || typeof result !== 'object' || result.error) return null

  const taskSummary = String(input || '').trim()

  if (toolName === 'list_clothes') {
    return {
      taskType: 'closet_query',
      taskSummary,
      summary: presentToolResult({
        tool: { name: toolName, resultPresenter: 'list_clothes' },
        result,
        fallbackSummary: '查询到衣物列表',
      }),
      status: 'success',
      requiresConfirmation: false,
      relatedObjectType: 'clothes',
      result,
    }
  }

  if (toolName === 'get_cloth_detail' && Number.parseInt(result?.cloth_id, 10) > 0) {
    return {
      taskType: 'cloth_detail',
      taskSummary,
      summary: presentToolResult({
        tool: { name: toolName, resultPresenter: 'get_cloth_detail' },
        result,
        fallbackSummary: '已读取衣物详情',
      }),
      status: 'success',
      requiresConfirmation: false,
      relatedObjectType: 'cloth',
      relatedObjectId: result.cloth_id,
      result: { selectedCloth: result },
    }
  }

  if (toolName === 'get_suit_detail' && Number.parseInt(result?.suit_id, 10) > 0) {
    return {
      taskType: 'suit_detail',
      taskSummary,
      summary: presentToolResult({
        tool: { name: toolName, resultPresenter: 'get_suit_detail' },
        result,
        fallbackSummary: '已读取套装详情',
      }),
      status: 'success',
      requiresConfirmation: false,
      relatedObjectType: 'suit',
      relatedObjectId: result.suit_id,
      result: { selectedSuit: result },
    }
  }

  if (toolName === 'get_outfit_log_detail' && Number.parseInt(result?.id, 10) > 0) {
    return {
      taskType: 'outfit_log_detail',
      taskSummary,
      summary: presentToolResult({
        tool: { name: toolName, resultPresenter: 'get_outfit_log_detail' },
        result,
        fallbackSummary: '已读取穿搭记录详情',
      }),
      status: 'success',
      requiresConfirmation: false,
      relatedObjectType: 'outfit_log',
      relatedObjectId: result.id,
      result: { selectedOutfitLog: result },
    }
  }

  return null
}

const completeAutonomousMediaResult = ({ emit, toolName, result } = {}) => {
  const summary = String(result?.summary || '已准备当前图片').trim() || '已准备当前图片'
  emit?.(buildToolCallCompletedEvent({
    toolName,
    ok: true,
    summary,
    message: summary,
  }))
  return {
    kind: 'media_reply',
    reply: summary,
    attachments: Array.isArray(result?.attachments) ? result.attachments : [],
    meta: buildToolCompletedEventMeta({
      toolName,
      ok: true,
      summary,
    }),
  }
}

const completeAutonomousTaskResult = ({ emit, toolName, taskResult, summary } = {}) => {
  const normalizedSummary = String(summary || taskResult?.summary || '已完成任务').trim() || '已完成任务'
  emit?.(buildToolCallCompletedEvent({
    toolName,
    ok: true,
    summary: normalizedSummary,
    message: normalizedSummary,
  }))
  return {
    kind: 'task',
    taskResult,
    meta: buildToolCompletedEventMeta({
      toolName,
      ok: true,
      summary: normalizedSummary,
    }),
  }
}

const buildRecommendationTaskResult = async ({
  userId,
  input = '',
  args = {},
  result = {},
  deps = {},
} = {}) => {
  const suits = Array.isArray(result?.suits) ? result.suits : []
  const scene = String(args?.scene || result?.scene || '').trim() || '通勤'
  let recommendationHistoryId = Number.parseInt(result?.recommendationHistoryId, 10) || null

  if (!recommendationHistoryId && suits.length) {
    const savedRecommendation = await (deps.createRecommendationHistory || createRecommendationHistory)(userId, {
      recommendationType: 'scene',
      scene,
      triggerSource: 'agent',
      suits,
    })
    recommendationHistoryId = savedRecommendation?.id || null
  }

  return {
    taskType: 'recommendation',
    taskSummary: String(input || '').trim(),
    summary: summarizeRecommendationResultText({ suits }),
    status: 'success',
    requiresConfirmation: false,
    relatedObjectType: 'recommendation',
    relatedObjectId: recommendationHistoryId,
    result: {
      ...result,
      scene,
      recommendationHistoryId,
    },
  }
}

const buildReplyFallbackAfterToolUse = ({
  input = '',
  latestTask = null,
  mergedToolMeta = null,
} = {}) => {
  const summaries = Array.isArray(mergedToolMeta?.toolResultsSummary) ? mergedToolMeta.toolResultsSummary.filter(Boolean) : []
  const lastSummary = String(summaries[summaries.length - 1] || '').trim()
  const normalizedInput = String(input || '').replace(/\s+/g, '')
  const deleteIntent = /(删除|删掉|移除)/.test(normalizedInput)

  const focus = resolveFocusFromLatestTask(latestTask)
  const selectedCloth = focus?.type === 'cloth' ? focus.entity : latestTask?.result?.selectedCloth
  if (deleteIntent && selectedCloth?.cloth_id) {
    const clothName = String(selectedCloth?.name || '这件衣物').trim() || '这件衣物'
    return `${lastSummary || `已读取“${clothName}”详情`}。若要继续删除这件衣物，我会先发起待确认操作。`
  }

  const selectedSuit = focus?.type === 'suit' ? focus.entity : latestTask?.result?.selectedSuit
  if (deleteIntent && selectedSuit?.suit_id) {
    const suitName = String(selectedSuit?.name || '这套搭配').trim() || '这套搭配'
    return `${lastSummary || `已读取套装“${suitName}”详情`}。若要继续删除这套搭配，我会先发起待确认操作。`
  }

  const selectedOutfitLog = focus?.type === 'outfitLog' ? focus.entity : latestTask?.result?.selectedOutfitLog
  if (deleteIntent && selectedOutfitLog?.id) {
    const logName = String(selectedOutfitLog?.log_date || '这条穿搭记录').trim() || '这条穿搭记录'
    return `${lastSummary || `已读取 ${logName} 的穿搭记录`}。若要继续删除这条穿搭记录，我会先发起待确认操作。`
  }

  if (lastSummary) {
    return `${lastSummary}。你可以继续告诉我下一步要执行什么。`
  }

  return '我已经完成上一步查询。你可以继续告诉我下一步要执行什么。'
}

const buildLatestTaskContextMessage = (latestTask = null) => {
  if (!latestTask || typeof latestTask !== 'object') return ''

  const focus = resolveFocusFromLatestTask(latestTask)
  const insight = resolveInsightFromLatestTask(latestTask)
  const draft = resolveDraftFromLatestTask(latestTask)

  const selectedCloth = focus?.type === 'cloth' ? focus.entity : latestTask?.result?.selectedCloth
  if (selectedCloth?.cloth_id) {
    return `【当前衣物上下文】${JSON.stringify({
      cloth_id: selectedCloth.cloth_id,
      name: selectedCloth.name || '',
      type: selectedCloth.type || '',
      color: selectedCloth.color || '',
      style: selectedCloth.style || '',
      season: selectedCloth.season || '',
      material: selectedCloth.material || '',
      favorite: selectedCloth.favorite ?? null,
    })}`
  }

  const selectedSuit = focus?.type === 'suit' ? focus.entity : latestTask?.result?.selectedSuit
  if (selectedSuit?.suit_id) {
    return `【当前套装上下文】${JSON.stringify({
      suit_id: selectedSuit.suit_id,
      name: selectedSuit.name || '',
      scene: selectedSuit.scene || '',
      item_count: selectedSuit.item_count || 0,
    })}`
  }

  const selectedOutfitLog = focus?.type === 'outfitLog' ? focus.entity : latestTask?.result?.selectedOutfitLog
  if (selectedOutfitLog?.id) {
    return `【当前穿搭记录上下文】${JSON.stringify({
      id: selectedOutfitLog.id,
      log_date: selectedOutfitLog.log_date || '',
      scene: selectedOutfitLog.scene || '',
    })}`
  }

  if (String(latestTask?.taskType || '').trim() === 'closet_query' && Array.isArray(latestTask?.result?.items)) {
    return `【当前衣橱筛选结果上下文】${JSON.stringify({
      total: Number(latestTask?.result?.total || 0),
      items: latestTask.result.items.slice(0, 10).map((item) => ({
        cloth_id: item?.cloth_id || null,
        name: item?.name || '',
        type: item?.type || '',
        color: item?.color || '',
        style: item?.style || '',
        hasImage: Boolean(item?.hasImage || item?.image),
      })),
    })}`
  }

  const latestWeather = insight?.type === 'weather' ? insight.entity : latestTask?.result?.latestWeather
  if (latestWeather?.city || latestWeather?.temp || latestWeather?.text) {
    return `【当前天气上下文】${JSON.stringify({
      city: latestWeather.city || '',
      temp: latestWeather.temp || '',
      text: latestWeather.text || '',
      adviceText: latestWeather.adviceText || '',
      adviceTags: Array.isArray(latestWeather.adviceTags) ? latestWeather.adviceTags : [],
    })}`
  }

  const styleProfile = insight?.type === 'styleProfile' ? insight.entity : latestTask?.result?.styleProfile
  if (styleProfile?.city || styleProfile?.style || styleProfile?.scenes || styleProfile?.topSize) {
    return `【当前穿搭档案上下文】${JSON.stringify({
      city: styleProfile.city || '',
      heightCm: styleProfile.heightCm || '',
      weightKg: styleProfile.weightKg || '',
      topSize: styleProfile.topSize || '',
      bottomSize: styleProfile.bottomSize || '',
      shoeSize: styleProfile.shoeSize || '',
      style: styleProfile.style || '',
      colors: styleProfile.colors || '',
      scenes: styleProfile.scenes || '',
      sex: styleProfile.sex || '',
      hasCharacterModel: Boolean(styleProfile.hasCharacterModel),
      clothesCount: styleProfile.clothesCount || 0,
      favoriteCount: styleProfile.favoriteCount || 0,
    })}`
  }

  const latestAnalytics = insight?.type === 'analytics' ? insight.entity : latestTask?.result?.latestAnalytics
  if (latestAnalytics?.totalClothes || latestAnalytics?.recommendationSummary) {
    return `【当前衣橱分析上下文】${JSON.stringify({
      totalClothes: latestAnalytics.totalClothes || 0,
      recommendationSummary: latestAnalytics.recommendationSummary || null,
      typeDistribution: Array.isArray(latestAnalytics.typeDistribution)
        ? latestAnalytics.typeDistribution.slice(0, 6)
        : [],
      styleDistribution: Array.isArray(latestAnalytics.styleDistribution)
        ? latestAnalytics.styleDistribution.slice(0, 6)
        : [],
      colorDistribution: Array.isArray(latestAnalytics.colorDistribution)
        ? latestAnalytics.colorDistribution.slice(0, 6)
        : [],
      sceneDistribution: Array.isArray(latestAnalytics.sceneDistribution)
        ? latestAnalytics.sceneDistribution.slice(0, 6)
        : [],
    })}`
  }

  const manualSuitDraft = draft?.type === 'suit' ? draft.entity : latestTask?.result?.manualSuitDraft
  if (manualSuitDraft && Array.isArray(manualSuitDraft.items) && manualSuitDraft.items.length) {
    return `【当前搭配草稿上下文】${JSON.stringify({
      name: manualSuitDraft.name || '',
      scene: manualSuitDraft.scene || '',
      description: manualSuitDraft.description || '',
      source: manualSuitDraft.source || '',
      items: manualSuitDraft.items,
    })}`
  }

  const manualOutfitLogDraft = draft?.type === 'outfitLog' ? draft.entity : latestTask?.result?.manualOutfitLogDraft
  if (manualOutfitLogDraft && Array.isArray(manualOutfitLogDraft.items) && manualOutfitLogDraft.items.length) {
    return `【当前穿搭记录草稿上下文】${JSON.stringify({
      logDate: manualOutfitLogDraft.logDate || '',
      scene: manualOutfitLogDraft.scene || '',
      weatherSummary: manualOutfitLogDraft.weatherSummary || '',
      source: manualOutfitLogDraft.source || '',
      note: manualOutfitLogDraft.note || '',
      items: manualOutfitLogDraft.items,
    })}`
  }

  const recommendationHistory = focus?.type === 'recommendationHistory'
    ? focus.entity
    : latestTask?.recommendationHistory || latestTask?.result?.recommendationHistory
  if (recommendationHistory?.id) {
    return `【当前推荐历史上下文】${JSON.stringify({
      id: recommendationHistory.id,
      scene: recommendationHistory.scene || '',
      adopted: recommendationHistory.adopted ?? null,
      saved_as_suit: recommendationHistory.saved_as_suit ?? null,
      saved_as_outfit_log: recommendationHistory.saved_as_outfit_log ?? null,
      trigger_source: recommendationHistory.trigger_source || '',
      create_time: recommendationHistory.create_time || '',
      result_summary: recommendationHistory.result_summary || null,
      feedback_result: recommendationHistory.feedback_result || '',
      feedback_reason_tags: Array.isArray(recommendationHistory.feedback_reason_tags)
        ? recommendationHistory.feedback_reason_tags
        : [],
      feedback_note: recommendationHistory.feedback_note || '',
    })}`
  }

  if (latestTask?.taskType === 'recommendation' && Array.isArray(latestTask?.result?.suits)) {
    return `【当前推荐结果上下文】${JSON.stringify({
      taskType: 'recommendation',
      recommendationHistoryId: latestTask?.result?.recommendationHistoryId || null,
      suits: latestTask.result.suits.map((suit, index) => ({
        suitIndex: index,
        scene: suit?.scene || '',
        reason: suit?.reason || suit?.description || '',
        items: Array.isArray(suit?.items)
          ? suit.items.map((item) => ({
              cloth_id: item?.cloth_id || null,
              name: item?.name || '',
              type: item?.type || '',
              color: item?.color || '',
            }))
          : [],
      })),
    })}`
  }

  return ''
}

const buildClientContextMessage = (clientContext = null) => {
  if (!clientContext || typeof clientContext !== 'object') return ''

  const profile = clientContext.profile && typeof clientContext.profile === 'object'
    ? clientContext.profile
    : null
  const geo = clientContext.geo && typeof clientContext.geo === 'object'
    ? clientContext.geo
    : null

  const hasProfileContext = Boolean(
    profile && (
      String(profile.city || '').trim() ||
      String(profile.heightCm || '').trim() ||
      String(profile.weightKg || '').trim() ||
      String(profile.topSize || '').trim() ||
      String(profile.bottomSize || '').trim() ||
      String(profile.shoeSize || '').trim() ||
      String(profile.style || '').trim() ||
      String(profile.colors || '').trim() ||
      String(profile.scenes || '').trim()
    )
  )

  const latitude = Number(geo?.latitude)
  const longitude = Number(geo?.longitude)
  const hasGeoContext = Number.isFinite(latitude) && Number.isFinite(longitude)

  if (!hasProfileContext && !hasGeoContext) return ''

  return `【当前客户端上下文】${JSON.stringify({
    profile: hasProfileContext ? {
      city: String(profile?.city || '').trim(),
      heightCm: String(profile?.heightCm || '').trim(),
      weightKg: String(profile?.weightKg || '').trim(),
      topSize: String(profile?.topSize || '').trim(),
      bottomSize: String(profile?.bottomSize || '').trim(),
      shoeSize: String(profile?.shoeSize || '').trim(),
      style: String(profile?.style || '').trim(),
      colors: String(profile?.colors || '').trim(),
      scenes: String(profile?.scenes || '').trim(),
    } : null,
    geo: hasGeoContext ? { latitude, longitude } : null,
  })}`
}

const defaultRequestAssistantTurn = async (messages, tools = []) => {
  try {
    const response = await createChatCompletion(
      {
        model: process.env.DEEPSEEK_CHAT_MODEL || 'deepseek-chat',
        messages,
        tools,
        tool_choice: 'auto',
        temperature: 0.2,
        stream: false,
      },
      { timeout: Number(process.env.DEEPSEEK_TIMEOUT_MS) || 120000 }
    )
    return response?.data?.choices?.[0]?.message || {}
  } catch (error) {
    const normalized = normalizeLlmError(error, 'DeepSeek 工具决策服务', CHAT_ERROR_MESSAGES)
    normalized.requestSummary = buildAssistantTurnRequestSummary({ messages, tools })
    throw normalized
  }
}

const defaultStreamAssistantTurn = async (payload) => streamAssistantTurnFromCompletion(payload)

const executeAutonomousToolCall = async ({
  toolCall,
  userId,
  input,
  intent = 'clothing',
  sourceEntry = 'unified-agent',
  multimodal,
  latestTask = null,
  preferenceSummary = null,
  clientContext = null,
  sessionMemory = null,
  deps = {},
  emit,
}) => {
  const toolName = toolCall?.function?.name || ''
  const args = parseToolArguments(toolCall)
  const toolExecutionTimeoutMs = resolveToolExecutionTimeoutMs(toolName, deps)
  const runToolWithTimeout = (factory) => runWithTimeout(
    factory,
    toolExecutionTimeoutMs,
    () => createTimeoutErrorResult(toolName, toolExecutionTimeoutMs)
  )

  emit?.(buildToolCallStartedEvent({
    toolName,
    message: toolName === IMAGE_TOOL_NAME ? '正在分析图片' : `正在执行 ${toolName}`,
  }))

  const tool = getToolByName(toolName)

  if (toolName === IMAGE_TOOL_NAME) {
    const result = await runToolWithTimeout(() => executeAnalyzeImageTool({
      args,
      multimodal,
      deps,
      emit,
    }))
    if (result?.kind === 'tool_result') return result
    return completeAutonomousToolResult({
      emit,
      toolName,
      result,
      fallbackSummary: '图片分析完成',
    })
  }

  if (toolName === SHOW_CONTEXT_IMAGES_TOOL_NAME || toolName === GENERATE_OUTFIT_PREVIEW_TOOL_NAME) {
    try {
      const result = await runToolWithTimeout(
        () => deps.executeTool(toolName, args, { userId, latestTask, multimodal, clientContext, input })
      )
      if (result?.kind === 'media_result') {
        return completeAutonomousMediaResult({
          emit,
          toolName,
          result,
        })
      }
      return completeAutonomousToolResult({ emit, tool, toolName, result })
    } catch (error) {
      return completeAutonomousToolResult({
        emit,
        tool,
        toolName,
        result: { error: error.message || '展示图片失败', tool: toolName },
      })
    }
  }

  if (toolName === 'generate_scene_suits') {
    try {
      const result = await runToolWithTimeout(
        () => deps.executeTool(toolName, args, { userId, latestTask, multimodal, clientContext })
      )
      if (result?.error) {
        return completeAutonomousToolResult({ emit, tool, toolName, result })
      }

      const taskResult = await buildRecommendationTaskResult({
        userId,
        input,
        args,
        result,
        deps,
      })
      return completeAutonomousTaskResult({
        emit,
        toolName,
        taskResult,
        summary: taskResult.summary,
      })
    } catch (error) {
      return completeAutonomousToolResult({
        emit,
        tool,
        toolName,
        result: { error: error.message || '生成推荐失败', tool: toolName },
      })
    }
  }

  if (!tool) {
    return completeAutonomousToolResult({
      emit,
      toolName,
      result: { error: 'UNKNOWN_TOOL', tool: toolName },
    })
  }

  const toolContext = buildAutonomousRuntimeToolContext({
    userId,
    intent,
    multimodal,
    latestTask,
    preferenceSummary,
    clientContext,
    sessionMemory,
  })
  const route = routeToolExecution({
    tool,
    context: toolContext,
  })

  if (route.type === 'confirm') {
    try {
      const taskResult = await runToolWithTimeout(() => deps.executeAgentToolIntent(userId, input, sourceEntry, toolName, args, {
        latestTask,
        multimodal,
      }))
      if (taskResult?.error) {
        return completeAutonomousToolResult({
          emit,
          tool,
          toolName,
          result: taskResult,
        })
      }
      return {
        kind: 'task',
        taskResult,
        meta: buildToolCompletedEventMeta({
          toolName,
          ok: true,
          summary: '已生成待确认操作',
        }),
      }
    } catch (error) {
      return completeAutonomousToolResult({
        emit,
        tool,
        toolName,
        result: { error: error.message || '待确认操作生成失败', tool: toolName },
      })
    }
  }

  if (tool.mode === 'write' || tool.mode === 'write_batch') {
    try {
      const taskResult = await runToolWithTimeout(() => deps.executeAgentToolIntent(userId, input, sourceEntry, toolName, args, {
        latestTask,
        multimodal,
      }))
      if (taskResult?.error) {
        return completeAutonomousToolResult({
          emit,
          tool,
          toolName,
          result: taskResult,
        })
      }
      return {
        kind: 'task',
        taskResult,
        meta: buildToolCompletedEventMeta({
          toolName,
          ok: true,
          summary: '已执行写入操作',
        }),
      }
    } catch (error) {
      return completeAutonomousToolResult({
        emit,
        tool,
        toolName,
        result: { error: error.message || '写入操作执行失败', tool: toolName },
      })
    }
  }

  try {
    const result = await runToolWithTimeout(
      () => deps.executeTool(toolName, args, { userId, latestTask, multimodal, clientContext })
    )
    if (result?.kind === 'media_result') {
      return completeAutonomousMediaResult({
        emit,
        toolName,
        result,
      })
    }
    return completeAutonomousToolResult({ emit, tool, toolName, result })
  } catch (error) {
    return completeAutonomousToolResult({
      emit,
      tool,
      toolName,
      result: { error: error.message || '工具执行失败', tool: toolName },
    })
  }
}

const runAutonomousToolLoop = async ({
  userId,
  input,
  sourceEntry = 'unified-agent',
  intent = 'clothing',
  messages,
  multimodal,
  latestTask = null,
  deps = {},
  emit,
  sanitizeAssistantReply,
}) => {
  const requestAssistantTurn = deps.requestAssistantTurn || defaultRequestAssistantTurn
  const streamAssistantTurn = deps.streamAssistantTurn || null
  const toolContext = buildAutonomousRuntimeToolContext({
    userId,
    intent,
    multimodal,
    latestTask,
    preferenceSummary: deps.preferenceSummary || null,
    clientContext: deps.clientContext || null,
    sessionMemory: deps.sessionMemory || null,
  })
  const tools = buildAutonomousToolDefinitions(toolContext)
  const latestTaskContext = buildLatestTaskContextMessage(latestTask)
  const clientContextMessage = buildClientContextMessage(deps.clientContext || null)
  const conversation = [
    ...messages,
    { role: 'system', content: AUTONOMOUS_TOOL_PROMPT },
    ...(latestTaskContext ? [{ role: 'system', content: latestTaskContext }] : []),
    ...(clientContextMessage ? [{ role: 'system', content: clientContextMessage }] : []),
  ]
  const toolMetaList = []
  let collectedMediaAttachments = []
  let lastImageAnalysisResult = null
  let latestContextTask = null
  let reasoningContent = ''
  const isClientGone = deps.isClientGone || (() => false)
  const now = typeof deps.now === 'function' ? deps.now : Date.now
  const autonomousMaxDurationMs = Number(deps.autonomousMaxDurationMs || MAX_AUTONOMOUS_DURATION_MS)
  const startedAt = now()
  const isDurationBudgetExceeded = () => autonomousMaxDurationMs > 0 && (now() - startedAt) > autonomousMaxDurationMs

  for (let round = 0; round < MAX_AUTONOMOUS_TOOL_ROUNDS; round += 1) {
    if (isClientGone()) {
      return {
        kind: 'aborted',
        reasoningContent,
        toolMeta: mergeToolMeta(toolMetaList),
      }
    }
    if (isDurationBudgetExceeded()) {
      return null
    }
    let assistantDecision
    try {
      if (typeof streamAssistantTurn === 'function') {
        assistantDecision = await streamAssistantTurn({
          messages: conversation,
          tools,
          isClientGone,
          onReasoning: (text) => {
            reasoningContent += text
            emit?.(buildReasoningEvent(text))
          },
          onContent: (text) => {
            emit?.(buildContentEvent(text))
          },
        })
      } else {
        assistantDecision = await requestAssistantTurn(conversation, tools)
        const reasoning = extractReasoningContent(assistantDecision)
        if (reasoning) reasoningContent += reasoning
      }
    } catch (error) {
      const mergedToolMeta = mergeToolMeta(toolMetaList)
      if (mergedToolMeta || collectedMediaAttachments.length) {
        const fallbackReply = buildReplyFallbackAfterToolUse({
          input,
          latestTask: latestContextTask || latestTask,
          mergedToolMeta,
        })
        console.warn('[autonomousToolRuntime] assistant turn failed after tool use, fallback applied', {
          input: String(input || '').slice(0, 120),
          latestTaskType: String((latestContextTask || latestTask)?.taskType || ''),
          lastToolSummary: mergedToolMeta?.toolResultsSummary?.slice(-1)?.[0] || '',
          error: error?.message || 'assistant_turn_failed',
        })
        return {
          kind: 'reply',
          reply: fallbackReply,
          attachments: collectedMediaAttachments,
          reasoningContent,
          lastImageAnalysisResult,
          contextTask: latestContextTask,
          toolMeta: mergedToolMeta,
        }
      }
      throw error
    }
    const toolCalls = Array.isArray(assistantDecision?.tool_calls) ? assistantDecision.tool_calls : []

    if (!toolCalls.length) {
      const reply = sanitizeAssistantReply(extractAssistantText(assistantDecision), { intent })
      if (!reply) {
        const mergedToolMeta = mergeToolMeta(toolMetaList)
        if (mergedToolMeta) {
          const fallbackReply = buildReplyFallbackAfterToolUse({
            input,
            latestTask,
            mergedToolMeta,
          })
          console.warn('[autonomousToolRuntime] assistant reply empty after tool use, fallback applied', {
            input: String(input || '').slice(0, 120),
            latestTaskType: String(latestTask?.taskType || ''),
            lastToolSummary: mergedToolMeta?.toolResultsSummary?.slice(-1)?.[0] || '',
          })
        return {
          kind: 'reply',
          reply: fallbackReply,
          attachments: collectedMediaAttachments,
          reasoningContent,
          lastImageAnalysisResult,
          contextTask: latestContextTask,
          toolMeta: mergedToolMeta,
        }
        }
        return null
      }
      return {
        kind: 'reply',
        reply,
        attachments: collectedMediaAttachments,
        reasoningContent,
        lastImageAnalysisResult,
        contextTask: latestContextTask,
        toolMeta: mergeToolMeta(toolMetaList),
      }
    }

    const assistantEntry = {
      role: 'assistant',
      content: extractAssistantText(assistantDecision),
      tool_calls: toolCalls,
    }
    const reasoning = extractReasoningContent(assistantDecision)
    if (reasoning) assistantEntry.reasoning_content = reasoning
    conversation.push(assistantEntry)

    for (const toolCall of toolCalls) {
      const toolOutcome = await executeAutonomousToolCall({
        toolCall,
        userId,
        input,
        intent,
        sourceEntry,
        multimodal,
        latestTask,
        preferenceSummary: deps.preferenceSummary || null,
        clientContext: deps.clientContext || null,
        sessionMemory: deps.sessionMemory || null,
        deps,
        emit,
      })
      if (toolOutcome?.meta) {
        toolMetaList.push(toolOutcome.meta)
      }
      if (toolOutcome?.kind === 'tool_result') {
        latestContextTask = buildContextTaskFromToolResult({
          toolName: toolOutcome.toolName,
          result: toolOutcome.result,
          input,
        }) || latestContextTask
      }
      if (toolOutcome?.toolName === IMAGE_TOOL_NAME && toolOutcome?.result && !toolOutcome.result?.error) {
        lastImageAnalysisResult = toolOutcome.result
      }
      if (isDurationBudgetExceeded()) {
        return null
      }
      if (isClientGone()) {
        return {
          kind: 'aborted',
          reasoningContent,
          toolMeta: mergeToolMeta(toolMetaList),
        }
      }
      if (toolOutcome?.kind === 'task') {
        return {
          kind: 'task',
          taskResult: toolOutcome.taskResult,
          reasoningContent,
          lastImageAnalysisResult,
          toolMeta: mergeToolMeta(toolMetaList),
        }
      }
      if (toolOutcome?.kind === 'media_reply') {
        collectedMediaAttachments = mergeMediaAttachments(collectedMediaAttachments, toolOutcome.attachments || [])
        conversation.push(createMediaToolConversationEntry(toolCall.id, toolOutcome))
        continue
      }
      conversation.push({
        role: 'tool',
        tool_call_id: toolCall.id,
        content: toolOutcome?.content || normalizeToolResultContent({ error: 'EMPTY_TOOL_RESULT' }),
      })
    }
  }

  return null
}

module.exports = {
  AUTONOMOUS_TOOL_PROMPT,
  __testables: {
    buildReplyFallbackAfterToolUse,
    buildClientContextMessage,
    createEmptyStreamedAssistantMessage,
    ensureToolCallAtIndex,
    buildLatestTaskContextMessage,
    mergeToolCallDelta,
    parseDeepSeekStreamingPayload,
    resolveToolExecutionTimeoutMs,
    streamAssistantTurnFromCompletion,
  },
  buildAutonomousRuntimeToolContext,
  buildAutonomousToolDefinitions,
  defaultRequestAssistantTurn,
  defaultStreamAssistantTurn,
  runAutonomousToolLoop,
}
