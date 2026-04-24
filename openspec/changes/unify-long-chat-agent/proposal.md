# Change: 融合长对话助手与任务型 Agent

## Why
当前项目同时存在 `/chat` 长对话助手和 `/agent` 任务型 Agent 两条并行能力链路。前者更擅长连续对话、LLM 驱动理解和工具调用，后者更擅长结构化任务执行、确认门控和系统级入口。但两者分离会带来明显问题：用户需要理解两个入口的区别，会话与任务历史彼此割裂，长期偏好和上下文无法统一复用，也不利于论文中将系统定义为“一个统一的智能体”。

为了让系统更符合“基于 AI 的智能穿搭管理系统”这一题目，需要将这两条能力线融合为一个统一的长对话式 Agent。该 Agent 既要支持最近 12 轮完整对话、多轮澄清和会话恢复，也要支持工具调用、任务规划、写操作确认和长期偏好记忆，从而真正成为系统级智能中枢。

## What Changes
- 新增统一长对话式 Agent 能力，逐步替代当前 `/chat` 与 `/agent` 的并行入口。
- 新增会话持久化能力，包括会话表、消息表和会话摘要表，用于保存历史对话并支持会话恢复。
- 新增分层记忆架构：最近 12 轮完整消息、会话摘要记忆、长期偏好记忆。
- 新增统一任务规划与对话流转机制，支持普通问答、查询任务、推荐任务、写操作任务和多轮澄清。
- 新增统一页面结构与会话历史展示，使用户在一个主入口中同时完成连续对话与系统功能操作。

## Impact
- Affected specs: `unified-agent`
- Affected code:
- Frontend: 统一 Agent 页面、会话列表、会话恢复、确认卡片、快捷入口重定向
- Backend: 会话持久化、消息存储、会话摘要生成、LLM 规划层、工具执行层、确认执行层
- Database: 需要新增 `agent_sessions`、`agent_messages`、`agent_session_memory`
- Related existing changes:
  - Reuses `add-task-agent-for-wardrobe`
  - Reuses `add-outfit-management-closure`

## Compatibility
- 旧 `/chat` 与当前 `/agent` 在融合期间保留为兼容入口，但最终应收口到统一 Agent 页面。
- `/aichat` 建议在过渡期内保留跳转或兼容壳层，而不是长期保留独立能力链路。

## Non-Goals
- 不包含多 Agent 协同
- 不包含 RAG 知识库平台
- 不包含自主长时任务调度
- 不包含复杂工作流编排引擎
- 不包含多用户共享会话
