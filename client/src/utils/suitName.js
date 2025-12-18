const WEEKDAY_LABELS = ['周日', '周一', '周二', '周三', '周四', '周五', '周六']

const safeScene = (scene = '') => {
  const text = String(scene || '').trim()
  return text
}

export const buildAutoSuitName = (scene = '', timestamp) => {
  const date = timestamp ? new Date(timestamp) : new Date()
  const weekday = WEEKDAY_LABELS[date.getDay()] || '日常'
  const sceneText = safeScene(scene) || '日常'
  const name = `${weekday}${sceneText}穿搭`
  return name.slice(0, 64)
}

export const isGenericSuitName = (name = '') => {
  const text = String(name || '').trim()
  if (!text) return true
  return ['我的套装', '推荐套装', '未命名套装'].includes(text)
}
