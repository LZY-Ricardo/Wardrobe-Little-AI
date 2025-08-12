const Router = require('@koa/router')
const router = new Router()
const clothesController = require('../controllers/clothesApi');
const multer = require('@koa/multer');
const upload = multer({ storage: multer.memoryStorage() });
const { verify } = require('../utils/jwt')
const { insertClothesData, getAllClothes, deleteClothes, updateClothes } = require('../controllers/clothes')




router.prefix('/clothes')


// 分析衣物
router.post('/analyze', upload.single('image'), clothesController.analyzeClothes);

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
        const res = await deleteClothes(id)
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
    const { name, type, color, style, season, material, image } = ctx.request.body
    const data = {
        cloth_id,
        name,
        type,
        color,
        style,
        season,
        material,
        image,
        update_time: Date.now(),
    }
    console.log('更新衣物的信息:',data);
    try {
        const res = await updateClothes(data)
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


module.exports = router;