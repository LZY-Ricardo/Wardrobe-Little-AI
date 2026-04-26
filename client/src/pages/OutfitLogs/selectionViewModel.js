const CATEGORY_CONFIG = [
  { key: 'all', label: '全部' },
  { key: 'tops', label: '上衣' },
  { key: 'bottoms', label: '下衣' },
  { key: 'shoes', label: '鞋子' },
  { key: 'accessories', label: '配饰' },
]

const CATEGORY_MATCHERS = {
  tops: ['上衣', '上装', '衬衫', 't恤', 't-shirt', '卫衣', '毛衣', '外套', '西装', '夹克', '背心'],
  bottoms: ['下衣', '下装', '裤', '半裙', '裙', '短裤', '牛仔裤', '长裤'],
  shoes: ['鞋', '靴', '凉鞋', '运动鞋', '高跟'],
  accessories: ['配饰', '包', '帽', '围巾', '项链', '耳环', '戒指', '手链', '腰带', '眼镜'],
}

const SEARCH_FIELDS = ['name', 'type', 'color', 'style', 'season']
const DEFAULT_VISIBLE_COUNT = 6

const normalizeText = (value) => String(value || '').trim().toLowerCase()

const resolveCategory = (item = {}) => {
  const typeText = normalizeText(item.type)
  if (!typeText) return 'accessories'

  for (const [categoryKey, matchers] of Object.entries(CATEGORY_MATCHERS)) {
    if (matchers.some((matcher) => typeText.includes(normalizeText(matcher)))) {
      return categoryKey
    }
  }

  return 'accessories'
}

const buildItem = (item = {}, selectedSet = new Set()) => ({
  id: item.cloth_id,
  label: item.name || item.type || '未命名单品',
  meta: [item.type, item.color, item.style].filter(Boolean).join(' · '),
  category: resolveCategory(item),
  selected: selectedSet.has(item.cloth_id),
  favorite: Boolean(item.favorite),
  searchTokens: SEARCH_FIELDS.map((field) => item[field]).filter(Boolean),
})

const matchesSearch = (item, keyword) => {
  if (!keyword) return true
  return item.searchTokens.some((value) => normalizeText(value).includes(keyword))
}

const sortItems = (items) =>
  [...items].sort((a, b) => {
    if (Number(b.selected) !== Number(a.selected)) return Number(b.selected) - Number(a.selected)
    if (Number(b.favorite) !== Number(a.favorite)) return Number(b.favorite) - Number(a.favorite)
    return a.label.localeCompare(b.label, 'zh-Hans-CN')
  })

export const buildSelectionViewModel = ({
  clothes = [],
  selectedIds = [],
  activeCategory = 'all',
  keyword = '',
  visibleCount = DEFAULT_VISIBLE_COUNT,
} = {}) => {
  const selectedSet = new Set(Array.isArray(selectedIds) ? selectedIds : [])
  const items = (Array.isArray(clothes) ? clothes : [])
    .map((item) => buildItem(item, selectedSet))
    .filter((item) => item.id !== undefined && item.id !== null)

  const normalizedKeyword = normalizeText(keyword)
  const filteredBySearch = items.filter((item) => matchesSearch(item, normalizedKeyword))

  const currentItems = activeCategory === 'all'
    ? filteredBySearch
    : filteredBySearch.filter((item) => item.category === activeCategory)

  const sortedCurrentItems = sortItems(currentItems)
  const visibleItems = sortedCurrentItems.slice(0, visibleCount)

  return {
    keyword: normalizedKeyword,
    categories: CATEGORY_CONFIG.map((category) => ({
      ...category,
      count:
        category.key === 'all'
          ? filteredBySearch.length
          : filteredBySearch.filter((item) => item.category === category.key).length,
      active: category.key === activeCategory,
    })).filter((category) => category.key === 'all' || category.count > 0),
    selectedItems: sortItems(items.filter((item) => item.selected)),
    visibleItems,
    totalCount: sortedCurrentItems.length,
    hasMore: sortedCurrentItems.length > visibleItems.length,
    emptyText: normalizedKeyword ? '没有匹配到单品' : '这一类还没有单品',
  }
}
