const Router = require('@koa/router')
const router = new Router()

const { generateSceneSuits } = require('../controllers/sceneApi')
const { verify } = require('../utils/jwt')

router.prefix('/scene')

router.post('/generateSceneSuits', verify(), generateSceneSuits)


module.exports = router

