# Unified Agent Shared Contract

> 目标：明确 unified-agent 在三层之间共享的最小协议，避免流式事件、数据库消息和前端展示出现结构漂移。

## 1. 三层协议边界

unified-agent 当前有三层共享协议：

1. SSE 事件层
   - 用于 `chat-stream` 期间的过程反馈
   - 以 `type` 为主键
2. 消息持久化层
   - 对应 `agent_messages`
   - 以 `role / content / message_type / confirmation_status / meta_json` 为核心
3. 前端展示层
   - 由 `AiChat/viewModels.js` 和 `sessionState.js` 消费
   - 将持久化消息映射为稳定 UI message model

这三层的原则是：

- SSE 负责“过程”
- 持久化消息负责“最终状态”
- 前端展示以持久化消息为准，不依赖瞬时 SSE 结构长期存在

## 2. SSE -> 持久化消息映射

### 2.1 过程事件

流式回复中，运行期可能发出：

- `meta`
- `reasoning`
- `content`
- `tool_call_started`
- `tool_call_completed`
- `error`

其中：

- `reasoning` / `content` 只用于流式增量展示
- `tool_call_started` / `tool_call_completed` 用于流式工具时间线
- 这些过程事件最终会被沉淀到 assistant 消息的 `meta_json` 中

### 2.2 终态事件

当 assistant 结果真正落库后，会发出：

- `message_saved`
- `task_result`

两者都会携带已持久化的 `message`，前端应优先信任这里的消息结构，而不是先前的临时 streaming state。

## 3. 持久化消息层

### 3.1 基础字段

`agent_messages` 关键字段：

- `role`
- `content`
- `message_type`
- `confirmation_status`
- `task_id`
- `meta_json`

### 3.2 `meta_json` 允许字段

只允许：

- `attachments`
- `reasoningContent`
- `actionButton`
- `pendingConfirmation`
- `toolCalls`
- `toolResultsSummary`

由后端 `server/controllers/unifiedAgentMessageMeta.js` 负责：

- 写库前归一化
- 读库后 hydration

## 4. 持久化消息 -> 前端展示映射

前端恢复链路：

1. `recent_messages`
2. `normalizeRestoredMessages`
3. `mapMessage`
4. `resolveLoadedSessionState`

最终 UI message model 关键字段：

- `content`
- `reasoningContent`
- `attachments`
- `actionButton`
- `pendingConfirmation`
- `toolCalls`
- `toolResultsSummary`
- `messageType`
- `confirmationStatus`

### 4.1 确认卡片来源

确认卡片只来源于：

- `message.meta.pendingConfirmation`

并由 `resolveLoadedSessionState` 取最近一条尚未解决的 assistant message 恢复。

### 4.2 工具时间线来源

工具时间线只来源于：

- `message.meta.toolCalls`
- streaming 期间的 `toolPhase`

一旦消息落库，前端以后端持久化的 `toolCalls` 为准。

### 4.3 工具摘要来源

工具摘要只来源于：

- `message.meta.toolResultsSummary`

### 4.4 展示文案清洗

assistant 消息最终展示前，还会做两层清洗：

1. 去掉 `TOOL_RESULT` 块
2. 去掉泄露的 JSON / code fence 结果块

因此：

- 模型偶尔输出内部结构，不会直接原样展示
- 但协议正确性仍然应以前后端不要写入脏结构为第一原则

## 5. 最小验收链

一次完整链路应满足：

1. SSE 发出 `tool_call_started`
2. SSE 发出 `tool_call_completed`
3. assistant 最终发出 `message_saved` 或 `task_result`
4. 该 `message` 落库后能恢复出：
   - 工具时间线
   - 工具摘要
   - 确认卡片或跳转按钮
   - 干净的展示文本

## 6. 当前约束

为了降低协议漂移风险，当前实现遵循：

- SSE 事件体统一由 `server/utils/unifiedAgentSseEvents.js` 构造
- assistant `meta` 统一由 `buildAssistantMessageMeta` 组装
- `meta_json` 统一由 `unifiedAgentMessageMeta.js` 清洗
- 前端统一由 `messageMeta.js` 和 `viewModels.js` 做消费侧容错

后续新增字段时，必须同步更新：

1. SSE builder
2. message meta normalizer
3. 前端 `messageMeta.js`
4. 契约测试
