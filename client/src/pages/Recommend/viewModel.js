const QUICK_SCENES = [
  { key: 'business', label: '商务', tone: 'neutral' },
  { key: 'date', label: '约会', tone: 'romance' },
  { key: 'sport', label: '运动', tone: 'sport' },
]

const toArray = (value) => (Array.isArray(value) ? value : [])

const getSourceLabel = (source) => (source === 'rule' ? '规则推荐' : '模型推荐')

const TYPE_MATCHERS = {
  top: ['上衣', '衬衫', 'T恤', '短袖', '长袖', '毛衣', '外套', '卫衣', '背心'],
  bottom: ['下衣', '裤', '裙', '半裙', '短裤', '长裤', '牛仔裤', '西裤'],
  shoes: ['鞋', '鞋子', '运动鞋', '帆布鞋', '高跟鞋', '凉鞋', '靴'],
}

const getSceneTone = (scene = '') => {
  const text = String(scene || '')
  if (['约会', '恋爱'].some((item) => text.includes(item))) return 'romance'
  if (['运动', '健身'].some((item) => text.includes(item))) return 'sport'
  return 'neutral'
}

const normalizePreviewItem = (item, fallbackId) => ({
  id: item?.cloth_id || fallbackId,
  image: item?.image || '',
  alt: item?.name || item?.type || '单品',
})

const matchCategory = (item = {}, category = 'top') => {
  const haystack = `${item?.type || ''} ${item?.name || ''}`.trim()
  return TYPE_MATCHERS[category]?.some((keyword) => haystack.includes(keyword))
}

const findFirstByCategory = (items, category, usedIds) => {
  const matched = items.find((item, index) => {
    const candidateId = item?.cloth_id || `${category}-${index}`
    return !usedIds.has(candidateId) && matchCategory(item, category)
  })
  if (!matched) return null
  const nextId = matched?.cloth_id || `${category}-${items.indexOf(matched)}`
  usedIds.add(nextId)
  return matched
}

const findNextUnused = (items, usedIds) => {
  const matched = items.find((item, index) => {
    const candidateId = item?.cloth_id || `fallback-${index}`
    return !usedIds.has(candidateId)
  })
  if (!matched) return null
  const nextId = matched?.cloth_id || `fallback-${items.indexOf(matched)}`
  usedIds.add(nextId)
  return matched
}

const buildPreviewImages = (items = []) => {
  const list = toArray(items)
  const usedIds = new Set()

  const mainItem = findFirstByCategory(list, 'top', usedIds) || findNextUnused(list, usedIds)
  const bottomItem = findFirstByCategory(list, 'bottom', usedIds) || findNextUnused(list, usedIds)
  const shoesItem = findFirstByCategory(list, 'shoes', usedIds) || findNextUnused(list, usedIds)

  return {
    main: mainItem ? normalizePreviewItem(mainItem, 'preview-main') : null,
    secondary: [
      normalizePreviewItem(bottomItem, 'preview-bottom'),
      normalizePreviewItem(shoesItem, 'preview-shoes'),
    ],
  }
}

const buildFeaturedItem = (items = []) => {
  const firstItem = toArray(items)[0] || {}
  return {
    title: `${firstItem?.type || '上衣'}：${firstItem?.name || firstItem?.color || '搭配单品'}`,
    tags: [firstItem?.color, firstItem?.style, firstItem?.season].filter(Boolean).slice(0, 3),
  }
}

export const buildRecommendCardModel = (suit = {}, options = {}) => {
  const items = toArray(suit.items)
  const saveState = options.isSaved ? '已加入套装库' : options.isSaving ? '加入中...' : '加入套装库'

  return {
    id: suit.id,
    raw: suit,
    sceneLabel: suit.scene || '通用场景',
    sourceLabel: getSourceLabel(suit.source),
    sceneTone: getSceneTone(suit.scene),
    message: suit.description || '暂无推荐说明',
    previewImages: buildPreviewImages(items),
    featuredItem: buildFeaturedItem(items),
    saveLabel: saveState,
    isSaved: Boolean(options.isSaved),
    isSaving: Boolean(options.isSaving),
    items,
  }
}

export const buildRecommendViewModel = ({ scene = '', sceneSuits = [], serviceUnavailable = false } = {}) => ({
  sceneValue: String(scene || ''),
  quickScenes: QUICK_SCENES,
  resultMeta: `${toArray(sceneSuits).length} 套推荐`,
  serviceStatus: serviceUnavailable ? '服务暂不可用时，保留重试入口' : '',
})
