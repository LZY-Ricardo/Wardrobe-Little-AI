## Context
当前系统已经完成了闭环业务对象（推荐历史、穿搭记录、偏好画像、统计分析）以及第一阶段任务型 Agent 的基础能力，但智能交互层仍然存在“双入口”结构：`/chat` 偏长对话与 LLM 工具调用，`/agent` 偏任务执行与确认门控。这种分裂结构不利于上下文延续、历史恢复和统一的 Agent 体验，也不利于将系统包装成“一个长对话式智能体”。

本变更的目标是将两者融合为统一长对话式 Agent：一个页面、一个会话体系、一套记忆架构、一条规划与执行链路。用户既可以连续聊天，也可以通过同一会话完成查询、推荐、写操作和确认执行。

## Goals / Non-Goals
- Goals:
  - 统一 `/chat` 与 `/agent` 的入口和会话模型
  - 支持最近 12 轮完整对话 + 会话摘要 + 长期偏好记忆
  - 支持会话恢复、会话摘要更新与任务历史关联
  - 在统一对话链路中接入任务规划、工具调用和确认执行
- Non-Goals:
  - 不实现多 Agent 协作
  - 不实现 RAG 平台
  - 不实现复杂长时自治任务
  - 不在本次变更中引入多用户协作会话

## Decisions
- Decision: 保留最近 12 轮完整对话消息，超过部分压缩成会话摘要记忆。
  - Why: 这样既能保持当前对话连贯性，又能控制上下文长度。

- Decision: 长期偏好记忆继续复用闭环增强方案中的 `user_style_profile`，不重复建模。
  - Why: 现有画像已经覆盖颜色、风格、场景、季节和确认偏好，适合作为统一 Agent 的长期偏好来源。

- Decision: 新增 `agent_sessions`、`agent_messages`、`agent_session_memory` 三张表承载会话恢复。
  - Why: 需要把完整消息、会话摘要和会话元信息分层保存，才能稳定支持恢复与增量摘要。

- Decision: 统一 Agent 仍保持“LLM 负责理解与规划，后端负责工具约束与确认门控”的架构。
  - Why: 这样既能利用 LLM 的对话理解优势，又能保持系统操作的稳定性与安全性。

## Memory Architecture
### 1. Short-Term Memory
- 最近 12 轮完整消息
- 直接注入 LLM 上下文
- 主要服务当前多轮连续对话

### 2. Session Memory
- 超出 12 轮的历史摘要
- 内容包括目标、约束、已完成步骤、待执行动作、当前引用对象
- 存储在 `agent_session_memory`

### 3. Long-Term Memory
- 用户长期偏好摘要
- 继续复用 `user_style_profile`
- 内容包括风格、颜色、场景、季节、反馈偏好、确认偏好

## Data Model
### `agent_sessions`
- `id`
- `user_id`
- `title`
- `status`
- `current_task_type`
- `last_message_at`
- `create_time`
- `update_time`

### `agent_messages`
- `id`
- `session_id`
- `user_id`
- `role`
- `content`
- `message_type`
- `task_id`
- `tool_name`
- `confirmation_status`
- `create_time`

### `agent_session_memory`
- `id`
- `session_id`
- `user_id`
- `summary`
- `key_facts`
- `active_goals`
- `pending_actions`
- `last_summarized_message_id`
- `update_time`

## Unified Conversation Flow
1. 用户进入统一 Agent 页面并打开/新建会话
2. 系统读取该会话最近 12 轮完整消息
3. 系统读取 `agent_session_memory` 与 `user_style_profile`
4. LLM 对当前输入进行意图识别、任务规划或澄清判断
5. 如为普通问答，直接返回回复
6. 如为任务执行，进入工具调用与确认门控
7. 结果返回后写入 `agent_messages`
8. 当消息超过阈值或任务状态变化时，刷新会话摘要

## Session Restore Flow
1. 读取 `agent_sessions`
2. 读取该会话最近 12 轮 `agent_messages`
3. 读取 `agent_session_memory`
4. 读取 `user_style_profile`
5. 组合为：系统提示词 + 偏好摘要 + 会话摘要 + 最近 12 轮消息 + 当前页面上下文

### Restore Contract
恢复旧会话时，后端至少返回以下结构：
- `session`: 当前会话元信息（标题、状态、最后活动时间、当前任务类型）
- `recent_messages`: 最近 12 轮完整消息
- `session_memory`: 该会话的摘要、关键事实、活跃目标、待办动作
- `preference_summary`: 当前用户的长期偏好摘要

前端恢复逻辑不得只恢复消息列表，而必须同时恢复 `session_memory` 与 `preference_summary`，否则不视为完成会话恢复。

## Summary Refresh Rules
- 当单个会话消息超过 12 轮时，系统 MUST 触发会话摘要刷新。
- 当任务状态从“澄清/待确认”变为“已执行/已取消/已过期”时，系统 SHOULD 触发摘要刷新。
- 当用户恢复旧会话且摘要明显落后于最新消息时，系统 MAY 先返回旧摘要并在后台异步重算，但必须保证下次恢复或后续消息中可见更新后的摘要。
- 摘要更新必须记录 `last_summarized_message_id`，用于标识摘要已经覆盖到的消息边界。

## UI Scope
### Unified Agent Page
- 会话列表
- 当前消息面板
- 输入区
- 任务理解卡片
- 确认卡片
- 工具结果卡片
- 最近任务历史或会话侧栏

### Page Shortcuts
- 推荐页携带当前推荐结果进入统一 Agent
- 衣橱页携带当前衣物进入统一 Agent
- 画像页携带当前偏好进入统一 Agent
- 分析页携带当前统计摘要进入统一 Agent

## Migration Plan
1. 新增会话相关数据表
2. 让统一 Agent 页面支持会话列表与会话恢复
3. 将 `/chat` 的长对话消息能力逐步并入统一 Agent
4. 将 `/agent` 的任务执行与确认能力并入统一会话流
5. 最终收口旧 `/aichat` 页面，只保留统一 Agent 入口

### Migration Notes
- 需要明确旧 `/chat` 历史是否迁移；若无法迁移，则需在发布说明中明确“统一 Agent 会话从新版本开始独立计数”。
- 在过渡期内，建议 `/chat` 与统一 Agent 至少保证入口兼容，而不是让用户同时维护两套长期会话。
- 若采用短期双写策略，必须明确双写的停止条件与回收时间点，避免长期存在两套历史源。

## Risks / Trade-offs
- 融合期间存在两套入口并行的短暂过渡期
  - Mitigation: 通过新 change 渐进迁移，避免一次性重写
- 会话摘要质量会影响恢复效果
  - Mitigation: 先做规则化摘要字段，再逐步引入 LLM 摘要增强
- 长对话引入后，上下文管理会更复杂
  - Mitigation: 坚持“最近 12 轮 + 摘要 + 偏好”三层结构，避免无限扩张

## Open Questions
1. 会话标题由第一条消息自动生成，还是支持用户手工改名？默认先自动生成
2. 摘要更新由规则触发还是每次落消息都触发？默认按消息阈值和任务状态变化触发
3. 是否保留旧 `/aichat` 路由做兼容跳转？建议保留短期兼容，再逐步移除
