const Router = require('@koa/router')
const router = new Router()
const { verify } = require('../utils/jwt')
const {
  insertSuit,
  listSuitsForUser,
  getSuitDetailForUser,
  deleteSuitForUser,
} = require('../controllers/suits')

router.prefix('/suits')

router.use(verify())

// 获取套装库列表
router.get('/', async (ctx) => {
  const userId = ctx.userId
  try {
    const suits = await listSuitsForUser(userId)
    ctx.body = { code: 1, data: suits, msg: '获取成功' }
  } catch (error) {
    ctx.status = 500
    ctx.body = { code: 0, msg: '获取套装列表失败', error: error.message }
  }
})

// 创建/收藏套装
router.post('/', async (ctx) => {
  const userId = ctx.userId
  const payload = ctx.request.body || {}
  try {
    const result = await insertSuit(userId, payload)
    const msg = result.existed ? '套装已存在，无需重复收藏' : '套装已加入套装库'
    ctx.body = { code: 1, data: result.suit, msg }
  } catch (error) {
    const status = error.code === 'INVALID_ITEMS' || error.code === 'ITEM_NOT_FOUND' ? 400 : 500
    ctx.status = status
    ctx.body = { code: 0, msg: error.message || '创建套装失败', error: error.code }
  }
})

// 获取套装详情
router.get('/:id', async (ctx) => {
  const userId = ctx.userId
  const suitId = Number.parseInt(ctx.params.id, 10)
  if (!Number.isFinite(suitId)) {
    ctx.status = 400
    ctx.body = { code: 0, msg: '套装 ID 无效' }
    return
  }
  const suit = await getSuitDetailForUser(userId, suitId)
  if (!suit) {
    ctx.status = 404
    ctx.body = { code: 0, msg: '套装不存在' }
    return
  }
  ctx.body = { code: 1, data: suit }
})

// 删除套装
router.delete('/:id', async (ctx) => {
  const userId = ctx.userId
  const suitId = Number.parseInt(ctx.params.id, 10)
  if (!Number.isFinite(suitId)) {
    ctx.status = 400
    ctx.body = { code: 0, msg: '套装 ID 无效' }
    return
  }
  const ok = await deleteSuitForUser(userId, suitId)
  if (!ok) {
    ctx.status = 404
    ctx.body = { code: 0, msg: '套装不存在或已删除' }
    return
  }
  ctx.body = { code: 1, msg: '删除成功' }
})

module.exports = router

