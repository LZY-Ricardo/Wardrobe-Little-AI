const Router = require('@koa/router')
const { getTodayWeather } = require('../controllers/weather')

const router = new Router()

router.prefix('/weather')

router.get('/today', async (ctx) => {
  const data = await getTodayWeather(ctx.query)
  ctx.body = { code: 1, msg: '获取成功', data }
})

module.exports = router
