const Router = require('@koa/router')
const router = new Router()
const { verify } = require('../utils/jwt')
const {
  listOutfitLogsForUser,
  getOutfitLogDetailForUser,
  createOutfitLog,
  updateOutfitLog,
  deleteOutfitLog,
} = require('../controllers/outfitLogs')

router.prefix('/outfit-logs')
router.use(verify())

router.get('/', async (ctx) => {
  const list = await listOutfitLogsForUser(ctx.userId)
  ctx.body = { code: 1, data: list, msg: '获取成功' }
})

router.post('/', async (ctx) => {
  try {
    const result = await createOutfitLog(ctx.userId, ctx.request.body || {})
    ctx.body = { code: 1, data: result, msg: '创建成功' }
  } catch (error) {
    ctx.status = error.status || 500
    ctx.body = { code: 0, msg: error.message || '创建穿搭记录失败' }
  }
})

router.get('/:id', async (ctx) => {
  const logId = Number.parseInt(ctx.params.id, 10)
  if (!Number.isFinite(logId)) {
    ctx.status = 400
    ctx.body = { code: 0, msg: '记录 ID 无效' }
    return
  }
  const detail = await getOutfitLogDetailForUser(ctx.userId, logId)
  if (!detail) {
    ctx.status = 404
    ctx.body = { code: 0, msg: '穿搭记录不存在' }
    return
  }
  ctx.body = { code: 1, data: detail, msg: '获取成功' }
})

router.put('/:id', async (ctx) => {
  const logId = Number.parseInt(ctx.params.id, 10)
  if (!Number.isFinite(logId)) {
    ctx.status = 400
    ctx.body = { code: 0, msg: '记录 ID 无效' }
    return
  }
  try {
    const result = await updateOutfitLog(ctx.userId, logId, ctx.request.body || {})
    if (!result) {
      ctx.status = 404
      ctx.body = { code: 0, msg: '穿搭记录不存在' }
      return
    }
    ctx.body = { code: 1, data: result, msg: '更新成功' }
  } catch (error) {
    ctx.status = error.status || 500
    ctx.body = { code: 0, msg: error.message || '更新穿搭记录失败' }
  }
})

router.delete('/:id', async (ctx) => {
  const logId = Number.parseInt(ctx.params.id, 10)
  if (!Number.isFinite(logId)) {
    ctx.status = 400
    ctx.body = { code: 0, msg: '记录 ID 无效' }
    return
  }
  const ok = await deleteOutfitLog(ctx.userId, logId)
  if (!ok) {
    ctx.status = 404
    ctx.body = { code: 0, msg: '穿搭记录不存在或已删除' }
    return
  }
  ctx.body = { code: 1, msg: '删除成功' }
})

module.exports = router
