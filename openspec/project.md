# 项目上下文

## 目标
- 构建面向移动端的智能穿搭 AI 平台，提供对话式搭配建议、衣橱管理和场景化推荐。
- 融合视觉与语义信息，结合大语言模型输出个性化风格指导。

## 技术栈
- 前端：Vite + React 18 SPA，React Router v7，Ant Design Mobile + React Vant，Axios，Less，postcss-px-to-viewport（375 基准），React Markdown/remark/rehype 解析说明。
- 后端：Node.js + Koa 3，@koa/router、@koa/bodyparser、@koa/cors、@koa/multer，JWT + bcrypt 认证，MySQL2 数据访问，dotenv 管理配置，Axios 代理下游。
- 工具/运行：ESLint 9（JS/JSX 推荐规则），Vite 开发/构建，nodemon 热重载，API SSE 流式推送（聊天）。

## 项目约定
### 代码风格
- JavaScript/JSX + ES Modules，组件/页面使用 PascalCase，变量/函数 camelCase，常量允许大写（ESLint 已忽略 `^[A-Z_]` 未使用警告）。
- 样式使用 Less，移动端使用 px→vw（postcss-px-to-viewport，设计稿宽度 375）；优先组件内样式隔离，避免全局泄漏。
- 前端接口通过 `src/api` 封装 Axios；开启请求/响应拦截；路由集中于 `src/router`。
### 架构模式
- 前端：Vite 单页应用；目录分层 `pages/`（页面）、`components/`（通用 UI）、`assets/`、`router/`（路由表）、`store/`、`utils/`、`api/`；移动优先视口适配。
- 后端：Koa 分层 `routes` → `controllers` → `models` → `utils`，配置在 `config/`，静态资源 `public/`；注册路由包括用户、服饰、场景、聊天；聊天路由通过 SSE 转发到本地 Ollama。
- 配置依赖 `server/.env`（数据库、JWT、第三方地址），默认 CORS 放开；请求体限 50MB。
### 测试策略
- 暂无自动化测试；提交前至少运行 `npm run lint`（前端），后端以 `npm run dev` 冒烟。
- 建议手动回归：登录/注册、衣物录入与列表、场景选择、AI 聊天生成搭配、图片上传（如有）。
### Git 工作流
- 仓库未声明强制分支策略；推荐特性分支开发，提交信息使用祈使句或 Conventional Commits，合入前保持 lint 通过。

## 业务领域上下文
- 提供个性化穿搭建议的 AI 助手，支持移动端使用；核心实体包含用户、衣物/风格标签、场景、对话消息。
- 通过本地 LLM（Ollama deepseek-r1）结合衣橱/场景信息生成搭配建议和解释。

## 重要约束
- 所有 openspec 相关文档的撰写与生成必须使用中文。
- 移动端 375 设计基准，px 自动转 vw；注意保持组件在不同设备上的响应式体验。
- 聊天接口依赖 SSE，前后端需保持流式连接；请求/上传大小受 50MB 限制。
- 密钥与数据库配置存放 `server/.env`，禁止入库；对外接口需保持 CORS/鉴权配置一致。
- 前后端 API 基址需同步；MySQL 连接、Ollama 服务地址需可配置。

## 外部依赖
- MySQL 数据库（通过 `mysql2` 访问；连接信息来自 `.env`）。
- 本地 Ollama 服务 `http://localhost:11434/api/chat`，默认模型 `deepseek-r1:7b`，使用 SSE 流式响应。
- JWT 签发/校验、bcrypt 密码哈希；文件上传依赖 `@koa/multer`（需做类型/大小检查）。
