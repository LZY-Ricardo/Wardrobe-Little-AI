## ADDED Requirements
### Requirement: unified-agent MUST 使用分层工具体系进行运行时编排
系统 MUST 使用分层的 Agent 工具体系完成 unified-agent 的工具编排，至少包含注册层、运行时层、策略层和工具处理层，并避免将工具定义、权限判断和业务执行继续集中堆叠在单一文件中。

#### Scenario: unified-agent 通过注册层获取工具目录
- **WHEN** unified-agent 需要向 LLM 暴露可调用工具
- **THEN** 系统从统一注册层读取工具目录，而不是在运行时代码中手工拼装多个来源的工具定义

#### Scenario: unified-agent 通过执行路由调用工具 handler
- **WHEN** LLM 发起某个已登记工具调用
- **THEN** 系统通过统一执行路由将请求分发到对应业务域的 handler，而不是在单个注册表文件中堆叠大量 if/else 分发逻辑

#### Scenario: unified-agent 通过事件适配层输出工具过程状态
- **WHEN** 工具调用开始、完成、失败或进入待确认状态
- **THEN** 系统通过统一事件适配层输出标准工具事件与展示摘要，而不是在多个运行时分支中分别拼装前端依赖字段

### Requirement: unified-agent MUST 基于工具元数据决定工具暴露与执行路径
系统 MUST 为每个 Agent 工具维护统一元数据，并基于这些元数据决定是否向 LLM 暴露、是否允许执行、是否进入确认流以及需要注入哪些上下文。

#### Scenario: runtime 基于 metadata 过滤工具可见性
- **WHEN** unified-agent 为当前会话构建 LLM tool schema
- **THEN** 系统根据工具元数据和当前会话上下文过滤工具，而不是仅依赖硬编码规则决定哪些工具可见

#### Scenario: runtime 基于 metadata 决定执行路径
- **WHEN** LLM 调用了某个写工具或批量写工具
- **THEN** 系统根据该工具的 `mode`、`dangerous` 和 `confirmationPolicy` 决定直接执行、进入确认或拒绝执行

### Requirement: unified-agent MUST 保持现有工具协议的兼容迁移
系统 MUST 在重构工具体系时保持现有工具名、核心输入输出协议和前端确认交互语义的兼容性，并通过兼容层实现渐进迁移。

#### Scenario: 旧工具名在重构后仍然可被 runtime 调用
- **WHEN** unified-agent 或测试代码通过现有工具名调用标准工具
- **THEN** 系统仍能成功解析并执行该工具，而不是要求前端或测试同步改写所有工具调用名称

#### Scenario: 前端确认与工具结果展示保持兼容
- **WHEN** 写操作在重构后进入统一确认流
- **THEN** 前端仍能收到兼容的 confirmation payload、工具状态和结果摘要，而无需改变核心交互协议

#### Scenario: 重构期间兼容层不得继续吸收新业务逻辑
- **WHEN** 系统处于工具架构迁移阶段
- **THEN** 兼容层仅允许做转发、兼容导出与迁移适配，不允许继续承载新增业务执行逻辑
