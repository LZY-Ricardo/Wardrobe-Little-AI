const Router = require('@koa/router')
const router = new Router()
const { analyzeClothes, generatePreview } = require('../controllers/clothesApi');
const multer = require('@koa/multer');
const upload = multer({ 
    storage: multer.memoryStorage(),
    limits: {
        fileSize: 5 * 1024 * 1024, // 5MB文件大小限制（分析/生成接口）
        fieldSize: 2 * 1024 * 1024, // 2MB字段值大小限制
        fields: 20, // 最多20个非文件字段
        files: 10, // 最多10个文件
        fieldNameSize: 1000, // 字段名最大长度
        fieldValueSize: 2 * 1024 * 1024 // 字段值最大长度
    }
});
const { verify } = require('../utils/jwt')
const {
    insertClothesData,
    getAllClothes,
    deleteClothForUser,
    updateClothFieldsForUser,
    getTopClothesByConfig,
    getBotClothesByConfig,
} = require('../controllers/clothes')
const { calcBase64Size, ensureLen, clampLen, isProbablyBase64Image } = require('../utils/validate')

router.prefix('/clothes')

const MAX_IMAGE_BYTES = 1 * 1024 * 1024

// 分析衣物
router.post('/analyze', upload.single('image'), analyzeClothes);

// 上传衣物
router.post('/uploadCloth', verify(), async (ctx) => {
    const { name, type, color, style, season, material, image } = ctx.request.body
    if (!isProbablyBase64Image(image)) {
        ctx.status = 400
        ctx.body = { code: 0, msg: '请上传图片数据' }
        return
    }
    const imageSize = calcBase64Size(image)
    if (imageSize > MAX_IMAGE_BYTES) {
        ctx.body = {
            code: 0,
            msg: '图片大小需不超过 1MB，请压缩后再上传',
        }
        return
    }

    let safeName
    let safeType
    let safeColor
    let safeStyle
    let safeSeason
    let safeMaterial
    try {
        safeName = ensureLen(name, '衣物名称')
        safeType = ensureLen(type, '衣物类型')
        safeColor = ensureLen(color, '衣物颜色')
        safeStyle = ensureLen(style, '衣物风格')
        safeSeason = ensureLen(season, '适宜季节')
        safeMaterial = clampLen(material, 64)
    } catch (error) {
        ctx.status = error.status || 400
        ctx.body = { code: 0, msg: error.message }
        return
    }
    const data = {
        user_id: ctx.userId,
        name: safeName,
        type: safeType,
        color: safeColor,
        style: safeStyle,
        season: safeSeason,
        material: safeMaterial,
        image,
        create_time: Date.now(),
        update_time: Date.now(),
    }
    console.log(data);

    try {
        const result = await insertClothesData(data)
        if (result) {
            ctx.body = {
                code: 1,
                msg: '上传成功',
            }
        } else {
            ctx.body = {
                code: 0,
                msg: '上传失败',
            }
        }
    } catch (error) {
        ctx.body = {
            code: -1,
            msg: '上传失败',
            error: error.message,
        }

    }

})

// 获取全部衣物数据
router.get('/all', verify(), async (ctx) => {
    const user_id = ctx.userId
    try {
        const res = await getAllClothes(user_id)
        ctx.body = {
            code: 1,
            msg: '获取成功',
            data: Array.isArray(res) ? res : [],
        }
    } catch (error) {
        ctx.body = {
            code: -1,
            msg: '获取失败',
            error: error.message,
        }

    }
})

// 导出衣橱（默认不包含图片，避免 payload 过大）
router.get('/export', verify(), async (ctx) => {
    const user_id = ctx.userId
    const includeImages = String(ctx.query?.includeImages || '0') === '1'
    const maxTotalBytes = Number(process.env.CLOTHES_EXPORT_MAX_BYTES) || 4 * 1024 * 1024

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
        ctx.status = 413
        ctx.body = {
            code: 0,
            msg: `导出数据过大（图片约 ${(totalImageBytes / 1024 / 1024).toFixed(2)}MB），请减少衣物数量或使用不含图片导出`,
        }
        return
    }

    ctx.body = {
        code: 1,
        msg: '导出成功',
        data: {
            exportedAt: new Date().toISOString(),
            includeImages,
            items: exportedItems,
        },
    }
})

// 导入衣橱（merge 模式，仅新增，不覆盖）
router.post('/import', verify(), async (ctx) => {
    const user_id = ctx.userId
    const payload = ctx.request.body || {}
    const rawItems = payload.items || payload.data?.items || payload
    const items = Array.isArray(rawItems) ? rawItems : []

    if (!items.length) {
        ctx.status = 400
        ctx.body = { code: 0, msg: '导入数据为空' }
        return
    }

    const hasImages = items.some((item) => Boolean(item?.image))
    const maxItems = hasImages ? (Number(process.env.CLOTHES_IMPORT_MAX_ITEMS_WITH_IMAGES) || 5) : (Number(process.env.CLOTHES_IMPORT_MAX_ITEMS) || 100)
    if (items.length > maxItems) {
        ctx.status = 400
        ctx.body = { code: 0, msg: `导入条目过多，最多支持 ${maxItems} 条` }
        return
    }

    const now = Date.now()
    let inserted = 0

    for (const item of items) {
        if (!item || typeof item !== 'object') continue

        const safeImage = item.image || ''
        if (safeImage) {
            if (!isProbablyBase64Image(safeImage)) {
                ctx.status = 400
                ctx.body = { code: 0, msg: '导入图片格式无效（需 data:image/...;base64,）' }
                return
            }
            const bytes = calcBase64Size(safeImage)
            if (bytes > MAX_IMAGE_BYTES) {
                ctx.status = 400
                ctx.body = { code: 0, msg: '导入图片大小需不超过 1MB' }
                return
            }
        }

        let safeName
        let safeType
        let safeColor
        let safeStyle
        let safeSeason
        let safeMaterial
        try {
            safeName = ensureLen(item.name, '衣物名称')
            safeType = ensureLen(item.type, '衣物类型')
            safeColor = ensureLen(item.color, '衣物颜色')
            safeStyle = ensureLen(item.style, '衣物风格')
            safeSeason = ensureLen(item.season, '适宜季节')
            safeMaterial = clampLen(item.material, 64)
        } catch (error) {
            ctx.status = error.status || 400
            ctx.body = { code: 0, msg: error.message }
            return
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

    ctx.body = { code: 1, msg: '导入完成', data: { inserted, total: items.length } }
})

// 删除衣物
router.delete('/:id', verify(), async (ctx) => {
    const id = ctx.params.id
    console.log(id);
    
    try {
        const res = await deleteClothForUser(ctx.userId, id)
        console.log('删除衣物',res);

        if (res) {
            ctx.body = {
                code: 1,
                msg: '删除成功',
            }
        } else {
            ctx.body = {
                code: 0,
                msg: '删除失败',
            }
        }
    } catch (error) {
        ctx.body = {
            code: -1,
            msg: '删除失败',
            error: error.message,
        }
    }
})

// 更新衣物
router.put('/:id', verify(), async (ctx) => {
    const cloth_id = ctx.params.id
    const payload = ctx.request.body || {}
    const patch = {}
    ;['name', 'type', 'color', 'style', 'season', 'material', 'favorite', 'image'].forEach((key) => {
        if (Object.prototype.hasOwnProperty.call(payload, key)) {
            patch[key] = payload[key]
        }
    })

    if (Object.keys(patch).length === 0) {
        ctx.body = {
            code: 0,
            msg: '未提供可更新字段',
        }
        return
    }
    if (patch.image) {
        if (!isProbablyBase64Image(patch.image)) {
            ctx.status = 400
            ctx.body = { code: 0, msg: '图片格式无效' }
            return
        }
        const imageSize = calcBase64Size(patch.image)
        if (imageSize > MAX_IMAGE_BYTES) {
            ctx.body = {
                code: 0,
                msg: '图片大小需不超过 1MB，请压缩后再更新',
            }
            return
        }
    }

    try {
        if (Object.prototype.hasOwnProperty.call(patch, 'name')) patch.name = ensureLen(patch.name, '衣物名称')
        if (Object.prototype.hasOwnProperty.call(patch, 'type')) patch.type = ensureLen(patch.type, '衣物类型')
        if (Object.prototype.hasOwnProperty.call(patch, 'color')) patch.color = ensureLen(patch.color, '衣物颜色')
        if (Object.prototype.hasOwnProperty.call(patch, 'style')) patch.style = ensureLen(patch.style, '衣物风格')
        if (Object.prototype.hasOwnProperty.call(patch, 'season')) patch.season = ensureLen(patch.season, '适宜季节')
        if (Object.prototype.hasOwnProperty.call(patch, 'material')) patch.material = clampLen(patch.material, 64)
    } catch (error) {
        ctx.status = error.status || 400
        ctx.body = { code: 0, msg: error.message }
        return
    }

    console.log('更新衣物的信息:', { cloth_id, ...patch });
    try {
        const res = await updateClothFieldsForUser(ctx.userId, cloth_id, patch)
        console.log('更新衣物的结果:',res);
        if (res) {
            ctx.body = {
                code: 1,
                msg: '更新成功',
            }
        } else {
            ctx.body = {
                code: 0,
                msg: '更新失败',
            }
        }
    } catch (error) {
        ctx.body = {
            code: -1,
            msg: '更新失败',
            error: error.message,
        }
    }
})

// 获取上衣数据
router.get('/TopClothes', verify(), async (ctx) => {
    const user_id = ctx.userId
    try {
        const res = await getTopClothesByConfig(user_id)
        ctx.body = {
            code: 1,
            msg: '获取成功',
            data: Array.isArray(res) ? res : [],
        }
    } catch (error) {
        ctx.body = {
            code: -1,
            msg: '获取失败',
            error: error.message,
        }
    }
})

// 获取下衣数据
router.get('/BotClothes', verify(), async (ctx) => {
    const user_id = ctx.userId
    try {
        const res = await getBotClothesByConfig(user_id)
        ctx.body = {
            code: 1,
            msg: '获取成功',
            data: Array.isArray(res) ? res : [],
        }
    } catch (error) {
        ctx.body = {
            code: -1,
            msg: '获取失败',
            error: error.message,
        }
    }
})

// 生成搭配预览图
router.post('/genPreview', upload.fields([{ name: 'top', maxCount: 1 }, { name: 'bottom', maxCount: 1 },{ name: 'characterModel', maxCount: 1 }]), generatePreview)






module.exports = router;
