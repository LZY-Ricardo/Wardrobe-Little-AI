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
    const image = String(payload.image || '').trim()

    if (image) {
        if (!isProbablyBase64Image(image)) {
            const error = new Error('请上传图片数据')
            error.status = 400
            throw error
        }
        const imageSize = calcBase64Size(image)
        if (imageSize > MAX_IMAGE_BYTES) {
            const error = new Error('图片大小需不超过 1MB，请压缩后再上传')
            error.status = 400
            throw error
        }
    }

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

}
