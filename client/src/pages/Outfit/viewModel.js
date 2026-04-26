const isFavorited = (value) => value === 1 || value === true || value === '1' || value === 'true'

const toArray = (value) => (Array.isArray(value) ? value : [])

export const buildCardModel = (cloth = {}) => {
  const title = cloth.name || '未命名'
  const meta = [cloth.type, cloth.style].filter(Boolean).join(' · ') || cloth.type || '暂未分类'
  const tags = [cloth.color, cloth.season].filter(Boolean).slice(0, 2)

  return {
    id: cloth.cloth_id,
    title,
    meta,
    tags,
    isFavorited: isFavorited(cloth.favorite),
  }
}

export const buildOutfitViewModel = ({ items = [], filters = {} } = {}) => {
  const list = toArray(items)
  const favoriteCount = list.filter((item) => isFavorited(item.favorite)).length
  const activeSecondaryFilters = [
    { key: 'color', label: '颜色', value: filters.color },
    { key: 'season', label: '季节', value: filters.season },
    { key: 'style', label: '场景', value: filters.style },
  ].filter((item) => item.value && item.value !== '全部')

  return {
    totalCount: list.length,
    favoriteCount,
    heroMeta: `${list.length} 件单品 · ${favoriteCount} 件常穿收藏`,
    hasAdvancedFilters: activeSecondaryFilters.length > 0,
    activeSecondaryFilters,
    filterSummaryText: activeSecondaryFilters.length ? `已筛选 ${activeSecondaryFilters.length} 项` : '筛选全部',
    buildCardModel,
  }
}
