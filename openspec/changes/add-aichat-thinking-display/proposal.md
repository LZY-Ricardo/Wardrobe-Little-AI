# Change: AI Chat 思考过程展示

## Why

AI Chat 页面在模型生成回复时仅显示三个弹跳圆点的等待动画，用户无法感知模型的工作状态和推理过程。业界主流 AI 助手（Claude、DeepSeek、Kimi）均已支持展示模型的思考/推理过程，这不仅能减少用户等待焦虑，还能提升交互透明度和信任感。

后端已具备大部分基础设施：DeepSeek API 返回 `reasoning_content` 字段，后端已解析并累积推理内容，且持久化存储在 `message.meta.reasoningContent`。但推理内容**未通过 SSE 实时推送给客户端**，前端也**没有思考内容的 UI 展示**。

## What Changes

- **SSE 协议扩展**：新增 `reasoning` 事件类型 `{ type: 'reasoning', text: '...' }`，将模型的思考 token 实时推送给前端
- **前端思考块 UI**：在 AI 消息气泡中新增可折叠的思考过程展示区域
  - 思考阶段：实时展示推理文本 + 流式光标动画
  - 内容输出阶段：自动折叠思考块，显示"思考了 X 秒"摘要
  - 手动交互：用户可点击展开/收起查看完整思考过程
- **历史消息支持**：从 `message.meta.reasoningContent` 加载已持久化的思考内容
- **流结束一致性**：`message_saved` 替换本地 streaming 占位消息时，保留已展开的思考块状态，避免 UI 突然折叠
- **中断保留策略**：网络失败或用户取消流式传输时，都保留已累积的思考内容；用户取消与网络失败在状态文案上区分
- **节流尾包刷新**：reasoning 事件节流缓冲区在 `content` 首包、`message_saved`、`error`、流结束和 abort 时强制 flush，避免末尾推理文本丢失
- **向后兼容**：模型不返回 `reasoning_content` 时（如 `deepseek-chat`），思考块不渲染，行为与当前完全一致

## Impact

- Affected specs: `ai-chat-streaming`
- Affected code:
  - `server/controllers/unifiedAgentRuntime.js` — `streamReplyFromMessages()` onReasoning 回调增加 emit
  - `client/src/pages/AiChat/index.jsx` — mapMessage、SSE handler、思考块 JSX、expandedReasoning state
  - `client/src/pages/AiChat/index.module.less` — 思考块折叠/展开/流式样式

## Scope

### Included in V1
- SSE `reasoning` 事件推送
- 前端思考过程实时展示 + 自动折叠 + 手动展开
- 历史消息思考内容加载
- 流式中断时保留已累积的思考内容
- `message_saved` 后思考块展开状态迁移
- reasoning 与工具阶段文案并存时的稳定展示规则

### Excluded from V1
- 在 `meta_json` 中持久化思考耗时（`reasoningDurationMs`），V1 使用字符数估算
- 非 streaming 路径（autonomous tool loop）的实时思考推送
- 思考过程的语法高亮或特殊渲染（V1 使用与正文相同的 Markdown 渲染）

## Compatibility

- **SSE 协议向后兼容**：新增 `reasoning` 事件类型，旧客户端忽略未知类型不受影响
- **消息格式兼容**：`reasoningContent` 为可选字段，缺失时 UI 不渲染思考块
- **模型兼容**：`deepseek-chat` 通常不产生 `reasoning_content`，功能静默降级；`deepseek-reasoner` 可完整支持

## Risks

- **SSE 事件量增加**：推理 token 通常远多于内容 token，可能导致前端 `setLocalMessages` 调用过于频繁。缓解：对 reasoning 事件做节流（throttle），每 100ms 批量更新一次
- **大量推理文本性能**：超长推理文本的 Markdown 渲染可能造成卡顿。缓解：折叠状态下不渲染内容，展开时使用 `overflow-y: auto` 限制高度
- **本地状态迁移不完整**：streaming 占位消息 ID 与持久化消息 ID 不同，若不迁移 `expandedReasoning` 会导致用户刚展开的思考块在 `message_saved` 后重新折叠。缓解：在 `message_saved` 分支中执行展开态映射或显式继承
- **流式节流尾包丢失**：reasoning 最后一批 token 可能仍停留在 throttle buffer 中。缓解：在所有终止路径上执行 flush，并纳入验证
- **取消语义不清**：用户主动取消与网络错误若共用“失败”文案，会误导用户。缓解：区分 `cancelled` 与 `failed` 呈现，提案中明确状态要求
