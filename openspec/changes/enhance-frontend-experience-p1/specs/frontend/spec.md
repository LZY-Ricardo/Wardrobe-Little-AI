## ADDED Requirements

### Requirement: 全局状态集中与持久化
前端 MUST 使用轻量级全局 store 统一管理用户、主题、偏好、衣物列表，并 SHALL 将 token/主题/偏好等关键 UI 状态持久化到 localStorage，应用启动时 MUST 进行 hydrate，失败时回退默认值且记录日志。
#### Scenario: 启动状态恢复
- **WHEN** 应用初始化
- **THEN** 从 localStorage 读取 token/主题/偏好并写入 store；读取失败时使用默认值并不阻塞路由
#### Scenario: 状态更新持久化
- **WHEN** token、主题或偏好更新
- **THEN** 同步写入 store 与 localStorage，路由守卫与请求读取同一来源，避免闪屏或状态漂移

### Requirement: UI 基建与懒加载骨架
前端 MUST 提供可复用的 Loading、Empty、ErrorBanner、ConfirmDialog、Skeleton 组件，路由懒加载 MUST 使用骨架屏作为 fallback，避免白屏。
#### Scenario: 统一空态/错误/重试
- **WHEN** 列表或数据请求为空或失败
- **THEN** 使用统一 Empty/ErrorBanner 渲染，并提供可选的重试回调
#### Scenario: 路由懒加载 fallback
- **WHEN** 路由组件异步加载
- **THEN** 展示 Skeleton 作为过渡，不出现空白或闪烁

### Requirement: Outfit/Home 搜索与分页体验
Outfit/Home MUST 支持搜索输入去抖（默认 300ms 可配置）、分页或无限滚动，并在加载/空态/错误时提供用户可见反馈；Home 天气/标签 SHOULD 由接口或配置驱动，接口失败 MUST 降级为静态占位。
#### Scenario: 搜索去抖与状态提示
- **WHEN** 用户输入筛选/搜索
- **THEN** 去抖后发起请求，期间展示 loading，占位为空时显示空态，失败时显示错误与重试入口
#### Scenario: 列表分页与降级
- **WHEN** Outfit 列表请求下一页或滚动触底
- **THEN** 追加数据并维护 hasMore，失败时不清空已有数据并提供重试；Home 天气/标签请求失败时回退到配置数据

### Requirement: 深色模式持久化
主题切换 MUST 写入 store 与 localStorage，并 SHALL 同步 html 的 `data-theme`，刷新后 MUST 恢复用户选择的主题。
#### Scenario: 主题切换与同步
- **WHEN** 用户切换明/暗主题
- **THEN** 立即更新 store、localStorage 和 html data-theme，组件读取到一致的主题值
#### Scenario: 刷新后恢复
- **WHEN** 用户刷新或重新打开页面
- **THEN** 读取持久化主题并应用，无需再次手动切换

### Requirement: 上传链路可靠性
上传与压缩 MUST 执行文件大小/类型前置校验，压缩参数可配置；上传 SHOULD 支持超时、重试和取消，并 MUST 在异常时给出明确文案与进度反馈。
#### Scenario: 校验与可配置压缩
- **WHEN** 选择文件触发上传
- **THEN** 校验大小/类型，不合规时阻止上传并提示；合规时按可配置压缩参数处理
#### Scenario: 超时/重试/取消
- **WHEN** 上传出现超时或失败
- **THEN** 显示错误原因，允许用户重试或取消，取消后清理进度与临时文件

### Requirement: AiChat SSE 弹性与防重复
AiChat MUST 支持 SSE 断线的指数退避重连，提供“停止生成”操作，错误时显示占位并允许重试；在连接或重试过程中 MUST 阻止重复请求或合并触发。
#### Scenario: 断线重连与停止
- **WHEN** SSE 链接中断或超时
- **THEN** 按指数退避重连并提示状态，用户可随时点击“停止生成”终止连接与重试队列
#### Scenario: 错误与重复请求防护
- **WHEN** SSE 请求失败或用户在流式过程中重复点击发送
- **THEN** 显示错误占位与重试入口，并阻止重复请求或合并为单一请求