## 1. Runtime 设计与接口收敛
- [x] 1.1 盘点 `unifiedAgentRuntime` 与 `autonomousToolRuntime` 的现有职责边界，整理需要保留的兼容接口
- [x] 1.2 为 autonomous runtime 设计 `onEvent` 与 `streamAssistantTurn` 接口，明确 fallback contract
- [x] 1.3 明确 `message_saved`、`task_result`、`error` 在 streaming autonomous 路径上的持久化边界
- [x] 1.4 固化 `chat-stream` 的降级优先级：adapter 不可用时保留真实 streaming，禁用 autonomous tools
- [x] 1.5 固化带 `tool_calls` 的 partial content 处理策略，并明确 terminal event 顺序 contract

## 2. 后端实现
- [x] 2.1 在 `server/agent/tools/runtime/autonomousToolRuntime.js` 中实现可选 streaming assistant turn 适配
- [x] 2.2 在 `server/controllers/unifiedAgentRuntime.js` 中接入 autonomous runtime 的统一事件出口
- [x] 2.3 恢复 `server/routes/unifiedAgent.js` 的 `chat-stream` autonomous tools 开关，并确保无 adapter 时自动降级
- [x] 2.4 如有必要，扩展 `toolEventAdapter` 以统一 tool 事件 payload，但不引入前端耦合字段

## 3. 测试
- [x] 3.1 新增 autonomous runtime 单测：流式 assistant turn 不调用工具时，应持续输出 reasoning/content 并返回最终 reply
- [x] 3.2 新增 autonomous runtime 单测：流式 assistant turn 触发 tool call 后，应输出 tool 事件并继续下一轮 assistant turn
- [x] 3.3 新增 unified runtime / route 回归测试：`chat-stream` 在开启 autonomous tools 时仍保持 token streaming
- [x] 3.4 保留并验证现有 `requestAssistantTurn` integration tests，确认 fallback 与 `/chat` 不回归
- [x] 3.5 新增高风险回归：assistant 先流出 partial content，再给出 `tool_calls`，确认 partial content 不进入最终持久化消息
- [x] 3.6 新增高风险回归：client disconnect 发生在 tool 执行中，确认只产生一个 terminal 事件且无重复保存
- [x] 3.7 验证 streaming autonomous 仍受现有轮次/时长/单工具超时预算约束

## 4. 验证
- [ ] 4.1 手工验证：普通问答在 `chat-stream` 下保持实时 reasoning/content 输出
- [ ] 4.2 手工验证：图片分析/衣橱查询等 autonomous tool 场景在 `chat-stream` 下可实时显示思考与工具阶段
- [ ] 4.3 手工验证：用户取消、网络错误、client disconnect 时，不发生重复保存或错误状态漂移
- [x] 4.4 验证：非流式 `/chat` 和历史会话恢复行为保持兼容
