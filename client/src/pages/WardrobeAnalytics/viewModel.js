const firstLabel = (items = [], fallback = '') => {
  if (!Array.isArray(items) || items.length === 0) return fallback
  return items[0]?.label || items[0]?.date || fallback
}

const buildHeroInsightText = (data) => {
  const topType = firstLabel(data?.typeDistribution, '当前结构')
  const topStyle = firstLabel(data?.styleDistribution, '当前风格')
  const adoptionRate = Number(data?.recommendationSummary?.adoptionRate || 0)
  const adoptionHint = adoptionRate <= 20 ? '当前采纳率偏低' : '当前采纳率相对稳定'
  return `${topType}占比较高，${topStyle}明显，${adoptionHint}，适合先做精简与搭配整理。`
}

export const buildWardrobeAnalyticsViewModel = (data = {}) => ({
  heroInsightLabel: '衣橱结论',
  heroInsightText: buildHeroInsightText(data),
  trendItems: [
    { key: 'type', label: firstLabel(data?.typeDistribution, '类型结构'), value: 0.82 },
    { key: 'style', label: firstLabel(data?.styleDistribution, '风格分布'), value: 0.68 },
    { key: 'adoption', label: '采纳趋势', value: 0.36 },
  ],
  focusNote: {
    text: '先清理低频鞋履，再补基础上衣。',
    badge: '重点',
  },
})

