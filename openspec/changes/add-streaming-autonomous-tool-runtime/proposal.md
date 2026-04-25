# Change: 为统一 Agent 引入可流式的 autonomous tool runtime

## Why
当前统一 Agent 的流式接口 `/unified-agent/sessions/:id/chat-stream` 在接入 autonomous tool loop 后，assistant turn 仍通过非流式 `createChatCompletion(... stream: false)` 生成，导致工具决策完成后只能一次性回推完整回复。为了临时恢复前端的 token 级流式体验，当前实现已将 `chat-stream` 路径的 `enableAutonomousTools` 关闭，这又造成了“流式回复”和“自主工具调用”二选一的问题。

这种分裂会直接影响用户体验和系统能力边界：
- 用户在流式会话中无法继续使用自主工具能力，例如图片分析、衣橱查询、推荐落库等
- 前端新增的思考过程展示只能覆盖普通 streaming 路径，无法覆盖 autonomous 路径
- 后端为了兼容两套路径，不得不在路由层切换行为，后续扩展成本高

因此，需要将 autonomous tool runtime 升级为“既能自主调用工具，又能持续向 SSE 输出 reasoning/content/tool events”的流式架构。

## What Changes
- 为 autonomous tool runtime 新增可选的流式事件适配接口，使 assistant turn 可以边生成边输出 `reasoning` 与 `content`
- 统一普通 streaming 路径与 autonomous 路径的 SSE 事件协议，确保前端无需按运行时分叉处理
- 恢复 `/unified-agent/sessions/:id/chat-stream` 的 autonomous tools 能力，同时保持 token 级流式回复
- 保持 `/unified-agent/sessions/:id/chat` 非流式接口和现有 `requestAssistantTurn` 测试替身兼容
- 将本次改造约束在运行时层与路由层，不修改数据库 schema、不重写前端消息模型

## Impact
- Affected specs:
  - `unified-agent`
  - `ai-chat-streaming`
- Affected code:
  - `server/routes/unifiedAgent.js`
  - `server/controllers/unifiedAgentRuntime.js`
  - `server/agent/tools/runtime/autonomousToolRuntime.js`
  - `server/agent/tools/runtime/toolEventAdapter.js`
  - `server/tests/unifiedAgent.integration.test.js`
  - `server/tests/unifiedAgentStream.test.js`
  - `server/tests/unifiedAgentRoute.test.js`

## Scope

### Included in V1
- assistant turn 的 streaming adapter
- autonomous runtime 向 SSE 输出 `reasoning` / `content` / tool phase 事件
- `chat-stream` 恢复 autonomous tools
- 非流式接口兼容
- 中断、错误、message_saved 持久化语义保持一致

### Excluded from V1
- 数据库存储更细粒度的 tool trace
- 引入新的前端可视化组件或 timeline 布局
- 将所有 runtime 全部重写为单一状态机
- 跨会话的长时自治调度

## Compatibility
- `/sessions/:id/chat` 保持原有 autonomous 行为，不要求 token streaming
- `requestAssistantTurn` 若仅支持返回完整 assistant message，仍可在非流式模式下工作
- 旧客户端继续消费已有 SSE 事件；新增事件类型必须保持向后兼容
- 当模型或测试替身不支持 streaming assistant turn 时，runtime 必须降级到现有非流式 assistant turn 路径
- `chat-stream` 的降级优先级必须固定为“保留真实 token streaming 优先于保留 autonomous tools”；当流式 assistant turn adapter 不可用时，`chat-stream` 必须禁用 autonomous tools，而不能退化回一次性整包回复

## Risks
- **运行时职责继续膨胀**：若直接在 `unifiedAgentRuntime.js` 内堆 streaming 细节，会加重耦合。缓解：把流式 assistant turn 适配收敛到 autonomous runtime 内部接口。
- **中断语义不一致**：流式 assistant turn、tool loop 和 SSE 持久化若终止点不一致，可能出现重复保存或半截消息。缓解：统一 finish/abort contract，并补定向回归测试。
- **测试替身兼容性**：现有 `requestAssistantTurn` 大量测试返回的是完整 message，而不是流。缓解：保留非流式 fallback，新增流式专用注入接口。
- **工具事件顺序漂移**：autonomous 路径接入 streaming 后，tool 事件与 reasoning/content 事件交错，可能影响前端假设。缓解：定义稳定事件顺序和最小协议。
- **partial output 语义不清**：assistant 在同一轮中若先流出部分 content 后再发起 `tool_calls`，若没有统一规则，会导致前端显示内容与持久化内容不一致。缓解：V1 明确规定这类中间 content 仅作为临时展示，不进入最终 assistant message 持久化。
- **长 SSE 会话资源占用**：streaming autonomous 会把多轮 assistant/tool 循环拉进单次连接，若没有预算限制，容易放大超时和资源占用问题。缓解：继承现有 autonomous loop 的轮次/时长/单工具超时限制，并把它们视为 streaming 模式下的强约束。
