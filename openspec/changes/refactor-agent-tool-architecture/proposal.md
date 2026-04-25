# 变更：重构 Agent 工具体系架构

## Why
当前项目的 Agent 工具链已经具备可用能力，但工具定义、执行分发、确认策略、上下文注入和运行时编排仍然高度集中在少数文件中，尤其是 `server/utils/toolRegistry.js`、`server/controllers/unifiedAgentRuntime.js` 与 `server/controllers/agent.js`。

随着 Agent 正在从“少量任务增强聊天”升级为“全站业务代理入口”，继续沿用当前结构会带来几个明显问题：
- 工具数量增加后，单文件持续膨胀，职责边界变模糊
- 读工具、写工具、图片工具和上下文型工具缺少统一分类模型
- 工具权限、确认策略和上下文依赖分散在运行时代码中，不利于扩展和审计
- 新增工具时需要同时理解 registry、runtime、confirm flow 的耦合细节，维护成本高

因此，需要把当前 Agent 工具体系升级为“可扩展、可审计、可演进”的标准化架构，而不是继续在现有集中式文件上叠加能力。

## What Changes
- 将 Agent 工具体系从“集中式工具注册表 + 运行时硬编码分发”重构为“注册层 + 运行时层 + 策略层 + 工具处理层”的分层架构
- 建立统一的工具元数据模型，显式描述工具名称、业务域、风险等级、确认策略、上下文依赖与 LLM 可见性
- 将读工具、写工具、批量工具、图片理解工具纳入统一分类体系，明确每类工具的执行边界
- 将确认策略、低风险免确认、删除类强制确认、上下文注入规则从运行时代码中拆出，收敛为独立策略模块
- 将工具实际执行逻辑迁移到按业务域组织的 handler 文件，降低 `toolRegistry` 与 `agent` 主文件复杂度
- 保留现有工具名、核心接口协议和前端交互语义，采用渐进迁移方式完成兼容重构

## Impact
- Affected specs:
  - `unified-agent`
  - `task-agent`
- Affected code:
  - `server/utils/toolRegistry.js`
  - `server/controllers/unifiedAgentRuntime.js`
  - `server/controllers/agent.js`
  - `server/controllers/qwenVision.js`
  - `server/controllers/clothes.js`
  - `server/controllers/suits.js`
  - `server/controllers/outfitLogs.js`
  - `server/controllers/profileInsights.js`
  - `server/tests/agent.integration.test.js`
  - `server/tests/unifiedAgent.integration.test.js`
  - `server/tests/agentWorkflow.integration.test.js`
  - `client/src/pages/AiChat/index.jsx`
  - `client/src/pages/AiChat/index.module.less`
