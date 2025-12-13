const { getAllClothes } = require('../controllers/clothes')
const { getUserInfoById } = require('../controllers/user')

const TOOL_DEFINITIONS = [
  {
    name: 'get_user_profile',
    description: '获取当前登录用户的基础画像信息（用于排查/引导与个性化建议）',
    parameters: {
      type: 'object',
      additionalProperties: false,
      properties: {},
    },
  },
  {
    name: 'list_clothes',
    description: '获取当前登录用户的衣橱衣物列表（支持筛选与限制数量；默认不返回图片）',
    parameters: {
      type: 'object',
      additionalProperties: false,
      properties: {
        limit: { type: 'integer', minimum: 1, maximum: 50 },
        favoriteOnly: { type: 'boolean' },
        type: { type: 'string' },
        style: { type: 'string' },
        season: { type: 'string' },
      },
    },
  },
  {
    name: 'generate_scene_suits',
    description: '基于当前用户衣橱与指定场景生成若干套穿搭建议（优先离线：本地规则；不返回图片）',
    parameters: {
      type: 'object',
      additionalProperties: false,
      properties: {
        scene: { type: 'string' },
        limit: { type: 'integer', minimum: 1, maximum: 5 },
      },
      required: ['scene'],
    },
  },
]

const TOOL_NAME_SET = new Set(TOOL_DEFINITIONS.map((tool) => tool.name))

const coerceBoolean = (value) => Boolean(value === true || value === 1 || value === '1' || value === 'true')

const safeString = (value) => (typeof value === 'string' ? value : value == null ? '' : String(value))

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
  const hit = SCENE_RULES.find((rule) => rule.keywords.some((k) => text.includes(k)))
  return (
    hit || {
      name: '通用',
      preferredTypes: [],
      styles: [],
      colors: [],
    }
  )
}

const scoreCloth = (cloth, rule) => {
  let score = 1
  const { preferredTypes = [], styles = [], colors = [] } = rule || {}
  const type = safeString(cloth.type)
  const style = safeString(cloth.style)
  const color = safeString(cloth.color)
  if (preferredTypes.some((t) => type.includes(t))) score += 3
  if (styles.some((s) => style.includes(s))) score += 2
  if (colors.some((c) => color.includes(c))) score += 1
  if (coerceBoolean(cloth.favorite)) score += 1
  return score
}

const categorize = (clothes = [], rule) => {
  const scored = clothes.map((item) => ({
    item,
    score: scoreCloth(item, rule),
  }))

  const typeIncludes = (type = '', keywords = []) => keywords.some((k) => safeString(type).includes(k))
  const isTop = (type = '') =>
    typeIncludes(type, ['上衣', '衬衫', '针织', '毛衣', '外套', '夹克', '西装', '卫衣', 'T恤', 'POLO'])
  const isBottom = (type = '') => typeIncludes(type, ['裤', '裙', '短裤', '长裤', '牛仔裤', '半身裙'])
  const isDress = (type = '') => safeString(type).includes('连衣裙')
  const isOuter = (type = '') => typeIncludes(type, ['外套', '夹克', '西装', '风衣'])
  const isShoes = (type = '') => safeString(type).includes('鞋')

  const sortByScore = (list) => list.sort((a, b) => b.score - a.score)

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

  // 1) 连衣裙组合（dress + shoes）
  dresses.slice(0, 3).forEach((dress, idx) => {
    if (suits.length >= max) return
    const shoe = shoes[idx] || shoes[0]
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

  // 2) 上下装组合（top + bottom + optional outer + optional shoes）
  tops.slice(0, 3).forEach((top) => {
    bottoms.slice(0, 3).forEach((bottom) => {
      if (suits.length >= max) return
      const combo = [top.item, bottom.item]
      const outer = outers[0]
      if (outer) combo.push(outer.item)
      const shoe = shoes[0]
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

  // 3) 兜底：单品推荐
  if (suits.length === 0 && all.length) {
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

const filterByIncludes = (value, keyword) => {
  const left = safeString(value).trim()
  const right = safeString(keyword).trim()
  if (!right) return true
  if (!left) return false
  return left.includes(right)
}

const executeTool = async (name, args, ctx) => {
  if (!TOOL_NAME_SET.has(name)) {
    return { error: 'UNKNOWN_TOOL' }
  }

  const userId = ctx?.userId
  if (!userId) {
    return { error: 'UNAUTHORIZED' }
  }

  const safeArgs = args && typeof args === 'object' ? args : {}

  if (name === 'get_user_profile') {
    const user = await getUserInfoById(userId)
    if (!user) return { error: 'NOT_FOUND' }
    return {
      id: user.id,
      username: safeString(user.username),
      name: safeString(user.name || user.username),
      sex: safeString(user.sex),
      hasCharacterModel: Boolean(user.characterModel),
    }
  }

  if (name === 'list_clothes') {
    const limitRaw = safeArgs.limit
    const limit = Number.isFinite(limitRaw) ? Math.min(50, Math.max(1, limitRaw)) : 30
    const favoriteOnly = coerceBoolean(safeArgs.favoriteOnly)
    const type = safeString(safeArgs.type)
    const style = safeString(safeArgs.style)
    const season = safeString(safeArgs.season)

    const raw = (await getAllClothes(userId)) || []
    const list = Array.isArray(raw) ? raw : []

    const filtered = list
      .filter((item) => (favoriteOnly ? coerceBoolean(item.favorite) : true))
      .filter((item) => filterByIncludes(item.type, type))
      .filter((item) => filterByIncludes(item.style, style))
      .filter((item) => filterByIncludes(item.season, season))

    return {
      total: filtered.length,
      items: filtered.slice(0, limit).map(pickCloth),
    }
  }

  if (name === 'generate_scene_suits') {
    const scene = safeString(safeArgs.scene).trim()
    if (!scene) return { error: 'MISSING_SCENE' }
    const limitRaw = safeArgs.limit
    const limit = Number.isFinite(limitRaw) ? limitRaw : 3

    const raw = (await getAllClothes(userId)) || []
    const closet = Array.isArray(raw) ? raw : []

    if (!closet.length) {
      return { error: 'EMPTY_CLOSET', message: '衣橱为空，请先在 /add 上传衣物，或在 /outfit 查看衣物' }
    }

    const suits = buildRuleSuits(scene, closet, limit)
    return {
      scene,
      totalClothes: closet.length,
      suits,
    }
  }

  return { error: 'UNSUPPORTED_TOOL' }
}

module.exports = {
  TOOL_DEFINITIONS,
  executeTool,
}
