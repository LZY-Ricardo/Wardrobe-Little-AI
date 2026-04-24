# Change: 增强统一 Agent 的会话标题与摘要生成

## Why
当前统一长对话式 Agent 已具备会话持久化、会话恢复、最近 12 轮完整上下文与自动摘要更新能力，但会话标题和会话摘要仍主要依赖规则生成。标题当前更接近“首条消息截断版”，摘要当前更接近“旧消息拼接压缩版”。这虽然足以支撑基本恢复，但不够智能，也难以在产品体验和答辩展示上体现统一 Agent 的“理解能力”。

为了让统一 Agent 的会话管理更接近真实智能体，需要引入 LLM 驱动的会话标题生成和结构化摘要生成，同时保留规则降级兜底。这样即使模型暂时不可用，系统仍能继续工作；而在模型可用时，标题和摘要会更准确地反映会话主题、关键约束、当前目标和待办动作。

## What Changes
- 新增会话标题生成器：基于最近对话内容生成简洁、主题化的标题。
- 新增结构化摘要生成器：输出 `summary`、`key_facts`、`active_goals`、`pending_actions` 等结构化摘要内容。
- 新增模型不可用时的规则降级逻辑，确保标题和摘要生成不会阻塞统一 Agent 的核心功能。
- 更新统一 Agent 的摘要刷新逻辑，在满足触发条件时优先走 LLM 生成，否则回退规则摘要。

## Impact
- Affected specs: `unified-agent`
- Affected code:
  - Backend: `unifiedAgent.helpers`、`unifiedAgentRuntime`、DeepSeek 调用封装
  - Database: 复用现有 `agent_sessions`、`agent_session_memory`，不新增表
  - Frontend: 会话列表标题展示、统一会话摘要展示会感知更智能的内容

## Non-Goals
- 不引入 RAG 平台
- 不改变会话恢复的数据结构
- 不在本次变更中引入多模型路由策略
