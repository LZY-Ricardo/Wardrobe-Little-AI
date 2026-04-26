## MODIFIED Requirements
### Requirement: 系统 MUST 提供任务型 Agent 统一入口
系统 MUST 提供统一 Agent 页面、全局入口和业务页面快捷入口，使用户能够在不同页面上下文中通过文字、图片或图文组合发起任务，并逐步替代项目中的手动页面操作。页面带入 Agent 的上下文信息 MUST 通过统一协议传递，而不是持续扩散零散顶层字段。

#### Scenario: 页面通过统一协议携带当前对象进入 Agent
- **WHEN** 用户从衣橱、套装、穿搭记录、推荐历史或洞察页面进入 unified-agent
- **THEN** 系统通过统一的 `agentContext` 结构传递当前焦点对象、草稿、洞察或附件上下文

#### Scenario: 历史入口仍可兼容旧字段
- **WHEN** 某些旧页面或历史导航 state 仍使用旧字段命名
- **THEN** 系统仍能恢复正确上下文，但新的写入路径必须优先输出统一协议
