const {
  createClothForUser,
  deleteClothForUser,
  getClothByIdForUser,
  updateClothFieldsForUser,
} = require('../../../../controllers/clothes')

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
  image: safeString(cloth.image),
})

const setClothFavorite = async (userId, args = {}) => {
  const clothId = coerceInteger(args.cloth_id)
  if (!clothId || clothId <= 0) return { error: 'INVALID_CLOTH_ID' }
  if (!Object.prototype.hasOwnProperty.call(args, 'favorite')) return { error: 'MISSING_FAVORITE' }
  const favorite = coerceBoolean(args.favorite)
  const ok = await updateClothFieldsForUser(userId, clothId, { favorite })
  if (!ok) return { error: 'NOT_FOUND' }
  return { cloth_id: clothId, favorite, updated: true }
}

const createCloth = async (userId, args = {}) => {
  const created = await createClothForUser(userId, args)
  return created ? pickCloth(created) : { error: 'CREATE_FAILED' }
}

const createClothesBatch = async (userId, args = {}) => {
  const items = Array.isArray(args.items) ? args.items : []
  if (!items.length) return { error: 'EMPTY_ITEMS' }
  const createdItems = []
  for (const item of items) {
    // eslint-disable-next-line no-await-in-loop
    const created = await createClothForUser(userId, item)
    if (created) createdItems.push(pickCloth(created))
  }
  return {
    totalCreated: createdItems.length,
    items: createdItems,
  }
}

const updateClothFields = async (userId, args = {}) => {
  const clothId = coerceInteger(args.cloth_id)
  if (!clothId || clothId <= 0) return { error: 'INVALID_CLOTH_ID' }

  const patch = {}
  ;['name', 'type', 'color', 'style', 'season', 'material'].forEach((key) => {
    if (Object.prototype.hasOwnProperty.call(args, key)) {
      patch[key] = safeString(args[key])
    }
  })
  if (Object.prototype.hasOwnProperty.call(args, 'favorite')) {
    patch.favorite = coerceBoolean(args.favorite)
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

const deleteCloth = async (userId, args = {}) => {
  const clothId = coerceInteger(args.cloth_id)
  if (!clothId || clothId <= 0) return { error: 'INVALID_CLOTH_ID' }
  const ok = await deleteClothForUser(userId, clothId)
  if (!ok) return { error: 'NOT_FOUND' }
  return { cloth_id: clothId, deleted: true }
}

module.exports = {
  __testables: {
    pickCloth,
  },
  createCloth,
  createClothesBatch,
  deleteCloth,
  setClothFavorite,
  updateClothFields,
}
