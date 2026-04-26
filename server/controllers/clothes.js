// 数据库相关操作
const { query } = require('../models/db')
const {
    calcBase64Size,
    clampLen,
    ensureLen,
    hasRequiredClothesType,
    isProbablyBase64Image,
    normalizeClothesType,
} = require('../utils/validate')

const allServices = { query }
const MAX_IMAGE_BYTES = 1 * 1024 * 1024

const validateClothImageOrThrow = (image = '') => {
    const normalized = String(image || '').trim()
    if (!normalized) return ''
    if (!isProbablyBase64Image(normalized)) {
        const error = new Error('请上传图片数据')
        error.status = 400
        throw error
    }
    const imageSize = calcBase64Size(normalized)
    if (imageSize > MAX_IMAGE_BYTES) {
        const error = new Error('图片大小需不超过 1MB，请压缩后再上传')
        error.status = 400
        throw error
    }
    return normalized
}

const parseTypeKeywords = (raw, fallback) =>
    String(raw || fallback || '')
        .split(',')
        .map((value) => value.trim())
        .filter(Boolean)

// 插入衣物数据
const insertClothesData = async (data) => {
    const { user_id, name, type, color, style, season, material, image, create_time, update_time } = data
    const sql = 'INSERT INTO clothes (user_id, name, type, color, style, season, material, image, create_time, update_time) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)'
    const params = [user_id, name, type, color, style, season, material, image, create_time, update_time]
    const result = await allServices.query(sql, params)
    if (result.affectedRows > 0) {
        return true
    } else {
        return false
    }
}

// 获取所有衣物数据
const getAllClothes = async (user_id) => {
    const sql = 'SELECT * FROM clothes WHERE user_id = ?'
    const params = [user_id]
    const result = await allServices.query(sql, params)
    return Array.isArray(result) ? result : []
}

// 删除衣物
const deleteClothes = async (clothes_id) => {
    console.log('------------删除衣物------------');
    
    const sql = 'DELETE FROM clothes WHERE cloth_id = ?'
    const params = [clothes_id]
    const result = await allServices.query(sql, params)
    console.log('res',result);
    if (result.affectedRows > 0) {
        return true
    } else {
        return false
    }
}

// 更新衣物
const updateClothes = async (data) => {
    const { cloth_id, name, type, color, style, season, material, favorite, image, update_time } = data
    const sql = 'UPDATE clothes SET name = ?, type = ?, color = ?, style = ?, season = ?, material = ?, favorite = ?, image = ?, update_time = ? WHERE cloth_id = ?'
    const params = [name, type, color, style, season, material, favorite, image, update_time, cloth_id]
    const result = await allServices.query(sql, params)
    if (result.affectedRows > 0) {
        return true
    } else {
        return false
    }
}

// 获取上衣数据
const getTopClothes   = async (user_id) => {
    const sql = 'SELECT * FROM clothes WHERE user_id = ? AND type LIKE ?'
    const params = [user_id, '%上衣%']
    const result = await allServices.query(sql, params)
    return Array.isArray(result) ? result : []
}

// 获取下衣数据
const getBotClothes   = async (user_id) => {
    const sql = 'SELECT * FROM clothes WHERE user_id = ? AND type LIKE ?'
    const params = [user_id, '%下衣%']
    const result = await allServices.query(sql, params)
    return Array.isArray(result) ? result : []
}

// 获取指定衣物（带 user_id 归属校验）
const getClothByIdForUser = async (user_id, cloth_id) => {
    const sql = 'SELECT * FROM clothes WHERE user_id = ? AND cloth_id = ? LIMIT 1'
    const params = [user_id, cloth_id]
    const result = await allServices.query(sql, params)
    if (result.length > 0) {
        return result[0]
    } else {
        return null
    }
}

// 删除衣物（带 user_id 归属校验）
const deleteClothForUser = async (user_id, cloth_id) => {
    const sql = 'DELETE FROM clothes WHERE user_id = ? AND cloth_id = ?'
    const params = [user_id, cloth_id]
    const result = await allServices.query(sql, params)
    return result.affectedRows > 0
}

// 更新衣物字段（带 user_id 归属校验；仅允许白名单字段）
const updateClothFieldsForUser = async (user_id, cloth_id, patch = {}) => {
    const allowedFields = ['name', 'type', 'color', 'style', 'season', 'material', 'favorite', 'image']
    const updates = []
    const params = []

    allowedFields.forEach((field) => {
        if (Object.prototype.hasOwnProperty.call(patch, field)) {
            updates.push(`${field} = ?`)
            if (field === 'favorite') {
                const fav = patch.favorite === true || patch.favorite === 1 || patch.favorite === '1' || patch.favorite === 'true'
                params.push(fav ? 1 : 0)
            } else {
                params.push(patch[field])
            }
        }
    })

    if (updates.length === 0) {
        return false
    }

    updates.push('update_time = ?')
    params.push(Date.now())
    params.push(user_id, cloth_id)

    const sql = `UPDATE clothes SET ${updates.join(', ')} WHERE user_id = ? AND cloth_id = ?`
    const result = await allServices.query(sql, params)
    return result.affectedRows > 0
}

const createClothForUser = async (user_id, payload = {}) => {
    const name = ensureLen(payload.name, '衣物名称')
    const normalizedType = normalizeClothesType(ensureLen(payload.type, '衣物类型')).value
    if (!hasRequiredClothesType(normalizedType)) {
        const error = new Error('衣物类型需包含：上衣/下衣/鞋子/配饰')
        error.status = 400
        throw error
    }

    const color = ensureLen(payload.color, '衣物颜色')
    const style = ensureLen(payload.style, '衣物风格')
    const season = ensureLen(payload.season, '适宜季节')
    const material = clampLen(payload.material, 64)
    const image = validateClothImageOrThrow(payload.image)

    const now = Date.now()
    const sql = 'INSERT INTO clothes (user_id, name, type, color, style, season, material, image, create_time, update_time) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)'
    const params = [user_id, name, normalizedType, color, style, season, material, image, now, now]
    const result = await allServices.query(sql, params)
    if (!result?.insertId) {
        const error = new Error('创建衣物失败')
        error.status = 500
        throw error
    }
    return getClothByIdForUser(user_id, result.insertId)
}

const exportClothesForUser = async (user_id, options = {}) => {
    const includeImages = Boolean(options.includeImages)
    const maxTotalBytes = Number(options.maxTotalBytes) || 4 * 1024 * 1024
    const list = await getAllClothes(user_id)
    const items = Array.isArray(list) ? list : []

    let totalImageBytes = 0
    const exportedItems = items.map((item) => {
        const copy = { ...item }
        if (!includeImages) {
            delete copy.image
            return copy
        }
        totalImageBytes += calcBase64Size(copy.image || '')
        return copy
    })

    if (includeImages && totalImageBytes > maxTotalBytes) {
        const error = new Error(`导出数据过大（图片约 ${(totalImageBytes / 1024 / 1024).toFixed(2)}MB），请减少衣物数量或使用不含图片导出`)
        error.status = 413
        throw error
    }

    return {
        exportedAt: new Date().toISOString(),
        includeImages,
        items: exportedItems,
    }
}

const normalizeImportItems = (payload = {}) => {
    const rawItems = payload.items || payload.data?.items || payload
    return Array.isArray(rawItems) ? rawItems : []
}

const importClothesForUser = async (user_id, payload = {}, options = {}) => {
    const items = normalizeImportItems(payload)
    if (!items.length) {
        const error = new Error('导入数据为空')
        error.status = 400
        throw error
    }

    const hasImages = items.some((item) => Boolean(item?.image))
    const maxItems = hasImages
        ? (Number(options.maxItemsWithImages) || Number(process.env.CLOTHES_IMPORT_MAX_ITEMS_WITH_IMAGES) || 5)
        : (Number(options.maxItems) || Number(process.env.CLOTHES_IMPORT_MAX_ITEMS) || 100)
    if (items.length > maxItems) {
        const error = new Error(`导入条目过多，最多支持 ${maxItems} 条`)
        error.status = 400
        throw error
    }

    const now = Date.now()
    let inserted = 0

    for (const item of items) {
        if (!item || typeof item !== 'object') continue

        const safeImage = validateClothImageOrThrow(item.image || '')

        let safeName
        let safeType
        let safeColor
        let safeStyle
        let safeSeason
        let safeMaterial
        try {
            safeName = ensureLen(item.name, '衣物名称')
            safeType = normalizeClothesType(ensureLen(item.type, '衣物类型')).value
            if (!hasRequiredClothesType(safeType)) {
                const error = new Error('衣物类型需包含：上衣/下衣/鞋子/配饰')
                error.status = 400
                throw error
            }
            safeColor = ensureLen(item.color, '衣物颜色')
            safeStyle = ensureLen(item.style, '衣物风格')
            safeSeason = ensureLen(item.season, '适宜季节')
            safeMaterial = clampLen(item.material, 64)
        } catch (error) {
            error.status = error.status || 400
            throw error
        }

        const data = {
            user_id,
            name: safeName,
            type: safeType,
            color: safeColor,
            style: safeStyle,
            season: safeSeason,
            material: safeMaterial,
            image: safeImage,
            create_time: now,
            update_time: now,
        }

        // eslint-disable-next-line no-await-in-loop
        const ok = await insertClothesData(data)
        if (ok) inserted += 1
    }

    return { inserted, total: items.length }
}

const updateClothImageForUser = async (user_id, cloth_id, image) => {
    const safeImage = validateClothImageOrThrow(image)
    const ok = await updateClothFieldsForUser(user_id, cloth_id, { image: safeImage })
    if (!ok) return null
    return getClothByIdForUser(user_id, cloth_id)
}

const buildTypeLikeQuery = (user_id, keywords = []) => {
    const list = Array.isArray(keywords) ? keywords.filter(Boolean) : []
    if (!list.length) {
        return { sql: 'SELECT * FROM clothes WHERE user_id = ?', params: [user_id] }
    }
    const clauses = list.map(() => 'type LIKE ?').join(' OR ')
    return {
        sql: `SELECT * FROM clothes WHERE user_id = ? AND (${clauses})`,
        params: [user_id, ...list.map((k) => `%${k}%`)],
    }
}

const getTopClothesByConfig = async (user_id) => {
    const keywords = parseTypeKeywords(process.env.CLOTHES_TOP_TYPE_KEYWORDS, '\u4e0a\u8863')
    const { sql, params } = buildTypeLikeQuery(user_id, keywords)
    const result = await allServices.query(sql, params)
    return Array.isArray(result) ? result : []
}

const getBotClothesByConfig = async (user_id) => {
    const keywords = parseTypeKeywords(process.env.CLOTHES_BOTTOM_TYPE_KEYWORDS, '\u4e0b\u8863')
    const { sql, params } = buildTypeLikeQuery(user_id, keywords)
    const result = await allServices.query(sql, params)
    return Array.isArray(result) ? result : []
}

module.exports = {
    insertClothesData,
    getAllClothes,
    deleteClothes,
    updateClothes,
    getTopClothes,
    getBotClothes,
    getTopClothesByConfig,
    getBotClothesByConfig,
    getClothByIdForUser,
    deleteClothForUser,
    updateClothFieldsForUser,
    createClothForUser,
    exportClothesForUser,
    importClothesForUser,
    updateClothImageForUser,
    validateClothImageOrThrow,

}
