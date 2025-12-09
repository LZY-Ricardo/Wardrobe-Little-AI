# 前端完善与扩展方案

## 背景与目标
- 以稳定可用为先，补齐鉴权、错误处理与缺失功能，再逐步提升体验和扩展 AI/场景能力。
- 约束：前端 React 18 + Vite + antd-mobile/react-vant，后端 JWT + Coze/Ollama 可能未就绪，需做好降级。

## 现状痛点摘要
- 鉴权缺失：无路由守卫，token 过期仅靠拦截器，未登录可访问业务页，登录页未阻止已登录用户。
- 错误与编码：axios 文案乱码，错误码提示不统一；外部请求缺少超时/重试/降级。
- 功能空白：Recommend 未渲染 /scene/generateSceneSuits；Home 天气/标签静态；Outfit 无空态/分页；Match 未做人物信息校验；AiChat 无加载/错误/断线处理。
- 上传与分析：Add/Update 仅同步校验，缺少异常分支、上传/压缩失败提示；Coze 不可用时无手动兜底。
- UI/体验：Icon className 组合异常；深色模式未持久化；缺少复用的 Loading/Empty/Error 组件；搜索/筛选无去抖与状态提示。

## 迭代优先级（建议先 P0 再 P1/P2）
### P0 近期（稳定性/必需）
- 路由守卫：受保护路由检查 access/refresh token，未登录重定向 /login，已登录访问 /login 跳 /home。
- axios 实例：统一超时、错误码到文案映射；刷新 token 加入队列防重入；401 失败时清理并跳登录；全局 loading/错误提示钩子。
- Recommend 打通：调用 /scene/generateSceneSuits，渲染列表；增加 loading/错误/空态；无服务时提示或灰化。
- Add/Update 校验：补充异步错误处理、上传/压缩/分析失败提示；Coze 不可用时允许手填并提示原因。
- Icon/乱码：修正 icon className 与字体引用；统一文件/注释编码为 UTF-8，清理乱码文案。

### P1 近中期（体验与效率）
- 全局状态：用轻量 store（如 zustand 或 RTK）集中管理用户/主题/偏好/衣物列表，持久化 token 与部分 UI 状态。
- UI 基建：封装 Loading/Empty/ErrorBanner/ConfirmDialog/Skeleton；路由懒加载 fallback 使用骨架屏。
- Outfit/Home：搜索去抖与分页/无限滚动，空态与错误提示；Home 天气/标签改为接口或配置驱动。
- 深色模式：状态写入 store + localStorage，并同步到 html data-theme。
- 上传可靠性：限制文件大小类型，压缩参数可配置，超时/重试/取消上传。
- AiChat：SSE 断线重连（指数退避），手动停止按钮，错误提示与占位，防重复请求。

### P2 拓展（能力/业务）
- 场景推荐：历史场景列表、收藏/编辑套装、快速应用到 Outfit；支持一键生成分享图。
- 套装管理：在 Outfit 增加“保存搭配”与“我的套装”列表，支持备注/标签。
- 个人画像：在 Person 增加尺码/肤色/喜好标签，供 Recommend/Match 使用；可选择体型模型。
- 观察与埋点：关键链路日志/埋点，捕获失败率与耗时，为后续优化提供数据。

## 技术方案建议
- axios 封装：单独导出实例，设置 baseURL/env、超时、错误码 map；刷新 token 用 Promise 队列，失败时清理并重定向；对文件上传设置更长超时。
- 路由守卫：实现 ProtectedRoute/HOC，读取 store/localStorage 判断登录；缺 token 跳 /login 并带 redirect；登录状态访问 /login 自动跳 /home。
- 全局状态：authStore（token/userInfo/refresh actions）、uiStore（theme/loading/toast config）、closetStore（衣物列表/筛选条件）。初始化时从 localStorage hydrate。
- UI 组件：
  - Loading/Skeleton/Empty/ErrorBanner/ConfirmDialog 复用组件。
  - Icon 组件重构 className 组合，确保字体文件引入一次。
- 上传/分析链路：封装 upload helper，包含文件校验、压缩（质量/尺寸参数）、进度/取消、错误提示；分析失败时开启“手动填写”模式。
- Recommend：调用接口后将结果映射为卡片；历史场景存 store/localStorage；无服务时展示说明和 mock 示例。
- Match：检测 person 信息缺失时禁用生成并引导；生成预览使用 AbortController 支持取消，增加 loading/错误提示和占位图。
- Outfit/Home：筛选与搜索去抖，分页/无限滚动，空态与“重试”按钮；Home 天气可先用配置或后端接口。
- AiChat：SSE 封装 hook（状态：connecting/streaming/error）；支持停用流、重连、错误占位，不在接口缺失时白屏。

## 里程碑拆分
- M1 稳定性：路由守卫 + axios 封装 + Recommend 打通 + Add/Update 异常提示 + Icon/乱码修复。
- M2 体验：全局 store + UI 基建组件 + Outfit/Home 搜索与分页 + 深色模式持久化 + 上传可靠性增强 + AiChat 断线重连。
- M3 拓展：场景推荐收藏/套装库 + 个人画像扩展 + 分享/埋点能力。

## 依赖与风险
- 外部服务（Coze/Ollama）不可用时需灰化或 mock，避免阻塞主流程。
- 后端需提供天气/标签/场景数据接口；若短期无，前端用配置或占位。
- 大文件上传/压缩需关注移动端性能与耗电，可限制最大尺寸并提供进度与取消。
