## MODIFIED Requirements
### Requirement: 统一 Agent MUST 成为项目级统一操作入口
系统 MUST 允许用户通过 unified-agent 访问项目中的核心业务能力，使衣橱、套装、推荐、穿搭记录、画像与预览等操作都能在统一会话中被代理执行。统一 Agent 接收页面上下文与回流页面状态时 MUST 优先遵循统一协议 `agentContext`。

#### Scenario: unified-agent 使用统一协议恢复初始上下文
- **WHEN** unified-agent 或 AiChat 会话从页面 state 恢复上下文
- **THEN** 系统优先从 `agentContext.latestTask`、`agentContext.focus`、`agentContext.draft`、`agentContext.insight` 和 `agentContext.attachments` 中恢复状态

#### Scenario: Agent 结果按钮按统一协议回流页面
- **WHEN** Agent 回复中生成可跳转的页面操作按钮
- **THEN** 系统在按钮 state 中优先输出统一协议，以便目标页面按统一方式消费返回对象
