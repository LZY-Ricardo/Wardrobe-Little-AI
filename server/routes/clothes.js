const Router = require('@koa/router')
const router = new Router()
const { analyzeClothes, generatePreview } = require('../controllers/clothesApi');
const multer = require('@koa/multer');
const upload = multer({ 
    storage: multer.memoryStorage(),
    limits: {
        fileSize: 50 * 1024 * 1024, // 50MB文件大小限制
        fieldSize: 50 * 1024 * 1024, // 50MB字段值大小限制
        fields: 20, // 最多20个非文件字段
        files: 10, // 最多10个文件
        fieldNameSize: 1000, // 字段名最大长度
        fieldValueSize: 50 * 1024 * 1024 // 字段值最大长度
    }
});
const { verify } = require('../utils/jwt')
const { insertClothesData, getAllClothes, deleteClothForUser, updateClothFieldsForUser, getTopClothes, getBotClothes } = require('../controllers/clothes')

router.prefix('/clothes')

// 分析衣物
router.post('/analyze', upload.single('image'), analyzeClothes);

// 上传衣物
router.post('/uploadCloth', verify(), async (ctx) => {
    const { name, type, color, style, season, material, image } = ctx.request.body
    const data = {
        user_id: ctx.userId,
        name,
        type,
        color,
        style,
        season,
        material,
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
        if (res) {
            ctx.body = {
                code: 1,
                msg: '获取成功',
                data: res,
            }
        } else {
            ctx.body = {
                code: 0,
                msg: '获取失败',
            }
        }
    } catch (error) {
        ctx.body = {
            code: -1,
            msg: '获取失败',
            error: error.message,
        }

    }
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
        const res = await getTopClothes(user_id)
        if (res) {
            ctx.body = {
                code: 1,
                msg: '获取成功',
                data: res,
            }
        } else {
            ctx.body = {
                code: 0,
                msg: '获取失败',
            }
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
        const res = await getBotClothes(user_id)
        if (res) {
            ctx.body = {
                code: 1,
                msg: '获取成功',
                data: res,
            }
        } else {
            ctx.body = {
                code: 0,
                msg: '获取失败',
            }
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
