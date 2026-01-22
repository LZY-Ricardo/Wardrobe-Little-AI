// 引入配置文件（会加载 .env）
const config = require('./config')

const Koa = require('koa')
const app = new Koa()
const errorHandler = require('./middleware/errorHandler')
const requestContext = require('./middleware/requestContext')
const requestLogger = require('./middleware/logger')
const rateLimit = require('./middleware/rateLimit')
const userRouter = require('./routes/user')
const clothesRouter = require('./routes/clothes')
const sceneRouter = require('./routes/scene')
const chatRouter = require('./routes/chat')
const weatherRouter = require('./routes/weather')
const suitsRouter = require('./routes/suits')
const { bodyParser } = require('@koa/bodyparser');
const cors = require('@koa/cors')

app.use(errorHandler())
app.use(requestContext())
app.use(requestLogger())
app.use(rateLimit())
app.use(cors()) // 允许跨域
app.use(bodyParser({
  jsonLimit: '5mb',    // JSON请求体限制5MB
  formLimit: '5mb',    // 表单请求体限制5MB
  textLimit: '5mb',    // 文本请求体限制5MB
  enableTypes: ['json', 'form', 'text']
})); // 辅助 koa 解析请求体中的数据

// 图片数据现在直接从数据库返回，不再需要静态文件服务

app.use(userRouter.routes());
app.use(userRouter.allowedMethods());
app.use(clothesRouter.routes());
app.use(clothesRouter.allowedMethods());
app.use(sceneRouter.routes());
app.use(sceneRouter.allowedMethods());
app.use(chatRouter.routes());
app.use(chatRouter.allowedMethods());
app.use(weatherRouter.routes());
app.use(weatherRouter.allowedMethods());
app.use(suitsRouter.routes());
app.use(suitsRouter.allowedMethods());
app.listen(config.port, () => {
  console.log(`Server is running on port ${config.port}`)
})
