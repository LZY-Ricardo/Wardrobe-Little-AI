## Context
当前统一 Agent 的 streaming 架构已经支持普通对话路径的 token 级输出：

```text
Client
  ↔ /unified-agent/sessions/:id/chat-stream
    ↔ unifiedAgentRuntime.streamReplyFromMessages()
      ↔ DeepSeek stream API
```

但 autonomous tool loop 的 assistant turn 仍采用“完整轮次决策”模式：

```text
prepareAgentMessage()
  ↔ runAutonomousToolLoop()
    ↔ defaultRequestAssistantTurn()
      ↔ createChatCompletion(stream: false)
```

因此，只要进入 autonomous 路径，就无法实时向客户端输出 reasoning/content。当前为了恢复前端流式体验，`chat-stream` 路由已临时关闭 `enableAutonomousTools`，这只是止血，不是目标架构。

## Goals / Non-Goals

### Goals
- 让 autonomous tool loop 支持 assistant turn 的流式输出
- 让 `chat-stream` 同时具备 token streaming 与自主工具调用能力
- 让普通 streaming 路径与 autonomous 路径输出统一事件协议
- 保持现有非流式 `/chat` 接口、确认流和测试替身兼容

### Non-Goals
- 不修改数据库 schema
- 不新增新的前端消息数据结构
- 不在本次将所有 runtime 重构成单一通用状态机
- 不在本次补做历史 tool trace 回放

## Decision Summary

### 决策 1：在 autonomous runtime 中引入 streaming adapter，而不是直接把逻辑塞进 unified runtime
- **结论**：`runAutonomousToolLoop()` 新增可选的 `assistantTurnAdapter` / `onEvent` 能力，由 autonomous runtime 自己处理 assistant turn 的流式采集与工具循环状态推进。
- **原因**：assistant turn、tool calls、conversation patching 都属于 autonomous runtime 的职责，把流式逻辑塞回 `unifiedAgentRuntime.js` 只会形成新的交叉耦合。

### 决策 2：保留双模式 assistant turn 接口
- **结论**：assistant turn 同时支持：
  - `requestAssistantTurn(messages, tools)`：返回完整 assistant message
  - `streamAssistantTurn({ messages, tools, onReasoning, onContent })`：流式返回 assistant turn
- **原因**：当前大量测试和兼容路径依赖 `requestAssistantTurn`，不能一次性全部改写。

### 决策 3：统一事件协议，而不是按路径各自 emit
- **结论**：autonomous 路径和普通 streaming 路径都收敛到相同的事件协议：`meta`、`reasoning`、`content`、`tool_call_started`、`tool_call_completed`、`error`、`message_saved`。
- **原因**：前端已经围绕 SSE 事件在做状态累积；协议统一后，前端不需要知道消息来自哪种 runtime。

### 决策 4：保留非流式 fallback
- **结论**：当模型、测试替身或依赖方没有提供 `streamAssistantTurn` 时，runtime 必须回落到 `requestAssistantTurn`。
- **原因**：这样可以把改造限定在 `chat-stream` 路径逐步启用，不会破坏 `/chat` 和现有 integration tests。

### 决策 5：`chat-stream` 的降级策略固定为“流式优先”
- **结论**：当 `chat-stream` 所需的 `streamAssistantTurn` adapter 不可用时，接口必须保留真实 token streaming，并临时禁用 autonomous tools；不得回退为一次性整包回复。
- **原因**：`chat-stream` 的契约是“流式输出”。若为了保留工具能力重新退化成整包响应，会直接破坏前端当前已经恢复的流式体验，并让接口语义再次摇摆。

### 决策 6：带 `tool_calls` 的 assistant turn 中，partial content 不进入最终持久化消息
- **结论**：若 assistant 在同一轮中先输出部分 `content` / `reasoning`，随后给出 `tool_calls`，则：
  - `reasoning` 可以继续作为过程展示并保留
  - 该轮已经流出的 `content` 仅视为临时展示，不写入最终持久化 assistant message
  - 工具执行后的最终 assistant reply 仍由后续无 `tool_calls` 的轮次决定
- **原因**：这能避免把“模型在发起工具前的草稿文本”错误固化进历史消息，同时保持前端对过程可见。

### 决策 7：terminal event 必须互斥，且事件顺序固定
- **结论**：V1 明确以下 contract：
  - `meta` 必须先于任何 `reasoning` / `content` / `tool_*`
  - 进入 `tool_call_started` 前，runtime 必须先 flush 当前 assistant turn 已累积的 token
  - `message_saved`、`task_result`、`error` 三者互斥，且只允许出现一个 terminal event
  - terminal event 发出后，不得继续输出 `reasoning` / `content` / `tool_*`
- **原因**：前端已基于占位消息和节流缓冲构建状态机，若 terminal 语义不严格，会出现重复保存、尾包丢失或状态错乱。

### 决策 8：streaming autonomous 继承现有运行时预算限制
- **结论**：streaming autonomous 必须继承现有 autonomous loop 的最大轮数、总时长和单工具执行超时限制，不因启用 SSE 而放宽。
- **原因**：流式只是输出方式变化，不应把原有运行时保护绕开，否则长连接风险会被放大。

## Target Architecture

### 1. 新的 assistant turn 适配接口

建议在 `server/agent/tools/runtime/autonomousToolRuntime.js` 中引入两层接口：

```js
// 兼容旧接口
requestAssistantTurn(messages, tools) => assistantMessage

// 新接口，仅供 streaming runtime 使用
streamAssistantTurn({
  messages,
  tools,
  onReasoning,
  onContent,
  isClientGone,
}) => Promise<assistantMessage>
```

其中：
- `assistantMessage` 最终仍需产出和旧接口一致的结构，用于后续 tool_calls 判断
- `onReasoning`、`onContent` 负责将 token 级内容回推给 SSE
- 对于带 tool calls 的 assistant turn，adapter 在流结束后负责解析出最终 assistant message

### 2. autonomous runtime 的事件出口

`runAutonomousToolLoop()` 新增可选 `onEvent(event)`：

```js
await runAutonomousToolLoop({
  ...,
  onEvent: (event) => {
    // reasoning/content/tool events
  },
})
```

约束：
- autonomous runtime 不直接写 SSE
- unified runtime 负责把 `onEvent` 转成 SSE `emit`
- 这样 future route / tests / non-SSE consumer 都能复用相同 runtime

### 3. unified runtime 中的分支收敛

`sendUnifiedAgentMessageStream()` 的目标结构：

1. 先准备会话、持久化 user message
2. 发出 `meta`
3. 若走普通 streaming reply：
   - 复用 `streamReplyFromMessages()`
4. 若走 autonomous tool loop：
   - 调用 `runAutonomousToolLoop({ onEvent })`
   - `onEvent` 统一发 SSE
   - 最终拿到 `reply` / `taskResult`
5. 统一落持久化消息与 `message_saved`

补充约束：
- 若当前 `chat-stream` 请求未提供 `streamAssistantTurn` 能力，则本次请求不得进入 streaming autonomous 分支
- 该情况下必须回到普通 streaming reply 分支，以保持 token streaming 契约

### 4. event adapter 的职责

如果 `toolEventAdapter.js` 已存在展示协议，应继续复用；若不足以承载 streaming assistant turn，则只做小幅扩展：
- 统一 tool start/completed 事件 payload
- 不在 adapter 内做 SSE 写入
- 不在 adapter 内耦合前端 UI 文案以外的 runtime 状态

## Data Flow

### 普通 streaming 路径

```text
user input
  → buildUnifiedMessagesForModel
  → streamReplyFromMessages
  → emit(reasoning/content)
  → append assistant message
  → emit(message_saved)
```

### autonomous streaming 路径

```text
user input
  → runAutonomousToolLoop({ onEvent, streamAssistantTurn })
    → stream assistant reasoning/content
    → if tool_calls:
         emit(tool_call_started)
         execute tool
         emit(tool_call_completed)
         continue next assistant turn
    → else:
         return final reply
  → append assistant message or task result
  → emit(message_saved / task_result)
```

### 带 `tool_calls` 的 partial output 路径

```text
assistant turn starts
  → emit(reasoning/content)
  → assistant emits tool_calls
  → flush current token buffer
  → emit(tool_call_started)
  → execute tool
  → emit(tool_call_completed)
  → discard this turn's partial content from final persisted assistant message
  → continue next assistant turn
```

说明：
- 该轮 `reasoning` 仍可用于前端过程展示与中断保留
- 该轮 `content` 仅为临时显示，不进入最终持久化 assistant 消息

## Migration Plan

### 阶段 1：引入兼容型 streaming adapter
- 为 autonomous runtime 增加 `onEvent`
- 为 assistant turn 增加 `streamAssistantTurn` 可选接口
- `chat-stream` 恢复 `enableAutonomousTools: true`，但仅在提供流式 assistant turn 时启用 streaming autonomous
- 没有 adapter 时自动 fallback

### 阶段 2：补齐事件与中断语义
- 统一 `AbortError` / client gone / server error 处理
- 明确 tool loop 中断时的持久化边界
- 补 route/controller/runtime 级回归测试

### 阶段 3：清理临时分支
- 删除为了止血而关闭 `chat-stream` autonomous 的临时逻辑
- 收敛 duplicated branch
- 更新相关 OpenSpec 任务状态与文档

## Testing Strategy
- 为 autonomous runtime 增加“流式 assistant turn + tool call + final reply”单测
- 为 unified runtime 增加“chat-stream 可同时输出 reasoning/content/tool events”的 controller 测试
- 保留现有 `requestAssistantTurn` integration tests，验证 fallback 不破
- 新增 route 级回归：`chat-stream` 恢复传入 `enableAutonomousTools: true`
- 新增高风险回归：assistant 先流出 partial content 再给出 `tool_calls`，验证中间 content 不被错误持久化
- 新增高风险回归：client disconnect 发生在 tool 执行中，验证只产生一个 terminal 结果且无重复保存
- 验证 streaming autonomous 在预算上仍受现有最大轮数/时长/工具超时约束

## Open Questions
1. 当前使用的 LLM 客户端是否需要新增专门的 `streamAssistantTurn` helper，还是直接复用 `createChatCompletion` + 本地解析？
   - 建议：先复用现有 DeepSeek stream 解析逻辑，避免重复协议实现。
