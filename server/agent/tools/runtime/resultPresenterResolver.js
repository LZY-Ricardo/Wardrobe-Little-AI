const { replaceKnownRoutesWithPageNames } = require('./uiMetadataResolver')
const { summarizeRecommendationResultText } = require('../../../controllers/agent.helpers')

const safeString = (value) => (typeof value === 'string' ? value.trim() : value == null ? '' : String(value).trim())

const FALLBACK_PRESENTERS = {
  analyze_image: (result = {}) => safeString(result.summary || result.message || result.error || '图片分析完成'),
  show_context_images: (result = {}) => safeString(result.summary || '已准备当前图片'),
  show_clothes_images: (result = {}) => safeString(result.summary || '已准备指定衣物图片'),
  generate_outfit_preview: (result = {}) => safeString(result.summary || '已生成当前搭配预览图'),
  get_user_profile: () => '已读取用户画像',
  get_profile_insight: (result = {}) => safeString(result.summary || '已读取偏好洞察'),
  get_wardrobe_analytics: (result = {}) => {
    const total = Number(result.totalClothes || result.total || 0)
    return total > 0 ? `已统计 ${total} 件衣物` : '已读取衣橱统计'
  },
  refresh_profile_insight: (result = {}) => safeString(result.summary || '已刷新偏好画像'),
  get_weather_forecast: (result = {}) => {
    const city = safeString(result.city)
    const date = safeString(result.date)
    const text = safeString(result.text)
    const temp = safeString(result.temp)
    const prefix = [date, city].filter(Boolean).join(' ')
    const summary = [text, temp].filter(Boolean).join(' ')
    return [prefix, summary].filter(Boolean).join(' ')
  },
  list_clothes: (result = {}) => `查询到 ${Number(result.total || 0)} 件衣物`,
  get_cloth_detail: (result = {}) => {
    const name = safeString(result.name)
    return name ? `已读取“${name}”详情` : '已读取衣物详情'
  },
  export_closet_data: (result = {}) => {
    const total = Number(result.total || 0)
    return total > 0 ? `已准备 ${total} 件衣物的衣橱导出数据` : '已准备衣橱导出数据'
  },
  generate_scene_suits: (result = {}) => {
    if (result?.error === 'EMPTY_CLOSET') {
      return replaceKnownRoutesWithPageNames(safeString(result.message || '衣橱为空，请先添加衣物'))
    }
    return summarizeRecommendationResultText(result)
  },
  list_suits: (result = {}) => `查询到 ${Number(result.total || 0)} 套已保存套装`,
  get_suit_detail: (result = {}) => {
    const name = safeString(result.name)
    return name ? `已读取套装“${name}”详情` : '已读取套装详情'
  },
  list_outfit_logs: (result = {}) => `查询到 ${Number(result.total || 0)} 条穿搭记录`,
  get_outfit_log_detail: (result = {}) => {
    const logDate = safeString(result.log_date)
    return logDate ? `已读取 ${logDate} 的穿搭记录` : '已读取穿搭记录详情'
  },
  list_recommendations: (result = {}) => `查询到 ${Number(result.total || 0)} 条推荐历史`,
  get_recommendation_detail: (result = {}) => {
    const scene = safeString(result.scene)
    return scene ? `已读取“${scene}”推荐详情` : '已读取推荐详情'
  },
  create_cloth: (result = {}) => {
    const name = safeString(result.name || result.color)
    return name ? `已将“${name}”保存到衣橱` : '已保存到衣橱'
  },
  create_clothes_batch: (result = {}) => {
    const count = Number(result.totalCreated || (Array.isArray(result.items) ? result.items.length : 0))
    return count > 0 ? `已批量保存 ${count} 件衣物到衣橱` : '已批量保存到衣橱'
  },
  update_cloth_fields: () => '已更新衣物信息',
  update_cloth_image: () => '已更新衣物图片',
  import_closet_data: (result = {}) => {
    const inserted = Number(result.inserted || 0)
    const total = Number(result.total || 0)
    return total > 0 ? `已导入 ${inserted}/${total} 件衣物` : '已导入衣橱数据'
  },
  set_cloth_favorite: (result = {}) => (result.favorite ? '已收藏衣物' : '已取消收藏衣物'),
  delete_cloth: () => '已删除衣物',
  save_suit: (result = {}) => {
    const name = safeString(result?.suit?.name || result?.name)
    return name ? `已保存套装“${name}”` : '已保存套装'
  },
  update_recommendation_adoption: (result = {}) => {
    if (result.saved_as_suit) return '已将推荐标记为保存套装'
    if (result.saved_as_outfit_log) return '已将推荐标记为记录穿搭'
    return result.adopted ? '已采纳推荐' : '已取消采纳推荐'
  },
  submit_recommendation_feedback: (result = {}) => {
    const feedback = safeString(result.feedback_result)
    return feedback ? `已提交“${feedback}”反馈` : '已提交推荐反馈'
  },
  delete_suit: () => '已删除套装',
  create_outfit_log: (result = {}) => {
    const logDate = safeString(result.log_date || result.logDate)
    return logDate ? `已记录 ${logDate} 的穿搭` : '已记录穿搭'
  },
  update_outfit_log: (result = {}) => {
    const logDate = safeString(result.log_date || result.logDate)
    return logDate ? `已更新 ${logDate} 的穿搭记录` : '已更新穿搭记录'
  },
  delete_outfit_log: () => '已删除穿搭记录',
  update_user_sex: (result = {}) => {
    const sex = safeString(result.sex)
    return sex === 'man' ? '已更新性别为男' : sex === 'woman' ? '已更新性别为女' : '已更新性别设置'
  },
  update_user_name: (result = {}) => {
    const name = safeString(result.name)
    return name ? `已更新昵称为“${name}”` : '已更新昵称'
  },
  upload_user_avatar: () => '已更新头像',
  upload_character_model: () => '已更新人物模特',
  delete_character_model: () => '已删除人物模特',
  update_confirmation_preferences: (result = {}) =>
    result.lowRiskNoConfirm ? '已开启低风险操作免确认' : '已关闭低风险操作免确认',
}

const resolveResultPresenter = (tool = {}) => {
  const toolName = safeString(tool?.name)
  const descriptor = safeString(tool?.resultPresenter)
  if (!toolName || !descriptor) return null
  return FALLBACK_PRESENTERS[toolName] || null
}

const presentToolResult = ({ tool, result, fallbackSummary = '' } = {}) => {
  const presenter = resolveResultPresenter(tool)
  const presented = presenter ? presenter(result, tool) : ''
  if (presented) return replaceKnownRoutesWithPageNames(presented)

  const normalizedMessage = replaceKnownRoutesWithPageNames(safeString(result?.message))
  if (normalizedMessage) return normalizedMessage

  const normalizedError = replaceKnownRoutesWithPageNames(safeString(result?.error))
  if (normalizedError) return normalizedError

  const rawSummary = safeString(result?.summary)
  if (rawSummary) return replaceKnownRoutesWithPageNames(rawSummary)

  return replaceKnownRoutesWithPageNames(safeString(fallbackSummary || tool?.uiLabel || tool?.name || '工具执行完成'))
}

module.exports = {
  presentToolResult,
  resolveResultPresenter,
}
