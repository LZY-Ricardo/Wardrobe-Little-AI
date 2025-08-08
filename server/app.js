const Koa = require('koa')
const app = new Koa()
const userRouter = require('./routes/user')
const { bodyParser } = require('@koa/bodyparser');
const cors = require('@koa/cors')

app.use(cors()) // 允许跨域
app.use(bodyParser({
  jsonLimit: '50mb',    // JSON请求体限制50MB
  formLimit: '50mb',    // 表单请求体限制50MB
  textLimit: '50mb',    // 文本请求体限制50MB
  enableTypes: ['json', 'form', 'text']
})); // 辅助 koa 解析请求体中的数据

// 注册路由
app.use(userRouter.routes());
app.use(userRouter.allowedMethods());

// 引入配置文件
const config = require('./config')

app.listen(config.port, () => {
  console.log(`Server is running on port ${config.port}`)
})
