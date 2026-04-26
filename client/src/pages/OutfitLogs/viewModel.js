const createClothMap = (clothes = []) =>
  new Map((Array.isArray(clothes) ? clothes : []).map((item) => [item.cloth_id, item]))

export const buildOutfitLogsViewModel = ({ form = {}, logs = [], clothes = [] } = {}) => {
  const clothMap = createClothMap(clothes)
  const selectedItems = (Array.isArray(form.items) ? form.items : [])
    .map((id) => clothMap.get(id))
    .filter(Boolean)
    .map((item) => ({
      id: item.cloth_id,
      label: item.name || item.type || '未命名单品',
      meta: [item.type, item.color, item.style].filter(Boolean).join(' · '),
    }))

  const sceneText = form.scene || '未填写场景'
  const weatherText = form.weatherSummary || '未填写天气'
  const satisfactionText = `${form.satisfaction || 0} / 5`

  return {
    heroHint: '先完成今天的穿搭记录，再回看历史与总结',
    todaySummary: `日期、场景、天气和满意度先集中在首屏，单品选择放在下一段完成。`,
    fields: [
      { key: 'date', label: '日期', value: form.logDate || '--' },
      { key: 'scene', label: '场景', value: sceneText },
      { key: 'weather', label: '天气', value: weatherText },
      { key: 'satisfaction', label: '满意度', value: satisfactionText },
    ],
    noteText: form.note || '今天想记录更轻松、适合通勤的搭配。',
    selectedCount: selectedItems.length,
    selectedItems,
    recentLogs: (Array.isArray(logs) ? logs : []).slice(0, 3),
  }
}

