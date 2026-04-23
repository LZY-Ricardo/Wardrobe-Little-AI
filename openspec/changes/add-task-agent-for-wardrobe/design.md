## Context
在闭环增强方案落地后，系统已经具备了衣橱、套装、穿搭记录、推荐历史、反馈和偏好画像等结构化业务对象，但 AI 仍主要停留在“独立问答”或“单点推荐”能力上。为了让 AI 真正成为系统级增强能力，需要构建一个面向穿搭管理场景的任务型 Agent，将自然语言目标转化为结构化任务，并通过业务工具安全执行。

本变更依赖闭环增强方案提供的结构化数据对象，并在此基础上实现上下文感知、任务规划、工具调用、确认门控和结果回写。

## Goals / Non-Goals
- Goals:
  - 让 Agent 能基于自然语言目标执行查询、推荐、创建、修改和删除任务
  - 让 Agent 能读取系统上下文与长期偏好，贯穿多个业务页面
  - 让所有写操作在统一确认机制下安全执行
  - 让 Agent 的执行结果回写到系统业务对象和任务历史中
- Non-Goals:
  - 不实现多 Agent 协作或复杂自治长流程
  - 不在第一阶段引入 RAG 或大规模知识检索基础设施
  - 不允许删除类操作进入免确认模式

## Decisions
- Decision: 采用工作流式任务 Agent 架构，而不是单纯聊天助手。
  - Why: 需要明确区分任务输入、上下文组装、任务解析、步骤规划、工具执行和结果回写，便于工程实现和论文表达。

- Decision: Agent 默认以单轮任务执行为主，支持有限多步规划。
  - Why: 该范围能覆盖大多数穿搭场景任务，同时控制复杂度，避免实现成本失控。

- Decision: 所有新增、修改、删除操作默认需要二次确认，用户可选择为部分低风险操作开启免确认。
  - Why: 这是任务型 Agent 安全设计的核心，可以同时满足可执行性与可控性。

- Decision: Agent 的长期记忆优先复用业务闭环中的结构化数据，而不是依赖大模型会话缓存。
  - Why: 当前项目的关键偏好信息天然存在于画像、记录、反馈与配置中，直接读取结构化数据更稳、更可解释。

## Architecture
### 1. 交互入口层
- 独立 Agent 页面
- 全局悬浮入口
- 页面内快捷入口

### 2. 上下文组装层
- 当前用户身份
- 当前页面与当前对象
- 用户长期偏好画像
- 最近推荐、穿搭记录与相关业务摘要
- 用户确认偏好配置

### 3. 任务解析层
- 将用户请求解析为查询、推荐、创建、修改、删除或组合任务

### 4. 任务规划层
- 对任务进行有限步骤拆解
- 判断是否需要读工具、写工具和确认流程

### 5. 工具执行层
- 通过后端标准业务工具执行读写
- 严禁直接绕过业务层访问数据库

### 6. 结果回写层
- 向用户返回执行结果
- 将执行结果回写到套装、穿搭记录、推荐历史等业务对象
- 写入 Agent 任务历史

## Task Types
### 查询类任务
- 查询衣物、套装、穿搭记录、推荐历史、画像与统计摘要

### 推荐类任务
- 根据场景、天气、衣橱和偏好生成搭配建议
- 如需保存结果，进入确认流程

### 创建类任务
- 创建套装、创建穿搭记录、保存推荐结果

### 修改类任务
- 修改套装、修改穿搭记录、更新偏好设置、收藏状态切换

### 删除类任务
- 删除套装、删除穿搭记录、删除衣物等高风险动作

## Tool Design
### Read Tools
- `get_user_profile`
- `get_user_style_profile`
- `list_clothes`
- `get_cloth_detail`
- `list_suits`
- `get_suit_detail`
- `list_outfit_logs`
- `get_outfit_log_detail`
- `list_recommendation_history`
- `get_recommendation_detail`
- `get_wardrobe_analytics`
- `generate_outfit_recommendation`

### Write Tools
- `create_suit`
- `update_suit`
- `delete_suit`
- `create_outfit_log`
- `update_outfit_log`
- `delete_outfit_log`
- `save_recommendation_result`
- `submit_recommendation_feedback`
- `update_user_preferences`
- `toggle_cloth_favorite`

## Confirmation Model
### Default Policy
- 查询类：直接执行
- 推荐类：直接执行；如需保存结果则确认
- 创建类：确认
- 修改类：确认
- 删除类：确认且不可免确认

### User Preferences
- 允许用户在设置中为部分低风险操作开启免确认
- 低风险示例：收藏切换、快速保存推荐为套装
- 高风险删除类操作始终保留确认

### Confirmation Flow
1. Agent 识别写操作意图
2. 读取目标对象与上下文
3. 生成待执行摘要
4. 返回确认请求
5. 用户确认
6. 调用写工具执行
7. 返回结果并写入任务历史

## Data Model
### `agent_task_history`
- `id`
- `user_id`
- `source_entry`
- `task_type`
- `task_summary`
- `status`
- `requires_confirmation`
- `confirmation_status`
- `related_object_type`
- `related_object_id`
- `result_summary`
- `create_time`
- `update_time`

## UI Scope
### 独立 Agent 页面
- 自然语言输入
- 任务理解摘要
- 步骤规划展示
- 确认卡片
- 执行结果展示
- 最近任务历史

### 全局悬浮入口
- 快速唤起 Agent
- 自动带入当前页面上下文

### 页面内快捷入口
- 衣橱页、套装页、推荐页、穿搭记录页、个人中心/画像页

## Risks / Trade-offs
- 任务规划展示过多会影响界面复杂度
  - Mitigation: 第一阶段仅展示简化步骤摘要，不暴露底层提示词细节
- 上下文过多可能导致 LLM 输入冗长
  - Mitigation: 只传必要摘要字段，避免原始大对象直接进入上下文
- 过早接入过多工具会提高调试复杂度
  - Mitigation: 第一阶段优先接入衣橱、套装、推荐、穿搭记录四类高价值工具

## Migration Plan
1. 复用闭环方案已有数据对象与接口
2. 新增 Agent 页面和后端任务编排层
3. 先实现查询类、推荐类和少量写工具
4. 接入统一确认机制
5. 新增悬浮入口和页面内快捷入口
6. 新增任务历史与偏好配置整合

## Open Questions
1. 第一阶段是否展示完整规划链路还是简化步骤摘要？建议简化摘要
2. 任务历史是否需要保留完整消息上下文？第一阶段建议仅保留任务摘要与结果摘要
3. 用户偏好设置入口放在个人中心还是 Agent 设置页？建议先放个人中心
