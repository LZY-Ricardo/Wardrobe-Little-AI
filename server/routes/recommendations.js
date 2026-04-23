const Router = require('@koa/router')
const router = new Router()
const { verify } = require('../utils/jwt')
const {
  createRecommendationHistory,
  listRecommendationsForUser,
  getRecommendationDetailForUser,
  updateRecommendationAdoption,
  submitRecommendationFeedback,
} = require('../controllers/recommendations')

router.prefix('/recommendations')
router.use(verify())

router.get('/', async (ctx) => {
  const list = await listRecommendationsForUser(ctx.userId)
  ctx.body = { code: 1, data: list, msg: '获取成功' }
})

router.post('/', async (ctx) => {
  try {
    const result = await createRecommendationHistory(ctx.userId, ctx.request.body || {})
    ctx.body = { code: 1, data: result, msg: '保存成功' }
  } catch (error) {
    ctx.status = error.status || 500
    ctx.body = { code: 0, msg: error.message || '保存推荐历史失败' }
  }
})

router.get('/:id', async (ctx) => {
  const recommendationId = Number.parseInt(ctx.params.id, 10)
  if (!Number.isFinite(recommendationId)) {
    ctx.status = 400
    ctx.body = { code: 0, msg: '推荐记录 ID 无效' }
    return
  }
  const detail = await getRecommendationDetailForUser(ctx.userId, recommendationId)
  if (!detail) {
    ctx.status = 404
    ctx.body = { code: 0, msg: '推荐记录不存在' }
    return
  }
  ctx.body = { code: 1, data: detail, msg: '获取成功' }
})

router.put('/:id/adopt', async (ctx) => {
  const recommendationId = Number.parseInt(ctx.params.id, 10)
  if (!Number.isFinite(recommendationId)) {
    ctx.status = 400
    ctx.body = { code: 0, msg: '推荐记录 ID 无效' }
    return
  }
  const result = await updateRecommendationAdoption(ctx.userId, recommendationId, ctx.request.body || {})
  if (!result) {
    ctx.status = 404
    ctx.body = { code: 0, msg: '推荐记录不存在' }
    return
  }
  ctx.body = { code: 1, data: result, msg: '更新成功' }
})

router.post('/:id/feedback', async (ctx) => {
  const recommendationId = Number.parseInt(ctx.params.id, 10)
  if (!Number.isFinite(recommendationId)) {
    ctx.status = 400
    ctx.body = { code: 0, msg: '推荐记录 ID 无效' }
    return
  }
  try {
    const result = await submitRecommendationFeedback(ctx.userId, recommendationId, ctx.request.body || {})
    ctx.body = { code: 1, data: result, msg: '反馈已保存' }
  } catch (error) {
    ctx.status = error.status || 500
    ctx.body = { code: 0, msg: error.message || '提交反馈失败' }
  }
})

module.exports = router
