## Context

### 现状

AI Chat 的 SSE 流式架构如下：

```
Client (fetch + ReadableStream)
  ↔ POST /unified-agent/sessions/:id/chat-stream
    ↔ unifiedAgentRuntime.js streamReplyFromMessages()
      ↔ DeepSeek API (stream: true)
```

后端 `parseDeepSeekStreamChunk()` 已从 DeepSeek SSE 中提取 `delta.reasoning_content`。`consumeDeepSeekStream()` 通过 `onReasoning` 回调累积推理文本，但**不 emit 给客户端**。推理完成后存储在 `message.meta.reasoningContent`。

前端通过 `mapMessage()` 将持久化消息映射为 UI 对象，当前不包含 `reasoningContent` 字段。SSE 解析循环处理 `content`、`tool_call_started` 等 7 种事件类型，但不处理 `reasoning`。

### 约束

- 不修改 SSE 消息帧格式（保持 `data: JSON\n\n`）
- 不修改数据库 schema（`reasoningContent` 已通过 `meta_json` 存储）
- 不修改路由层
- 复用现有折叠 UI 模式（tool call detail block）

---

## Goals / Non-Goals

### Goals
- 将模型推理过程实时展示给用户
- 推理结束后自动折叠，保持主回复清爽
- 用户可手动展开查看完整推理过程
- 历史消息加载时恢复思考内容
- 不影响现有流式体验（无 reasoning 时行为不变）

### Non-Goals
- 不做推理过程的语法高亮或特殊渲染
- 不做思考耗时的精确计时持久化
- 不改造 autonomous tool loop 为 streaming 模式

---

## Decisions

### Decision 1: SSE 新增 `reasoning` 事件类型

- **Conclusion**: 在 `onReasoning` 回调中增加 `emit({ type: 'reasoning', text })` 调用，复用现有 SSE 帧格式
- **Reason**: 最小化改动，仅增加 1 行 emit 调用。现有 `writeSse()` 辅助函数处理 JSON 序列化和帧格式化

### Decision 2: 使用 max-height CSS 过渡实现折叠动画

- **Conclusion**: 折叠态 `max-height: 0; opacity: 0`，展开态 `max-height: 5000px; opacity: 1`，通过 CSS `transition` 动画
- **Reason**: 纯 CSS 方案无需 JavaScript 动画库或测量 DOM 高度，与项目现有 CSS Modules 模式一致

### Decision 3: 推理事件节流

- **Conclusion**: 前端对 `reasoning` 事件做 throttle（100ms），累积 token 后批量更新 `localMessages`
- **Reason**: DeepSeek 推理 token 产出速度通常比内容 token 快，不做节流可能导致 React 重渲染过于频繁。100ms 是用户感知不到延迟的安全阈值
- **Constraint**: throttle buffer 必须在以下时机立即 flush：首个 `content` 到达、`message_saved`、`error`、`AbortError`、reader `done`、组件卸载

### Decision 4: 折叠时机 — 内容到达时自动折叠

- **Conclusion**: 当第一个 `content` 事件到达（`message.content` 从空变为非空），思考块自动应用折叠样式（除非用户已手动展开过）
- **Reason**: 用户在思考阶段可能正在阅读推理过程，不应突然折叠。但如果用户没有交互，内容到达时自动折叠是自然的切换点。若用户已手动展开过，则保持展开

### Decision 5: 历史消息思考耗时估算

- **Conclusion**: 持久化消息使用字符数估算（约 30 字符/秒），streaming 消息使用 `reasoningStartTime` 时间戳计算
- **Reason**: 避免在 V1 中修改 `meta_json` schema。估算值足够给用户"思考了多久"的感知

### Decision 6: `message_saved` 后迁移思考块展开状态

- **Conclusion**: 若 streaming 占位消息在 `message_saved` 前已处于手动展开状态，则持久化消息渲染后继续保持展开
- **Reason**: 当前前端在 `message_saved` 时会清空 `localMessages` 并载入新的持久化消息对象；如果仍以消息 ID 为 key 管理展开态，必须显式迁移，否则会出现用户已展开但瞬间收起的跳变

### Decision 7: 用户取消与网络失败分开呈现

- **Conclusion**: 用户主动取消流式传输时，保留已有 `reasoningContent` 与 `content`，消息状态标记为 `cancelled`；网络错误或服务端错误标记为 `failed`
- **Reason**: “取消”是用户动作，不应被表述为失败；同时 V1 已要求保留部分推理内容，区分状态能避免误导，也更利于后续扩展重试策略

### Decision 8: reasoning 与 toolPhase 并存时的显示优先级

- **Conclusion**: 当 `reasoningContent` 与 `toolPhase` 同时存在时，思考块位于主内容区上方，工具阶段文案继续显示在思考块下方、正文上方；typing dots 在 reasoning 可见时隐藏
- **Reason**: 这样无需重构现有工具调用时间线和 `toolPhase` 逻辑，也能满足“思考优先可见”的产品目标

---

## Target Architecture

### 后端改动（极小）

```javascript
// server/controllers/unifiedAgentRuntime.js — streamReplyFromMessages()
// onReasoning 回调（约 line 743）

// BEFORE:
(reasoning) => {
  reasoningAccum += reasoning
}

// AFTER:
(reasoning) => {
  reasoningAccum += reasoning
  emit({ type: 'reasoning', text: reasoning })
}
```

### 前端数据模型扩展

```javascript
// Message 对象新增字段
{
  ...existingFields,
  reasoningContent: string,      // 累积的思考文本
  reasoningStartTime: number | null,  // 第一个 reasoning token 的时间戳
}
```

### 前端状态扩展

```javascript
const [expandedReasoning, setExpandedReasoning] = useState(new Set())
// 与 expandedToolMessages 同模式，存储展开思考块的消息 ID
```

```javascript
const reasoningFlushRef = useRef({ timer: null, buffer: '', streamMessageId: '' })
// 统一管理 reasoning throttle buffer，确保终止路径可 flush
```

---

## Data Flow

### Streaming 路径（实时思考）

```
DeepSeek API
  │ SSE chunk: delta.reasoning_content = "让我分析一下..."
  ▼
parseDeepSeekStreamChunk()
  │ returns { reasoning: "让我分析一下..." }
  ▼
consumeDeepSeekStream()
  │ calls onReasoning("让我分析一下...")
  ▼
streamReplyFromMessages()
  │ reasoningAccum += reasoning
  │ emit({ type: 'reasoning', text: reasoning })    ← NEW
  ▼
writeSse(res, data)
  │ writes "data: {\"type\":\"reasoning\",\"text\":\"...\"}\n\n"
  ▼
Client fetch ReadableStream
  │ throttled: reasoningBuffer += event.text
  │ setLocalMessages(... reasoningContent: reasoningBuffer ...)
  ▼
React renders <div class="reasoningBlock">
  │ content 仍为空 → 思考块可见（展开状态）
  │ 显示 reasoningContent + streamingCursor
  ▼
DeepSeek 切换到内容输出
  │ event.type === 'content' 到达
  │ flushPendingReasoning() 确保尾包先写入 localMessages
  │ message.content 变为非空
  │ 思考块应用 reasoningCollapsed（默认不在 expandedReasoning 集合中）
  │ CSS transition 平滑折叠
  ▼
用户点击 toggle → expandedReasoning.add(id) → reasoningExpanded
```

### 持久化路径（历史消息）

```
Session restore API: GET /unified-agent/sessions/:id
  │ Returns messages with meta_json (含 reasoningContent)
  ▼
hydrateMessage()
  │ 解析 meta_json → meta.reasoningContent
  ▼
mapMessage()
  │ reasoningContent: message.meta?.reasoningContent || ''   ← NEW
  ▼
React renders <div class="reasoningBlock">
  │ reasoningContent 非空 → 渲染思考块
  │ deliveryStatus === 'sent' → 默认折叠
  │ 显示 "思考了 X 秒 ▾"
  ▼
用户点击 toggle → 展开
  ▼
message_saved 替换本地消息
  │ stream placeholder id => persisted message id
  │ carry over expandedReasoning state if user had expanded
  ▼
思考块继续保持原展开态
```

---

## UI Design

### 思考块在消息气泡中的位置

```
┌──────────────────────────────────┐
│ 🤖 Agent                        │  ← message label
├──────────────────────────────────┤
│ ▾ 思考了 5 秒                    │  ← reasoningToggleBtn (可折叠)
│ ┌──────────────────────────────┐ │
│ │ 让我先分析一下用户的衣柜...    │ │  ← reasoningContent (折叠时隐藏)
│ │ 用户有 3 件上衣，2 条裤子...   │ │
│ │ 考虑到天气因素...             │ │
│ └──────────────────────────────┘ │
├──────────────────────────────────┤
│ 根据你的衣柜，我推荐以下搭配：    │  ← messageText (主回复)
│ 1. 白色T恤 + 牛仔裤             │
│ 2. ...                          │
└──────────────────────────────────┘
```

### 状态变化

| 阶段 | reasoningBlock | 思考块内容 | 主内容区 |
|------|----------------|-----------|---------|
| 等待首 token | 不渲染 | — | 显示 typing dots |
| 推理中 | 展开可见 | 推理文本 + streamingCursor | 隐藏 |
| 推理结束 + 内容输出 | 自动折叠 | 隐藏，显示"思考了 X 秒 ▾" | 内容 + streamingCursor |
| 流式完成 | 折叠 | 用户可点击展开 | 完整 Markdown |
| 历史消息 | 折叠 | 用户可点击展开 | 完整 Markdown |

### 视觉样式

- 思考块背景：`rgba(99, 102, 241, 0.04)`（淡靛蓝色，与 #6366f1 主色调呼应）
- 思考块边框：`1px solid rgba(99, 102, 241, 0.08)`
- 思考块文字：`#475569`（灰色，比主内容 `#1e293b` 浅一级）
- Toggle 按钮：`#94a3b8`，12px 字号
- 折叠动画：`max-height 0.3s ease, opacity 0.2s ease`

---

## Edge Cases

| 场景 | 行为 |
|------|------|
| 模型不返回 `reasoning_content`（如 `deepseek-chat`） | `reasoningContent` 为空，思考块不渲染，行为与当前一致 |
| 流中断，只有推理无内容 | 思考块保持展开（因为 `content` 从未到达），显示部分推理；网络错误标记失败，用户取消标记取消 |
| 页面刷新后恢复 | 从 `message.meta.reasoningContent` 加载，思考块默认折叠 |
| 自主工具循环路径（非 streaming） | 推理不在 token 级流出；`message_saved` 后从持久化数据加载 |
| 工具调用 + 推理同时存在 | 思考块在内容上方，`toolPhase` 文案位于思考块下方、正文上方；工具调用详情区仍按现有逻辑显示 |
| 用户在推理阶段手动展开过 | 记录在 `expandedReasoning` 中，内容到达时不自动折叠 |
| `message_saved` 到达前用户已展开 | 新持久化消息继承展开态，不发生闪收起 |
| throttle 缓冲区尚有内容时流结束 | 先 flush，再切换为 `message_saved` / `failed` / `cancelled`，不丢最后一段推理文本 |

---

## Validation Plan

1. **后端验证**：在 `streamReplyFromMessages()` 中添加 emit 后，用 curl 连接 chat-stream 端点，确认收到 `reasoning` 事件
2. **前端验证**：
   - 使用返回 `reasoning_content` 的模型测试，确认思考块实时展示
   - 确认内容到达后思考块自动折叠
   - 确认手动展开/收起正常工作
   - 确认手动展开后 `message_saved` 不会重新折叠
   - 确认刷新页面后历史消息思考块可展开
3. **降级验证**：使用 `deepseek-chat`（不返回 reasoning）测试，确认无思考块渲染，行为与改动前一致
4. **异常验证**：
   - 用户点击停止时，保留部分 reasoning，并展示取消状态而非失败
   - 网络错误时，保留部分 reasoning，并展示失败状态
5. **性能验证**：确认长推理文本不会导致前端卡顿（节流机制有效），且节流尾包在终止路径上不会丢失
