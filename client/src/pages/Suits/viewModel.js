import { buildAutoSuitName, isGenericSuitName } from '../../utils/suitName.js'

const toArray = (value) => (Array.isArray(value) ? value : [])

const formatTime = (ts) => {
  if (!ts) return ''
  const date = new Date(Number(ts))
  if (Number.isNaN(date.getTime())) return ''
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(
    date.getDate()
  ).padStart(2, '0')}`
}

const displayNameOf = (suit = {}) =>
  !suit.name || isGenericSuitName(suit.name)
    ? buildAutoSuitName(suit.scene || '', suit.create_time)
    : String(suit.name || '').trim()

const countByScene = (suits = []) => {
  const counter = new Map()
  toArray(suits).forEach((suit) => {
    const key = String(suit?.scene || '未分类').trim() || '未分类'
    counter.set(key, (counter.get(key) || 0) + 1)
  })
  return [...counter.entries()].sort((a, b) => b[1] - a[1])
}

export const buildSuitCardModel = (suit = {}) => {
  const items = toArray(suit.items)
  const coverItems = items.slice(0, 3).map((item, index) => ({
    id: item?.cloth_id || `${suit.suit_id || 'suit'}-cover-${index}`,
    image: item?.image || '',
    alt: item?.name || item?.type || '单品',
  }))
  const thumbs = items.slice(0, 4).map((item, index) => ({
    id: item?.cloth_id || `${suit.suit_id || 'suit'}-thumb-${index}`,
    image: item?.image || '',
    alt: item?.name || item?.type || '单品',
  }))

  return {
    id: suit.suit_id,
    raw: suit,
    title: displayNameOf(suit),
    sceneLabel: suit.scene || '通用场景',
    countLabel: `${suit.item_count || items.length} 件单品`,
    timeLabel: formatTime(suit.create_time),
    previewText: items
      .map((item) => item?.name || item?.type || '')
      .filter(Boolean)
      .slice(0, 3)
      .join(' · '),
    coverItems,
    thumbs,
  }
}

export const buildCollectionViewModel = (suits = []) => {
  const list = toArray(suits)
  const scenes = countByScene(list)
  const [firstScene = ['未分类', 0], secondScene = ['常用', 0]] = scenes

  return {
    totalCount: list.length,
    heroMeta: `${list.length} 套收藏 · ${Math.min(list.length, 6)} 套本周常用`,
    heroHint: '更常穿的组合留在前面，低频套装交给 Agent 继续整理。',
    primaryStat: { label: firstScene[0], value: `${firstScene[1]} 套` },
    secondaryStat: { label: secondScene[0], value: `${secondScene[1]} 套` },
  }
}
