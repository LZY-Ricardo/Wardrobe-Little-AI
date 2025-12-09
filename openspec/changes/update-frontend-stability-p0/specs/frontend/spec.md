## ADDED Requirements

### Requirement: 受保护路由鉴权
系统必须对受保护路由进行登录状态校验，保障未登录用户无法访问业务页面。

#### Scenario: 未登录访问受保护页面
- **WHEN** 未携带有效 token 访问受保护路由
- **THEN** 重定向到 `/login` 并保留原始 redirect 以便登录后回跳

#### Scenario: 已登录访问登录页
- **WHEN** 已登录用户访问 `/login`
- **THEN** 自动跳转至 `/home` 并避免进入登录表单

### Requirement: 统一 axios 错误与刷新处理
前端请求必须统一超时与错误提示，刷新 token 需单通道，认证失效时清理状态并引导重新登录。

#### Scenario: 刷新 token 单通道
- **WHEN** 多个请求同时触发刷新 token
- **THEN** 仅发起一次刷新，其余请求等待结果，刷新失败时清理 token 并拒绝等待队列

#### Scenario: 401 认证失效
- **WHEN** 接口返回 401
- **THEN** 清理本地 token，提示登录失效并跳转 `/login`

#### Scenario: 请求错误提示
- **WHEN** 请求返回已映射的错误码或超时
- **THEN** 显示统一文案或兜底错误提示，不出现乱码

### Requirement: Recommend 可用性与降级
推荐页面必须调用 `/scene/generateSceneSuits` 渲染结果，并在异常时优雅降级。

#### Scenario: 服务可用
- **WHEN** 接口返回推荐数据
- **THEN** 展示 loading→数据列表，空数据时显示空态

#### Scenario: 服务不可用
- **WHEN** 接口异常或未就绪
- **THEN** 显示错误/灰化提示，保留页面可用，不出现白屏

### Requirement: 上传与分析降级
上传与分析链路必须提供错误提示与手动兜底，避免阻塞录入。

#### Scenario: 上传或压缩失败
- **WHEN** 文件校验、上传或压缩发生错误
- **THEN** 显示错误原因，允许重试或取消

#### Scenario: 分析能力不可用
- **WHEN** Coze 或分析服务不可用
- **THEN** 允许手动填写必要信息并提示不可用原因

### Requirement: 资源与编码一致性
Icon 与文案必须正常渲染，避免样式错乱和乱码。

#### Scenario: Icon 引用
- **WHEN** 使用 Icon 组件或 className
- **THEN** 采用正确的 className 组合与字体资源，不出现丢失或错位

#### Scenario: 文案编码
- **WHEN** 渲染文案或注释
- **THEN** 采用 UTF-8 编码，页面不出现乱码
