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

  return { error: 'UNSUPPORTED_TOOL' }
}

module.exports = {
  TOOL_DEFINITIONS,
  executeTool,
}

