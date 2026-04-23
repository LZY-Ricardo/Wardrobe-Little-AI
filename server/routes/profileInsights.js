const Router = require('@koa/router')
const router = new Router()
const { verify } = require('../utils/jwt')
const {
  getProfileInsight,
  refreshProfileInsight,
  gatherSourceData,
  buildWardrobeAnalytics,
} = require('../controllers/profileInsights')

router.prefix('/profile-insights')
router.use(verify())

router.get('/', async (ctx) => {
  const data = await getProfileInsight(ctx.userId, {
    forceRefresh: String(ctx.query?.refresh || '0') === '1',
  })
  ctx.body = { code: 1, data, msg: '获取成功' }
})

router.post('/refresh', async (ctx) => {
  const data = await refreshProfileInsight(ctx.userId)
  ctx.body = { code: 1, data, msg: '刷新成功' }
})

router.get('/analytics', async (ctx) => {
  const sourceData = await gatherSourceData(ctx.userId)
  const data = buildWardrobeAnalytics({
    clothes: sourceData.clothes,
    outfitLogs: sourceData.outfitLogs,
    recommendations: sourceData.recommendations,
  })
  ctx.body = { code: 1, data, msg: '获取成功' }
})

module.exports = router
