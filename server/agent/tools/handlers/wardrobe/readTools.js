const { getAllClothes, getClothByIdForUser } = require('../../../../controllers/clothes')

const safeString = (value) => (typeof value === 'string' ? value : value == null ? '' : String(value))
const coerceBoolean = (value) => Boolean(value === true || value === 1 || value === '1' || value === 'true')
const coerceInteger = (value) => {
  if (typeof value === 'number' && Number.isFinite(value)) return Math.trunc(value)
  const parsed = Number.parseInt(String(value), 10)
  return Number.isFinite(parsed) ? parsed : null
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

const filterByIncludes = (value, keyword) => {
  const left = safeString(value).trim()
  const right = safeString(keyword).trim()
  if (!right) return true
  if (!left) return false
  return left.includes(right)
}

const listClothes = async (userId, args = {}) => {
  const offsetRaw = coerceInteger(args.offset)
  const offset = offsetRaw != null ? Math.max(0, offsetRaw) : 0
  const limitRaw = args.limit
  const limit = Number.isFinite(limitRaw) ? Math.min(50, Math.max(1, limitRaw)) : 30
  const favoriteOnly = coerceBoolean(args.favoriteOnly)
  const type = safeString(args.type)
  const style = safeString(args.style)
  const season = safeString(args.season)

  const raw = (await getAllClothes(userId)) || []
  const list = Array.isArray(raw) ? raw : []

  const filtered = list
    .filter((item) => (favoriteOnly ? coerceBoolean(item.favorite) : true))
    .filter((item) => filterByIncludes(item.type, type))
    .filter((item) => filterByIncludes(item.style, style))
    .filter((item) => filterByIncludes(item.season, season))

  return {
    total: filtered.length,
    offset,
    limit,
    items: filtered.slice(offset, offset + limit).map(pickCloth),
  }
}

const getClothDetail = async (userId, args = {}) => {
  const clothId = coerceInteger(args.cloth_id)
  if (!clothId || clothId <= 0) return { error: 'INVALID_CLOTH_ID' }
  const cloth = await getClothByIdForUser(userId, clothId)
  if (!cloth) return { error: 'NOT_FOUND' }
  return pickCloth(cloth)
}

module.exports = {
  getClothDetail,
  listClothes,
}
