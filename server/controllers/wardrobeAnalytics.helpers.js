const normalizeTypeLabel = (type = '') => {
  const text = String(type || '')
  if (text.includes('上衣')) return '上衣'
  if (text.includes('下衣')) return '下衣'
  if (text.includes('鞋')) return '鞋子'
  if (text.includes('配饰')) return '配饰'
  return text.trim() || '其他'
}

const countBy = (values = []) => {
  const counter = new Map()
  values
    .map((item) => String(item || '').trim())
    .filter(Boolean)
    .forEach((value) => counter.set(value, (counter.get(value) || 0) + 1))
  return Array.from(counter.entries())
    .map(([label, count]) => ({ label, count }))
    .sort((a, b) => b.count - a.count)
}

const buildTrend = (outfitLogs = []) => {
  const counter = new Map()
  outfitLogs.forEach((item) => {
    const date = String(item?.log_date || '').trim()
    if (!date) return
    counter.set(date, (counter.get(date) || 0) + 1)
  })
  return Array.from(counter.entries())
    .sort((a, b) => a[0].localeCompare(b[0]))
    .map(([date, count]) => ({ date, count }))
}

const buildWardrobeAnalytics = ({ clothes = [], outfitLogs = [], recommendations = [] }) => {
  const total = recommendations.length
  const adopted = recommendations.filter((item) => Number(item?.adopted) === 1).length

  return {
    totalClothes: clothes.length,
    typeDistribution: countBy(clothes.map((item) => normalizeTypeLabel(item.type))),
    styleDistribution: countBy(clothes.map((item) => item.style)),
    colorDistribution: countBy(clothes.map((item) => item.color)),
    sceneDistribution: countBy(outfitLogs.map((item) => item.scene)),
    outfitTrend: buildTrend(outfitLogs),
    recommendationSummary: {
      total,
      adopted,
      savedAsSuit: recommendations.filter((item) => Number(item?.saved_as_suit) === 1).length,
      savedAsOutfitLog: recommendations.filter((item) => Number(item?.saved_as_outfit_log) === 1).length,
      adoptionRate: total ? Math.round((adopted / total) * 100) : 0,
    },
  }
}

module.exports = {
  buildWardrobeAnalytics,
}
