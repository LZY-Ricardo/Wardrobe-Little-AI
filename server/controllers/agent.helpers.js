const { clampLen, trimToString } = require('../utils/validate')

const QUERY_CLOTHES_KEYWORDS = ['衣橱', '衣柜', '衣服', '衣物', '收藏', '有哪些']
const RECOMMEND_SCENE_KEYWORDS = ['推荐', '搭配', '场景', '通勤', '约会', '面试', '商务', '运动', '旅行']
const PROFILE_KEYWORDS = ['画像', '偏好', '风格', '颜色偏好']
const ANALYTICS_KEYWORDS = ['分析', '统计', '趋势', '采纳率']

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
  if (taskType === 'closet_query') {
    return `查询到 ${(result?.total || 0)} 件衣物`
  }
  if (taskType === 'recommendation') {
    return `生成了 ${(result?.suits || []).length} 套推荐`
  }
  if (taskType === 'profile') {
    return clampLen(result?.summary || '已获取偏好画像', 255)
  }
  if (taskType === 'analytics') {
    return `统计了 ${result?.totalClothes || 0} 件衣物与 ${result?.recommendationSummary?.total || 0} 次推荐`
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

  if (taskType === 'update_confirmation_preferences') {
    return {
      intent: '更新确认偏好',
      why: '你正在调整 Agent 对低风险写操作的确认策略。',
      steps: ['读取当前确认偏好', '判断是否需要确认', '写入新的确认偏好'],
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
  summarizeAgentResult,
  buildAgentTaskSummary,
  buildAgentExecutionPreview,
  summarizeAgentHistoryItem,
}
