const { getAllClothes, getClothByIdForUser, deleteClothForUser, updateClothFieldsForUser } = require('../controllers/clothes')
const { getUserInfoById, updateSex } = require('../controllers/user')

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
  {
    name: 'set_cloth_favorite',
    dangerous: true,
    description: '设置指定衣物的收藏状态（写操作，需要二次确认）',
    parameters: {
      type: 'object',
      additionalProperties: false,
      properties: {
        cloth_id: { type: 'integer', minimum: 1 },
        favorite: { type: 'boolean' },
      },
      required: ['cloth_id', 'favorite'],
    },
  },
  {
    name: 'update_cloth_fields',
    dangerous: true,
    description: '更新指定衣物的基础信息字段（写操作，需要二次确认；不支持更新图片）',
    parameters: {
      type: 'object',
      additionalProperties: false,
      properties: {
        cloth_id: { type: 'integer', minimum: 1 },
        name: { type: 'string' },
        type: { type: 'string' },
        color: { type: 'string' },
        style: { type: 'string' },
        season: { type: 'string' },
        material: { type: 'string' },
        favorite: { type: 'boolean' },
      },
      required: ['cloth_id'],
    },
  },
  {
    name: 'delete_cloth',
    dangerous: true,
    description: '删除指定衣物（写操作，需要二次确认）',
    parameters: {
      type: 'object',
      additionalProperties: false,
      properties: {
        cloth_id: { type: 'integer', minimum: 1 },
      },
      required: ['cloth_id'],
    },
  },
  {
    name: 'update_user_sex',
    dangerous: true,
    description: '更新当前用户的性别设置（写操作，需要二次确认）',
    parameters: {
      type: 'object',
      additionalProperties: false,
      properties: {
        sex: { type: 'string' },
      },
      required: ['sex'],
    },
  },
]

const TOOL_NAME_SET = new Set(TOOL_DEFINITIONS.map((tool) => tool.name))

const coerceBoolean = (value) => Boolean(value === true || value === 1 || value === '1' || value === 'true')

const safeString = (value) => (typeof value === 'string' ? value : value == null ? '' : String(value))

const coerceInteger = (value) => {
  if (typeof value === 'number' && Number.isFinite(value)) return Math.trunc(value)
  const parsed = Number.parseInt(String(value), 10)
  return Number.isFinite(parsed) ? parsed : null
}

const normalizeSex = (value) => {
  const raw = safeString(value).trim().toLowerCase()
  if (!raw) return ''
  if (['man', 'male', 'm', '男'].includes(raw)) return 'man'
  if (['woman', 'female', 'f', '女'].includes(raw)) return 'woman'
  return ''
}

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

  if (name === 'set_cloth_favorite') {
    const clothId = coerceInteger(safeArgs.cloth_id)
    if (!clothId || clothId <= 0) return { error: 'INVALID_CLOTH_ID' }
    if (!Object.prototype.hasOwnProperty.call(safeArgs, 'favorite')) return { error: 'MISSING_FAVORITE' }
    const favorite = coerceBoolean(safeArgs.favorite)
    const ok = await updateClothFieldsForUser(userId, clothId, { favorite })
    if (!ok) return { error: 'NOT_FOUND' }
    return { cloth_id: clothId, favorite, updated: true }
  }

  if (name === 'update_cloth_fields') {
    const clothId = coerceInteger(safeArgs.cloth_id)
    if (!clothId || clothId <= 0) return { error: 'INVALID_CLOTH_ID' }

    const patch = {}
    ;['name', 'type', 'color', 'style', 'season', 'material'].forEach((key) => {
      if (Object.prototype.hasOwnProperty.call(safeArgs, key)) {
        patch[key] = safeString(safeArgs[key])
      }
    })
    if (Object.prototype.hasOwnProperty.call(safeArgs, 'favorite')) {
      patch.favorite = coerceBoolean(safeArgs.favorite)
    }

    if (Object.keys(patch).length === 0) {
      return { error: 'NO_FIELDS' }
    }

    const ok = await updateClothFieldsForUser(userId, clothId, patch)
    if (!ok) {
      const exists = await getClothByIdForUser(userId, clothId)
      if (!exists) return { error: 'NOT_FOUND' }
      return { error: 'UPDATE_FAILED' }
    }
    return { cloth_id: clothId, updated: true, patch }
  }

  if (name === 'delete_cloth') {
    const clothId = coerceInteger(safeArgs.cloth_id)
    if (!clothId || clothId <= 0) return { error: 'INVALID_CLOTH_ID' }
    const ok = await deleteClothForUser(userId, clothId)
    if (!ok) return { error: 'NOT_FOUND' }
    return { cloth_id: clothId, deleted: true }
  }

  if (name === 'update_user_sex') {
    const sex = normalizeSex(safeArgs.sex)
    if (!sex) return { error: 'INVALID_SEX', allowed: ['man', 'woman'] }
    const ok = await updateSex(userId, sex)
    if (!ok) return { error: 'UPDATE_FAILED' }
    return { sex, updated: true }
  }

  return { error: 'UNSUPPORTED_TOOL' }
}

module.exports = {
  TOOL_DEFINITIONS,
  executeTool,
}
