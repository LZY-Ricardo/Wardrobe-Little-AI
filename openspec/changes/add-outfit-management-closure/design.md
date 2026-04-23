## Context
当前系统的核心实体已经覆盖用户、衣物和套装，也已经具备基于 AI 的推荐与问答能力，但系统仍以“生成能力”为主，缺少对用户真实使用行为和反馈结果的结构化沉淀。这会导致系统推荐结果无法持续优化，也很难在答辩与论文中体现“管理系统”的完整业务闭环。

本变更将围绕“衣橱管理 -> 智能推荐 -> 推荐记录 -> 穿搭记录 -> 用户反馈 -> 偏好画像 -> 分析展示”这一链路，补齐闭环能力，并为后续任务型 Agent 提供稳定的数据基础。

## Goals / Non-Goals
- Goals:
  - 建立从推荐到使用、反馈、画像、分析的完整业务闭环
  - 为推荐系统和后续 Agent 提供可追踪、可解释、可积累的数据对象
  - 让系统在功能结构上更符合“智能穿搭管理系统”的题目定位
- Non-Goals:
  - 不在本变更中实现 Agent 任务规划与工具编排
  - 不引入复杂的 RAG、训练平台或知识库系统
  - 不扩展社交、电商等偏离主线的业务

## Decisions
- Decision: 以“穿搭记录、推荐历史、推荐反馈、偏好画像、统计分析”作为闭环增强的五个核心能力域。
  - Why: 这五类能力可以直接把推荐结果转化为业务过程，形成系统级数据闭环，并为后续 Agent 提供长期偏好与历史数据。

- Decision: 优先使用结构化业务数据驱动偏好画像与分析逻辑。
  - Why: 当前项目的主要数据天然是结构化对象，优先使用数据库查询、规则聚合和业务统计比引入复杂检索机制更稳、更贴合毕设实现目标。

- Decision: 将推荐结果保存为独立的推荐历史对象，而不是只在前端展示临时结果。
  - Why: 推荐历史是后续反馈、采纳、画像更新和 Agent 决策的重要基础，必须成为可追踪业务对象。

- Decision: 偏好画像先采用聚合摘要表建模，而不是一开始拆成复杂标签图谱。
  - Why: 第一阶段目标是让长期偏好可见、可用、可更新，先用聚合结果表可以控制复杂度，同时保留后续扩展为细粒度标签表的空间。

## Module Design
### 1. 穿搭记录模块
- 用于记录用户每日实际穿搭行为
- 支持关联套装，也支持基于单件衣物的自由组合记录
- 记录场景、天气摘要、满意度、备注与创建来源

### 2. 推荐历史与反馈模块
- 用于保存每次推荐请求条件和推荐结果摘要
- 用于记录用户是否采纳、是否转为套装或穿搭记录
- 用于记录喜欢/不喜欢及结构化反馈原因

### 3. 用户偏好画像模块
- 基于收藏、穿搭记录、推荐采纳、反馈结果生成长期偏好摘要
- 画像内容包括常用风格、颜色、场景、季节及确认偏好摘要
- 画像结果将被后续推荐排序与 Agent 上下文直接使用

### 4. 衣橱分析模块
- 提供衣物分类、风格分布、颜色分布、套装使用频率、穿搭记录趋势和推荐效果统计
- 重点服务于管理系统展示与答辩可视化，而不是复杂 BI 平台

## Data Model
### `outfit_logs`
- `id`
- `user_id`
- `suit_id` nullable
- `log_date`
- `scene`
- `weather_summary`
- `satisfaction`
- `source`
- `note`
- `create_time`
- `update_time`

### `outfit_log_items`
- `id`
- `outfit_log_id`
- `cloth_id`
- `sort_order`

### `recommendation_history`
- `id`
- `user_id`
- `recommendation_type`
- `scene`
- `weather_summary`
- `request_summary`
- `result_summary`
- `adopted`
- `saved_as_suit`
- `saved_as_outfit_log`
- `create_time`
- `update_time`

### `recommendation_feedback`
- `id`
- `recommendation_id`
- `user_id`
- `feedback_result`
- `reason_tags`
- `note`
- `create_time`
- `update_time`

### `user_style_profile`
- `id`
- `user_id`
- `preferred_colors`
- `preferred_styles`
- `frequent_scenes`
- `frequent_seasons`
- `confirmation_preferences`
- `summary`
- `update_time`

## Data Flow
### 1. 衣橱到推荐
- 用户维护衣橱数据
- 系统生成推荐并写入 `recommendation_history`

### 2. 推荐到使用
- 用户采纳推荐
- 系统将结果保存为套装或穿搭记录
- 实际穿搭写入 `outfit_logs`

### 3. 使用到反馈
- 用户对推荐或实际穿搭提交反馈
- 系统将结构化反馈写入 `recommendation_feedback`

### 4. 反馈到画像
- 系统根据收藏、穿搭记录、反馈与采纳情况更新 `user_style_profile`
- 画像结果供后续推荐和 Agent 使用

## UI / API Scope
### Frontend
- 新增穿搭记录页
- 新增推荐历史页
- 新增偏好画像页
- 新增衣橱分析页
- 在衣橱页、推荐页、个人中心增加闭环相关入口和快捷操作

### Backend
- 穿搭记录：新增、列表、详情、修改、删除
- 推荐历史：新增、列表、详情、标记采纳、转套装、转穿搭记录
- 推荐反馈：新增、查询、更新
- 偏好画像与统计：查询画像、重算画像、查询分析摘要

## Risks / Trade-offs
- 画像规则过于简单可能影响“智能”观感
  - Mitigation: 第一阶段优先保证结构完整和可解释性，后续再逐步增强画像算法
- 页面扩展过多导致前端工作量上涨
  - Mitigation: 优先落穿搭记录页和推荐历史页，画像与分析页先做轻量展示版
- 推荐结果与实际穿搭之间的关联链路可能增加状态复杂度
  - Mitigation: 明确 `adopted`、`saved_as_suit`、`saved_as_outfit_log` 等状态字段，保证业务对象可追踪

## Migration Plan
1. 新增闭环相关数据表
2. 先实现穿搭记录与推荐历史/反馈接口
3. 前端补穿搭记录页和推荐历史页
4. 实现画像聚合逻辑与画像页
5. 实现分析接口和分析页
6. 将闭环数据提供给后续 Agent 方案复用

## Open Questions
1. 穿搭记录是否允许不关联套装，仅记录单件衣物组合？默认允许
2. 推荐历史是否需要保存完整结果 JSON？第一阶段建议保存摘要和必要索引字段，避免表结构过重
3. 衣橱分析是否需要复杂图表库？第一阶段建议先用卡片统计和轻量图表
