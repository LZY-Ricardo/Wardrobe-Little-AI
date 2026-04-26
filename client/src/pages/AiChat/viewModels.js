import { normalizeMessageMeta } from './messageMeta.js'

const REASONING_CHARS_PER_SECOND = 30

const CONFIRM_DETAIL_LABELS = {
  name: '名称',
  type: '类型',
  color: '颜色',
  style: '风格',
  season: '季节',
  material: '材质',
  favorite: '收藏',
  sex: '性别',
  scene: '场景',
  logDate: '日期',
  lowRiskNoConfirm: '低风险免确认',
  count: '数量',
}

const TOOL_STATUS_LABELS = {
  running: '进行中',
  staged: '待确认',
  success: '已完成',
  failed: '失败',
}

export const mapMessage = (message) => {
  const meta = normalizeMessageMeta(message?.meta)
  const resolvedAttachments = Array.isArray(message.attachments) && message.attachments.length
    ? message.attachments
    : Array.isArray(meta?.attachments) ? meta.attachments : []
  const attachments = resolvedAttachments
    .slice()
    .sort((left, right) => {
      const leftSuitIndex = Number.isFinite(Number(left?.suitIndex)) ? Number(left.suitIndex) : -1
      const rightSuitIndex = Number.isFinite(Number(right?.suitIndex)) ? Number(right.suitIndex) : -1
      if (leftSuitIndex !== rightSuitIndex) return leftSuitIndex - rightSuitIndex
      const leftScore = left?.variant === 'composite' ? 0 : 1
      const rightScore = right?.variant === 'composite' ? 0 : 1
      if (leftScore !== rightScore) return leftScore - rightScore
      return 0
    })

  return {
    id: message.id,
    role: message.role === 'user' ? 'user' : 'assistant',
    content: message.content || '',
    reasoningContent: meta?.reasoningContent || '',
    messageType: message.message_type || 'chat',
    taskId: message.task_id || null,
    confirmationStatus: message.confirmation_status || '',
    deliveryStatus: 'sent',
    attachments,
    actionButton: meta?.actionButton || null,
    pendingConfirmation: meta?.pendingConfirmation || null,
    toolCalls: Array.isArray(meta?.toolCalls) ? meta.toolCalls : [],
    toolResultsSummary: Array.isArray(meta?.toolResultsSummary) ? meta.toolResultsSummary : [],
    latestTask: meta?.latestTask || null,
    toolPhase: '',
    reasoningStartTime: null,
    reasoningDurationMs: null,
  }
}

export const buildRecommendationAttachmentGroups = (attachments = []) => {
  const source = Array.isArray(attachments) ? attachments.filter((item) => item?.type === 'image' && item?.dataUrl) : []
  const hasSuitIndex = source.some((item) => Number.isFinite(Number(item?.suitIndex)))
  if (!hasSuitIndex) return []

  const groups = new Map()
  source.forEach((item) => {
    const suitIndex = Number(item?.suitIndex)
    if (!Number.isFinite(suitIndex) || suitIndex < 0) return
    const current = groups.get(suitIndex) || {
      suitIndex,
      label: String(item?.suitLabel || `第 ${suitIndex + 1} 套`).trim() || `第 ${suitIndex + 1} 套`,
      attachments: [],
    }
    current.attachments.push(item)
    groups.set(suitIndex, current)
  })

  return [...groups.values()]
    .sort((left, right) => left.suitIndex - right.suitIndex)
    .map((group) => ({
      ...group,
      attachments: group.attachments
        .slice()
        .sort((left, right) => {
          const leftScore = left?.variant === 'composite' ? 0 : 1
          const rightScore = right?.variant === 'composite' ? 0 : 1
          if (leftScore !== rightScore) return leftScore - rightScore
          return 0
        }),
    }))
}

export const computeReasoningSeconds = (message) => {
  if (!message?.reasoningContent) return 0

  if (typeof message.reasoningDurationMs === 'number' && message.reasoningDurationMs > 0) {
    return Math.max(1, Math.round(message.reasoningDurationMs / 1000))
  }

  if (typeof message.reasoningStartTime === 'number' && message.reasoningStartTime > 0) {
    return Math.max(1, Math.round((Date.now() - message.reasoningStartTime) / 1000))
  }

  return Math.max(1, Math.round(String(message.reasoningContent).length / REASONING_CHARS_PER_SECOND))
}

export const formatReasoningSummary = (message) => `思考了 ${computeReasoningSeconds(message)} 秒`

export const normalizeAgentMessages = (messages = []) => {
  const source = Array.isArray(messages) ? messages : []
  const resolvedTaskIds = new Set(
    source
      .filter(
        (message) =>
          message?.role === 'assistant' &&
          message?.messageType === 'confirm_result' &&
          ['confirmed', 'cancelled'].includes(message?.confirmationStatus) &&
          message?.taskId
      )
      .map((message) => String(message.taskId))
  )

  return source.reduce((acc, message) => {
    if (
      message?.role === 'assistant' &&
      message?.messageType === 'confirm_request' &&
      message?.taskId &&
      resolvedTaskIds.has(String(message.taskId))
    ) {
      return acc
    }

    const prev = acc[acc.length - 1]
    if (
      prev &&
      message?.role === 'assistant' &&
      ['task_result', 'confirm_request', 'confirm_result'].includes(message?.messageType) &&
      prev.role === 'assistant'
    ) {
      const samePendingConfirmId =
        Boolean(message.pendingConfirmation?.confirmId) &&
        message.pendingConfirmation?.confirmId === prev.pendingConfirmation?.confirmId

      const sameTaskMessage =
        message.messageType === prev.messageType &&
        message.content === prev.content &&
        message.confirmationStatus === prev.confirmationStatus &&
        ((message.taskId && message.taskId === prev.taskId) || samePendingConfirmId)

      if (sameTaskMessage) return acc
    }

    acc.push(message)
    return acc
  }, [])
}

export const normalizeRestoredMessages = (messages = []) => normalizeAgentMessages(
  Array.isArray(messages) ? messages.map(mapMessage) : []
)

const stripToolResultBlocks = (text = '') =>
  String(text || '')
    .replace(/(?:【|\[)\s*TOOL_RESULT[^\]\n】]*(?:】|\])[\s\S]*?(?:【|\[)\s*\/TOOL_RESULT\s*(?:】|\])/gi, '')
    .replace(/\n{3,}/g, '\n\n')
    .trim()

export const getDisplayMessageText = (message) => {
  if (!message) return ''
  const hasRecommendationAttachments = Array.isArray(message.attachments)
    && message.attachments.some((item) => item?.objectType === 'recommendation')
  const text = stripToolResultBlocks(message.content || '')
  const cleaned = ['image', 'multimodal'].includes(message.messageType)
    ? text
      .replace(/^\[图片消息\]\s*/m, '')
      .replace(/^图片理解：.*$/m, '')
      .replace(/^用户说明：/m, '')
      .trim()
    : text

  const toolAwareCleaned =
    message.role === 'assistant' && Array.isArray(message.toolCalls) && message.toolCalls.length
      ? cleaned
        .replace(/```json[\s\S]*?```/gi, '')
        .replace(/```[\s\n]*\{[\s\S]*?\}[\s\n]*```/g, '')
        .trim()
      : cleaned

  if (
    message.role === 'assistant' &&
    Array.isArray(message.toolCalls) &&
    message.toolCalls.length &&
    /^(?:\{[\s\S]*\}|\[[\s\S]*\])$/.test(toolAwareCleaned)
  ) {
    return ''
  }

  if (
    message.role === 'assistant' &&
    hasRecommendationAttachments &&
    /^(?:当前展示(?:第\s*\d+\s*套)?(?:，|\s*)共\s*\d+\s*套推荐|当前展示\s*1\s*套推荐|暂未生成推荐)$/.test(toolAwareCleaned)
  ) {
    return ''
  }

  return toolAwareCleaned
}

export const normalizeToolStatus = (status = '') => {
  const normalized = String(status || '').trim()
  if (normalized === 'started') return 'running'
  if (normalized === 'completed') return 'success'
  return normalized || 'running'
}

const getToolLabel = (name = '') => {
  const normalized = String(name || '').trim()
  if (!normalized) return '工具执行'

  return normalized
    .replace(/_/g, ' ')
    .replace(/\b\w/g, (char) => char.toUpperCase())
}

export const getToolStatusLabel = (status = '') => TOOL_STATUS_LABELS[normalizeToolStatus(status)] || '处理中'

export const buildToolCallTimeline = (message) => {
  const persisted = Array.isArray(message?.toolCalls) ? message.toolCalls : []
  const timeline = persisted.map((item, index) => ({
    id: `${item?.name || 'tool'}-${item?.at || index}`,
    name: item?.name || '',
    label: String(item?.label || getToolLabel(item?.name)).trim(),
    status: normalizeToolStatus(item?.status),
  }))

  if (!timeline.length && message?.deliveryStatus === 'streaming' && message?.toolPhase) {
    timeline.push({
      id: 'streaming-tool-phase',
      name: '',
      label: message.toolPhase,
      status: 'running',
      isPhase: true,
    })
  }

  return timeline
}

export const buildToolSummaryList = (message) => {
  const items = Array.isArray(message?.toolResultsSummary) ? message.toolResultsSummary : []
  return items.map((item) => String(item || '').trim()).filter(Boolean)
}

export const getConfirmationTitle = (pendingConfirmation) => {
  if (!pendingConfirmation) return '待确认操作'
  const actionLabel = String(pendingConfirmation.actionLabel || '').trim()
  if (actionLabel) return actionLabel
  const summary = String(pendingConfirmation.summary || '').trim()
  return summary || '待确认操作'
}

export const formatConfirmationScope = (scope = '') => {
  const value = String(scope || '').trim()
  if (!value) return ''
  return value
    .replace(/cloth_id=/gi, '衣物 #')
    .replace(/suit_id=/gi, '套装 #')
    .replace(/outfit_log_id=/gi, '记录 #')
    .replace(/sex=man/gi, '性别：男')
    .replace(/sex=woman/gi, '性别：女')
    .replace(/lowRiskNoConfirm=true/gi, '低风险操作免确认：开启')
    .replace(/lowRiskNoConfirm=false/gi, '低风险操作免确认：关闭')
}

export const buildConfirmationItems = (pendingConfirmation) => {
  const details = pendingConfirmation?.details
  if (!details || typeof details !== 'object') return { fields: [], items: [] }

  const fields = Object.entries(CONFIRM_DETAIL_LABELS)
    .map(([key, label]) => {
      const value = String(details?.[key] || '').trim()
      if (!value) return null
      return { key, label, value }
    })
    .filter(Boolean)

  const items = Array.isArray(details.items)
    ? details.items
        .map((item, index) => {
          const values = [
            item?.name,
            item?.type,
            item?.color,
            item?.style,
            item?.season,
            item?.material,
          ].map((value) => String(value || '').trim()).filter(Boolean)

          if (!values.length) return null
          return {
            id: `${item?.index || index + 1}`,
            title: String(item?.name || `衣物 ${index + 1}`).trim(),
            lines: [
              item?.type ? `类型：${String(item.type).trim()}` : '',
              item?.color ? `颜色：${String(item.color).trim()}` : '',
              item?.style ? `风格：${String(item.style).trim()}` : '',
              item?.season ? `季节：${String(item.season).trim()}` : '',
              item?.material ? `材质：${String(item.material).trim()}` : '',
            ].filter(Boolean),
          }
        })
        .filter(Boolean)
    : []

  return { fields, items }
}

export const buildConfirmationPreviewImages = (pendingConfirmation) =>
  (Array.isArray(pendingConfirmation?.previewImages) ? pendingConfirmation.previewImages : [])
    .filter((item) => item?.dataUrl)
