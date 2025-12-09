# 后端现状（server）

## 技术栈与基础
- Koa + @koa/router + @koa/bodyparser + @koa/cors + @koa/multer，mysql2 直连（无 ORM/模型），bcrypt、jsonwebtoken。
- 配置：config/index.js 读取 .env，默认 port 3000；DB 默认密码 3239468786；models/ 为空（未提供 schema）。
- 中间件：utils/jwt.verify 仅校验短 token（secret lzy，1h/7d），未做黑名单；refreshToken 仅重新签发。

## 路由与实现
- /user
  - POST /login：bcrypt 校验，返回用户基础信息 + access/refresh token。
  - POST /register：检测重名后插入（create_time=Date.now）。
  - POST /refresh_token：用 refresh_token 重签发；无黑名单。
  - 受保护：/test、/uploadPhoto(base64 入库)、/getUserInfo、/updateUserName、/updateSex、/updatePassword。
- /clothes（均需 token）
  - POST /uploadCloth：插入衣物（含 base64 图）。
  - GET /all：按 user_id 查询所有衣物。
  - DELETE /:id、PUT /:id：未校验 user_id 归属，存在越权风险。
  - GET /TopClothes、/BotClothes：SQL 使用乱码匹配（"%涓婅。%"/"%涓嬭。%"），可能导致始终查不到数据。
  - POST /analyze：multer 内存读文件，调用 Coze workflow_id，返回解析结果字符串。
  - POST /genPreview：接收 top/bottom/characterModel 文件 + sex，调用 Coze workflow2_id，返回输出字符串。
- /scene（需 token）
  - POST /generateSceneSuits：将前端 body 透传给 Coze workflow3_id，不落库、不校验。
- /chat
  - 无鉴权；将 messages 流式转发到本地 Ollama http://localhost:11434/api/chat（模型 deepseek-r1:7b），SSE 转发；无超时/限流。

## 外部依赖与前置条件
- MySQL 数据库（未提供建表 SQL，需自建 user/clothes 等表）。
- Coze PAT 与 workflow_id/workflow2_id/workflow3_id 环境变量必填，否则 analyze/genPreview/generateSceneSuits 失败。
- 本地 Ollama 服务(11434) 与 deepseek-r1:7b 模型需预先加载，否则 /chat 失败。

## 已知缺口与风险
- 衣物删除/更新缺少 user_id 归属校验，存在越权删除/修改风险。
- Top/Bot 接口匹配字符串乱码，功能可能不可用。
- /chat 未鉴权且无限制；body/multer 限制 50MB，仍可能被滥用。
- 缺少统一错误/日志处理，中间件无异常兜底；返回码简单。
- 图片、全身照采用 base64 入库，数据量大时影响性能/存储。
- 场景/搭配/分析强依赖外部服务，无降级逻辑。
