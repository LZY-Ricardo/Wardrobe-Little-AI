const { clampLen, trimToString } = require('../utils/validate')

const QUERY_CLOTHES_KEYWORDS = ['衣橱', '衣柜', '衣服', '衣物', '收藏', '有哪些']
const RECOMMEND_SCENE_KEYWORDS = ['推荐', '搭配', '场景', '通勤', '约会', '面试', '商务', '运动', '旅行']
const PROFILE_KEYWORDS = ['画像', '偏好', '风格', '颜色偏好']
const ANALYTICS_KEYWORDS = ['分析', '统计', '趋势', '采纳率']

const summarizeRecommendationResultText = (result = {}) => {
  const total = Array.isArray(result?.suits) ? result.suits.length : 0
  if (total <= 0) return '暂未生成推荐'
  if (total === 1) return '当前展示 1 套推荐'
  return `当前展示第 1 套，共 ${total} 套推荐`
}

const detectScene = (text = '') => {
  const input = String(text || '')
  const scenes = ['通勤', '约会', '面试', '商务', '运动', '旅行', '聚会']
  return scenes.find((scene) => input.includes(scene)) || ''
}

const classifyAgentTask = (text = '') => {
  const input = trimToString(text)
  if (!input) return { taskType: 'unknown', scene: '', favoriteOnly: false }

  if (ANALYTICS_KEYWORDS.some((keyword) => input.includes(keyword))) {
    return { taskType: 'analytics', scene: '', favoriteOnly: false }
  }
  if (PROFILE_KEYWORDS.some((keyword) => input.includes(keyword))) {
    return { taskType: 'profile', scene: '', favoriteOnly: false }
  }
  if (RECOMMEND_SCENE_KEYWORDS.some((keyword) => input.includes(keyword))) {
    return {
      taskType: 'recommendation',
      scene: detectScene(input),
      favoriteOnly: false,
    }
  }
  if (QUERY_CLOTHES_KEYWORDS.some((keyword) => input.includes(keyword))) {
    return {
      taskType: 'closet_query',
      scene: '',
      favoriteOnly: input.includes('收藏'),
    }
  }

  return { taskType: 'unknown', scene: '', favoriteOnly: false }
}

const summarizeAgentResult = ({ taskType, result }) => {
  if (taskType === 'cloth_detail') {
    const cloth = result?.selectedCloth || result || {}
    const name = String(cloth?.name || '这件衣物').trim()
    const detailParts = [
      cloth?.type ? `类型：${cloth.type}` : '',
      cloth?.color ? `颜色：${cloth.color}` : '',
      cloth?.style ? `风格：${cloth.style}` : '',
      cloth?.season ? `季节：${cloth.season}` : '',
      cloth?.material ? `材质：${cloth.material}` : '',
    ].filter(Boolean)
    return clampLen(`已找到“${name}”的详细信息${detailParts.length ? `，${detailParts.join('，')}` : ''}`, 255)
  }
  if (taskType === 'suit_detail') {
    const suit = result?.selectedSuit || result || {}
    const name = String(suit?.name || '这套搭配').trim()
    const itemCount = Number(suit?.item_count || suit?.items?.length || 0)
    const detailParts = [
      suit?.scene ? `场景：${suit.scene}` : '',
      itemCount ? `单品数：${itemCount}` : '',
    ].filter(Boolean)
    return clampLen(`已找到“${name}”的详细信息${detailParts.length ? `，${detailParts.join('，')}` : ''}`, 255)
  }
  if (taskType === 'outfit_log_detail') {
    const log = result?.selectedOutfitLog || result || {}
    const name = String(log?.log_date || '这条穿搭记录').trim()
    const itemCount = Number(log?.item_count || log?.items?.length || 0)
    const detailParts = [
      log?.scene ? `场景：${log.scene}` : '',
      itemCount ? `单品数：${itemCount}` : '',
    ].filter(Boolean)
    return clampLen(`已找到“${name}”这条穿搭记录${detailParts.length ? `，${detailParts.join('，')}` : ''}`, 255)
  }
  if (taskType === 'closet_query') {
    return `查询到 ${(result?.total || 0)} 件衣物`
  }
  if (taskType === 'recommendation') {
    return summarizeRecommendationResultText(result)
  }
  if (taskType === 'profile') {
    return clampLen(result?.summary || '已获取偏好画像', 255)
  }
  if (taskType === 'analytics') {
    return `统计了 ${result?.totalClothes || 0} 件衣物与 ${result?.recommendationSummary?.total || 0} 次推荐`
  }
  if (taskType === 'create_cloth') {
    return clampLen(result?.summary || `待保存衣物：${result?.draftCloth?.name || '识别衣物'}`, 255)
  }
  return '暂时无法解析该任务'
}

const buildAgentTaskSummary = (text = '') => clampLen(trimToString(text), 255)

const summarizeAgentHistoryItem = (item = {}) => {
  const statusMap = {
    success: '已完成',
    pending: '待确认',
    cancelled: '已取消',
    expired: '已过期',
  }
  const confirmationMap = {
    not_required: '无需确认',
    pending: '待确认',
    confirmed: '已确认',
    cancelled: '已取消',
    expired: '已过期',
    auto_approved: '自动执行',
  }

  return {
    statusLabel: statusMap[item.status] || item.status || '未知状态',
    confirmationLabel:
      confirmationMap[item.confirmation_status] || item.confirmation_status || '无需确认',
    relatedObjectLabel:
      item.related_object_type && item.related_object_id
        ? `${item.related_object_type} #${item.related_object_id}`
        : item.related_object_type || '',
  }
}

const buildAgentExecutionPreview = ({ input = '', classification = {}, requiresConfirmation = false }) => {
  const taskType = classification?.taskType || 'unknown'
  const scene = classification?.scene || ''

  if (taskType === 'closet_query') {
    return {
      intent: '衣橱查询',
      why: '需要先读取当前账号的衣橱数据，再按条件筛选返回结果。',
      steps: ['读取当前衣橱数据', '按查询条件筛选衣物', '返回衣物列表摘要'],
      canAutoRun: true,
    }
  }

  if (taskType === 'cloth_detail') {
    return {
      intent: '查看衣物详情',
      why: '你正在查看当前衣物的详细信息。',
      steps: ['读取当前衣物上下文', '查询该衣物的详细字段', '返回衣物详情摘要'],
      canAutoRun: true,
    }
  }

  if (taskType === 'suit_detail') {
    return {
      intent: '查看套装详情',
      why: '你正在查看当前套装的详细信息。',
      steps: ['读取当前套装上下文', '查询该套装的详细字段', '返回套装详情摘要'],
      canAutoRun: true,
    }
  }

  if (taskType === 'outfit_log_detail') {
    return {
      intent: '查看穿搭记录详情',
      why: '你正在查看当前穿搭记录的详细信息。',
      steps: ['读取当前穿搭记录上下文', '查询该记录的详细字段', '返回穿搭记录详情摘要'],
      canAutoRun: true,
    }
  }

  if (taskType === 'recommendation') {
    return {
      intent: '场景推荐',
      why: scene ? `检测到你在请求“${scene}”场景的搭配建议。` : '检测到你在请求一组场景搭配建议。',
      steps: ['读取当前衣橱数据', '按场景生成推荐结果', '返回推荐摘要与可执行后续动作'],
      canAutoRun: true,
    }
  }

  if (taskType === 'profile') {
    return {
      intent: '偏好画像查询',
      why: '需要汇总衣橱、穿搭记录和反馈数据，返回长期偏好摘要。',
      steps: ['读取画像缓存或刷新画像', '汇总偏好标签', '返回画像摘要'],
      canAutoRun: true,
    }
  }

  if (taskType === 'analytics') {
    return {
      intent: '衣橱分析',
      why: '需要基于衣物、推荐和穿搭记录生成统计结果。',
      steps: ['读取闭环数据', '计算分布与趋势统计', '返回分析摘要'],
      canAutoRun: true,
    }
  }

  if (taskType === 'save_suit') {
    return {
      intent: '保存套装',
      why: '你正在要求把当前推荐结果写入套装库。',
      steps: ['读取当前推荐结果', '生成待确认操作摘要', '等待你确认后写入套装库'],
      canAutoRun: !requiresConfirmation,
    }
  }

  if (taskType === 'create_outfit_log') {
    return {
      intent: '记录穿搭',
      why: '你正在要求把当前推荐结果落为穿搭记录。',
      steps: ['读取当前推荐结果', '生成待确认操作摘要', '等待你确认后写入穿搭记录'],
      canAutoRun: !requiresConfirmation,
    }
  }

  if (taskType === 'toggle_favorite') {
    return {
      intent: '切换收藏状态',
      why: '你正在要求更新当前衣物的收藏状态。',
      steps: ['读取当前衣物上下文', '判断是否需要确认', '执行收藏状态更新'],
      canAutoRun: !requiresConfirmation,
    }
  }

  if (taskType === 'update_cloth_fields') {
    return {
      intent: '更新衣物信息',
      why: '你正在要求修改当前衣物的基础字段信息。',
      steps: ['读取当前衣物上下文', '生成待确认修改摘要', '等待你确认后写入衣物信息'],
      canAutoRun: !requiresConfirmation,
    }
  }

  if (taskType === 'delete_cloth') {
    return {
      intent: '删除衣物',
      why: '你正在要求删除当前衣物记录。',
      steps: ['读取当前衣物上下文', '生成待确认删除摘要', '等待你确认后删除衣物记录'],
      canAutoRun: !requiresConfirmation,
    }
  }

  if (taskType === 'delete_suit') {
    return {
      intent: '删除套装',
      why: '你正在要求删除当前套装记录。',
      steps: ['读取当前套装上下文', '生成待确认删除摘要', '等待你确认后删除套装记录'],
      canAutoRun: !requiresConfirmation,
    }
  }

  if (taskType === 'delete_outfit_log') {
    return {
      intent: '删除穿搭记录',
      why: '你正在要求删除当前穿搭记录。',
      steps: ['读取当前穿搭记录上下文', '生成待确认删除摘要', '等待你确认后删除穿搭记录'],
      canAutoRun: !requiresConfirmation,
    }
  }

  if (taskType === 'update_user_sex') {
    return {
      intent: '更新性别',
      why: '你正在要求修改当前账号的性别设置。',
      steps: ['解析目标性别', '生成待确认修改摘要', '等待你确认后写入用户资料'],
      canAutoRun: !requiresConfirmation,
    }
  }

  if (taskType === 'update_confirmation_preferences') {
    return {
      intent: '更新确认偏好',
      why: '你正在调整 Agent 对低风险写操作的确认策略。',
      steps: ['读取当前确认偏好', '判断是否需要确认', '写入新的确认偏好'],
      canAutoRun: !requiresConfirmation,
    }
  }

  if (taskType === 'create_cloth') {
    return {
      intent: '保存衣物到衣橱',
      why: '你正在要求把当前识别到的衣物保存到衣橱中。',
      steps: ['分析当前图片', '生成衣物草稿', '等待你确认后写入衣橱'],
      canAutoRun: !requiresConfirmation,
    }
  }

  return {
    intent: '未知任务',
    why: clampLen(trimToString(input) || '当前任务暂未匹配到已知能力。', 255),
    steps: ['解析输入内容', '匹配支持的任务类型', '返回说明信息'],
    canAutoRun: false,
  }
}

module.exports = {
  classifyAgentTask,
  summarizeRecommendationResultText,
  summarizeAgentResult,
  buildAgentTaskSummary,
  buildAgentExecutionPreview,
  summarizeAgentHistoryItem,
}
