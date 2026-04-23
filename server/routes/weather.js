const Router = require('@koa/router')
const { getTodayWeather } = require('../controllers/weather')

const router = new Router()

router.prefix('/weather')

const hasValidCoords = (query) => {
  const lat = Number.parseFloat(query?.lat ?? query?.latitude)
  const lon = Number.parseFloat(query?.lon ?? query?.longitude)
  return (
    Number.isFinite(lat) &&
    Number.isFinite(lon) &&
    lat >= -90 &&
    lat <= 90 &&
    lon >= -180 &&
    lon <= 180
  )
}

router.get('/today', async (ctx) => {
  if (!hasValidCoords(ctx.query)) {
    ctx.body = { code: 1, msg: '需要定位权限', data: { needsGeolocation: true } }
    return
  }
  const data = await getTodayWeather(ctx.query)
  ctx.body = { code: 1, msg: '获取成功', data }
})

module.exports = router
