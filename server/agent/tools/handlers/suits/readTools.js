const { getAllClothes } = require('../../../../controllers/clothes')
const { getSuitDetailForUser, listSuitsForUser } = require('../../../../controllers/suits')

const safeString = (value) => (typeof value === 'string' ? value : value == null ? '' : String(value))
const coerceBoolean = (value) => Boolean(value === true || value === 1 || value === '1' || value === 'true')
const pickCloth = (cloth) => ({
  cloth_id: cloth.cloth_id,
  name: safeString(cloth.name),
  type: safeString(cloth.type),
  color: safeString(cloth.color),
  style: safeString(cloth.style),
  season: safeString(cloth.season),
  material: safeString(cloth.material),
  favorite: coerceBoolean(cloth.favorite),
  hasImage: Boolean(cloth.image),
})

const SCENE_RULES = [
  {
    keywords: ['商务', '办公', '会议', '面试'],
    name: '商务',
    preferredTypes: ['西装', '西装外套', '衬衫', '长裤', '西裤', '马甲'],
    styles: ['商务', '通勤', '正式'],
    colors: ['黑', '灰', '藏青', '蓝', '白', '卡其'],
  },
  {
    keywords: ['通勤', '日常'],
    name: '通勤',
    preferredTypes: ['衬衫', '针织', '毛衣', 'T恤', 'POLO', '外套', '长裤', '牛仔裤'],
    styles: ['通勤', '休闲'],
    colors: ['白', '蓝', '灰', '藏青', '卡其'],
  },
  {
    keywords: ['约会', '聚会', '晚餐', '约饭'],
    name: '约会',
    preferredTypes: ['衬衫', '针织', '连衣裙', '半身裙', '长裤', '外套'],
    styles: ['休闲', '时尚', '通勤'],
    colors: ['白', '粉', '蓝', '黑', '红'],
  },
  {
    keywords: ['运动', '健身', '跑步'],
    name: '运动',
    preferredTypes: ['运动', '卫衣', 'T恤', '运动裤', '短裤'],
    styles: ['运动'],
    colors: ['黑', '灰', '白'],
  },
  {
    keywords: ['旅行', '出行'],
    name: '旅行',
    preferredTypes: ['外套', '风衣', 'T恤', '牛仔裤', '休闲裤', '运动鞋'],
    styles: ['休闲'],
    colors: ['蓝', '黑', '白', '卡其'],
  },
]

const pickRule = (scene = '') => {
  const text = safeString(scene)
  const hit = SCENE_RULES.find((rule) => rule.keywords.some((keyword) => text.includes(keyword)))
  return hit || { name: '通用', preferredTypes: [], styles: [], colors: [] }
}

const scoreCloth = (cloth, rule) => {
  let score = 1
  const type = safeString(cloth.type)
  const style = safeString(cloth.style)
  const color = safeString(cloth.color)

  if ((rule?.preferredTypes || []).some((keyword) => type.includes(keyword))) score += 3
  if ((rule?.styles || []).some((keyword) => style.includes(keyword))) score += 2
  if ((rule?.colors || []).some((keyword) => color.includes(keyword))) score += 1
  if (coerceBoolean(cloth.favorite)) score += 1
  return score
}

const typeIncludes = (type = '', keywords = []) => keywords.some((keyword) => safeString(type).includes(keyword))
const isTop = (type = '') =>
  typeIncludes(type, ['上衣', '衬衫', '针织', '毛衣', '外套', '夹克', '西装', '卫衣', 'T恤', 'POLO'])
const isBottom = (type = '') => typeIncludes(type, ['裤', '裙', '短裤', '长裤', '牛仔裤', '半身裙'])
const isDress = (type = '') => safeString(type).includes('连衣裙')
const isOuter = (type = '') => typeIncludes(type, ['外套', '夹克', '西装', '风衣'])
const isShoes = (type = '') => safeString(type).includes('鞋')
const sortByScore = (list) => list.sort((left, right) => right.score - left.score)

const categorize = (clothes = [], rule) => {
  const scored = clothes.map((item) => ({ item, score: scoreCloth(item, rule) }))
  return {
    tops: sortByScore(scored.filter(({ item }) => isTop(item.type))),
    bottoms: sortByScore(scored.filter(({ item }) => isBottom(item.type))),
    dresses: sortByScore(scored.filter(({ item }) => isDress(item.type))),
    outers: sortByScore(scored.filter(({ item }) => isOuter(item.type))),
    shoes: sortByScore(scored.filter(({ item }) => isShoes(item.type))),
    all: sortByScore(scored),
  }
}

const buildRuleSuits = (scene, clothes, limit) => {
  const rule = pickRule(scene)
  const { tops, bottoms, dresses, outers, shoes, all } = categorize(clothes, rule)
  const max = Math.min(5, Math.max(1, limit || 3))
  const suits = []

  dresses.slice(0, 3).forEach((dress, index) => {
    if (suits.length >= max) return
    const shoe = shoes[index] || shoes[0]
    const combo = [dress.item]
    if (shoe) combo.push(shoe.item)
    suits.push({
      scene: safeString(scene) || rule.name || '通用场景',
      source: 'rule',
      rule: rule.name,
      reason: `${rule.name}规则：突出${safeString(dress.item?.style) || '场景'}风格`,
      items: combo.map(pickCloth),
    })
  })

  tops.slice(0, 3).forEach((top) => {
    bottoms.slice(0, 3).forEach((bottom) => {
      if (suits.length >= max) return
      const combo = [top.item, bottom.item]
      const outer = outers[0]
      const shoe = shoes[0]
      if (outer) combo.push(outer.item)
      if (shoe) combo.push(shoe.item)
      suits.push({
        scene: safeString(scene) || rule.name || '通用场景',
        source: 'rule',
        rule: rule.name,
        reason: `${rule.name}规则：平衡上/下装与配色`,
        items: combo.map(pickCloth),
      })
    })
  })

  if (!suits.length && all.length) {
    suits.push({
      scene: safeString(scene) || rule.name || '通用场景',
      source: 'rule',
      rule: rule.name,
      reason: `${rule.name}规则：衣橱暂缺完整搭配要素，先推荐优先单品`,
      items: all.slice(0, 3).map(({ item }) => pickCloth(item)),
    })
  }

  return suits.slice(0, max)
}

const generateSceneSuits = async (userId, args = {}) => {
  const scene = safeString(args.scene).trim()
  if (!scene) return { error: 'MISSING_SCENE' }

  const limit = Number.isFinite(args.limit) ? args.limit : 3
  const raw = (await getAllClothes(userId)) || []
  const closet = Array.isArray(raw) ? raw : []

  if (!closet.length) {
    return { error: 'EMPTY_CLOSET', message: '衣橱为空，请先在 /add 上传衣物，或在 /outfit 查看衣物' }
  }

  return {
    scene,
    totalClothes: closet.length,
    suits: buildRuleSuits(scene, closet, limit),
  }
}

const coerceInteger = (value) => {
  if (typeof value === 'number' && Number.isFinite(value)) return Math.trunc(value)
  const parsed = Number.parseInt(String(value), 10)
  return Number.isFinite(parsed) ? parsed : null
}

const listSavedSuits = async (userId, args = {}) => {
  const offset = Math.max(0, coerceInteger(args.offset) || 0)
  const limit = Math.min(50, Math.max(1, coerceInteger(args.limit) || 20))
  const rows = await listSuitsForUser(userId)
  const list = Array.isArray(rows) ? rows : []

  return {
    total: list.length,
    offset,
    limit,
    items: list.slice(offset, offset + limit),
  }
}

const getSavedSuitDetail = async (userId, args = {}) => {
  const suitId = coerceInteger(args.suit_id)
  if (!suitId || suitId <= 0) return { error: 'INVALID_SUIT_ID' }
  const detail = await getSuitDetailForUser(userId, suitId)
  return detail || { error: 'NOT_FOUND' }
}

module.exports = {
  buildRuleSuits,
  generateSceneSuits,
  getSavedSuitDetail,
  listSavedSuits,
}
