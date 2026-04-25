## ADDED Requirements

### Requirement: Streaming Chat MUST Support Autonomous Tool Runtime
统一 Agent 的 `chat-stream` 接口 SHALL 在保持 SSE token 级输出的同时支持 autonomous tool runtime。

#### Scenario: Autonomous reply streams reasoning and content without tools
- **WHEN** 用户通过 `POST /unified-agent/sessions/:id/chat-stream` 发送一条由 autonomous runtime 直接回复的消息
- **THEN** 服务端必须持续输出 `reasoning` 和/或 `content` 事件，而不是只在结束时一次性输出完整回复
- **AND** 最终仍必须持久化 assistant 消息并发送 `message_saved`

#### Scenario: Autonomous tool loop emits tool events and resumes streaming
- **WHEN** autonomous runtime 在流式会话中决定调用工具
- **THEN** 服务端必须先输出工具阶段事件，再在下一轮 assistant turn 中继续输出后续 `reasoning` 或 `content`
- **AND** 工具调用不应导致流式接口退化为一次性整包回复

#### Scenario: Partial content before tool calls is not persisted as final assistant reply
- **WHEN** assistant 在某一轮中先流出部分 `content`，随后给出 `tool_calls`
- **THEN** 该轮已流出的 `content` 只能作为临时展示使用
- **AND** 服务端不得将其作为最终 assistant message 持久化到历史消息中
- **AND** 最终持久化的 assistant reply 必须来自后续无 `tool_calls` 的完成轮次，或由任务结果显式收束

### Requirement: Streaming Autonomous Runtime MUST Preserve Backward Compatibility
统一 Agent 的流式 autonomous runtime SHALL 对现有非流式接口、测试替身和不支持流式 assistant turn 的依赖保持兼容。

#### Scenario: Fallback to non-stream assistant turn when adapter is unavailable
- **WHEN** runtime 未提供 `streamAssistantTurn` 或当前依赖不支持流式 assistant turn
- **THEN** 服务端必须回退到现有非流式 assistant turn 路径
- **AND** `/unified-agent/sessions/:id/chat` 的现有 autonomous 行为不得被破坏

#### Scenario: chat-stream preserves token streaming when streaming autonomous is unavailable
- **WHEN** `POST /unified-agent/sessions/:id/chat-stream` 请求无法获得可用的 `streamAssistantTurn` adapter
- **THEN** 服务端必须优先保留 token 级 streaming 契约
- **AND** 该次请求不得退化为一次性整包 assistant reply
- **AND** 若需要降级，必须禁用 autonomous tools，而不是破坏流式输出语义

### Requirement: Streaming Autonomous Runtime MUST Use Stable Terminal Semantics
统一 Agent 的 streaming autonomous runtime SHALL 使用稳定且互斥的 terminal event 语义。

#### Scenario: Terminal event is unique and final
- **WHEN** 一次 streaming autonomous 请求进入完成、任务收束或错误终止状态
- **THEN** 服务端在 `message_saved`、`task_result`、`error` 中只能发送一个 terminal event
- **AND** terminal event 发出后不得继续发送新的 `reasoning`、`content` 或 `tool_*` 事件
