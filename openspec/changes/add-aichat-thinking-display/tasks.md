## 1. 后端：SSE 推理事件推送

- [ ] 1.1 在 `server/controllers/unifiedAgentRuntime.js` 的 `streamReplyFromMessages()` 函数中，`onReasoning` 回调内添加 `emit({ type: 'reasoning', text: reasoning })` 调用

## 2. 前端数据层

- [ ] 2.1 在 `client/src/pages/AiChat/index.jsx` 的 `mapMessage()` 中添加 `reasoningContent` 字段提取（`message.meta?.reasoningContent || ''`）
- [ ] 2.2 添加 `expandedReasoning` state（`useState(new Set())`）
- [ ] 2.3 在 `streamPlaceholder` 对象中添加 `reasoningContent: ''` 和 `reasoningStartTime: null` 字段
- [ ] 2.4 在 `sendMessage()` 中添加 `let reasoningText = ''` 和 `let reasoningStartTime = null` 累积变量
- [ ] 2.5 在 SSE 解析循环中添加 `event.type === 'reasoning'` 分支，累积推理文本并更新 `localMessages`
- [ ] 2.6 实现推理事件节流（100ms throttle），批量更新 `localMessages`
- [ ] 2.7 为 throttle 增加统一 flush 逻辑，在 `content` 首包、`message_saved`、`error`、reader `done`、`AbortError`、组件卸载时写回最后一批 reasoning
- [ ] 2.8 在 `message_saved` 替换 streaming 占位消息时，迁移 `expandedReasoning` 的展开状态到持久化消息 ID

## 3. 前端 UI

- [ ] 3.1 添加 `computeReasoningSeconds(message)` 辅助函数（streaming 用时间戳，持久化用字符数估算）
- [ ] 3.2 在助手消息气泡 JSX 中，`messageText` 之前插入思考块（reasoningBlock）
  - 条件渲染：`message.role === 'assistant' && message.reasoningContent`
  - Toggle 按钮：展开/收起切换
  - 内容区域：折叠态 `reasoningCollapsed`，展开态 `reasoningExpanded`
  - 推理阶段流式光标：`deliveryStatus === 'streaming' && !message.content`
- [ ] 3.3 内容到达时自动折叠逻辑（依赖 CSS class，不需要额外 JS）
- [ ] 3.4 明确 `reasoningContent` 与 `toolPhase` 并存时的渲染顺序：思考块在上，工具阶段文案在下，typing dots 隐藏
- [ ] 3.5 区分 `failed` 与 `cancelled` 呈现；用户取消流时保留部分 reasoning/content，不直接移除流式消息

## 4. CSS 样式

- [ ] 4.1 在 `client/src/pages/AiChat/index.module.less` 中添加思考块样式：
  - `.reasoningBlock` — 容器
  - `.reasoningToggleBtn` — 切换按钮（灰色、12px）
  - `.reasoningCollapsed` — 折叠态（`max-height: 0; opacity: 0; transition`）
  - `.reasoningExpanded` — 展开态（`max-height: 5000px; opacity: 1; overflow-y: auto; transition`）
  - `.reasoningContent` — 内容区（淡靛蓝背景、灰色文字、13px）

## 5. 验证

- [ ] 5.1 后端验证：curl 连接 chat-stream 端点，确认收到 `reasoning` 事件
- [ ] 5.2 前端验证（推理模型）：思考块实时展示 → 内容到达自动折叠 → 手动展开/收起
- [ ] 5.3 前端验证（降级）：使用 `deepseek-chat` 测试，确认无思考块渲染
- [ ] 5.4 前端验证（历史消息）：刷新页面后思考块可展开
- [ ] 5.5 前端验证（状态迁移）：在 streaming 阶段手动展开思考块，等待 `message_saved`，确认展开状态不丢失
- [ ] 5.6 前端验证（用户取消）：取消流式传输，确认部分推理内容保留且消息显示取消状态
- [ ] 5.7 前端验证（异常失败）：模拟网络错误/服务端错误，确认部分推理内容保留且消息显示失败状态
- [ ] 5.8 前端验证（throttle 尾包）：构造短 reasoning + 快速结束场景，确认最后一段 reasoning 不丢失
