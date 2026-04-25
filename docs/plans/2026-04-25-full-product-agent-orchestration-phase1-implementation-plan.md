# Full-Product Agent Orchestration Phase 1 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 将当前 unified-agent 从“统一会话 + 少量任务”扩展为“高价值业务流程代理入口”。Phase 1 聚焦三条主链路：`图片录入衣橱`、`推荐保存为套装`、`推荐记录为穿搭`，同时为后续扩展到全站页面操作建立统一工具目录、工作流编排层与风险分级。

**Architecture:** 在现有 `unifiedAgentRuntime + agent.js + toolRegistry` 基础上新增一层轻量 `Agent Orchestrator`。这层负责输入路由、参数抽取、澄清、模板化 workflow 调度与统一确认；具体业务执行继续复用现有 controller / toolRegistry，避免 Agent 与页面逻辑分叉。Phase 1 不追求自由自治 Agent，而采用“显式工具目录 + 模板化工作流 + 受控确认”的可维护方案。

**Tech Stack:** React 18 + Vite + antd-mobile + Zustand；Koa + mysql2 + DeepSeek + Vision Tooling；OpenSpec；Node `node:test`。

---

## Scope

### In Scope
- 图文输入触发衣物录入工作流
- 纯文本触发推荐并继续保存为套装
- 纯文本触发推荐并继续记录为穿搭
- 统一确认策略与工作流状态恢复
- 页面快捷入口携带上下文进入 unified-agent

### Out of Scope
- 全站所有删除类操作一次性接入
- 多图输入
- 完整自由规划型 Agent
- 通用可视化 workflow builder
- 复杂预览生成链路的全量接入

---

## File Map

### Backend
- Create: `server/controllers/agentOrchestrator.js`
- Create: `server/controllers/agentWorkflow.helpers.js`
- Create: `server/tests/agentOrchestrator.test.js`
- Create: `server/tests/agentWorkflow.integration.test.js`
- Modify: `server/controllers/unifiedAgentRuntime.js`
- Modify: `server/controllers/agent.js`
- Modify: `server/utils/toolRegistry.js`
- Modify: `server/controllers/clothes.js`
- Modify: `server/controllers/clothesVision.js`
- Modify: `server/controllers/suits.js`
- Modify: `server/controllers/outfitLogs.js`
- Modify: `server/routes/clothes.js`

### Frontend
- Modify: `client/src/pages/AiChat/index.jsx`
- Modify: `client/src/pages/UnifiedAgent/index.jsx`
- Modify: `client/src/components/AgentHistoryPanel/index.jsx`
- Modify: `client/src/pages/Outfit/index.jsx`
- Modify: `client/src/pages/Recommend/index.jsx`
- Modify: `client/src/pages/ProfileInsights/index.jsx`
- Modify: `client/src/pages/Person/index.jsx`

### Docs / Specs
- Reuse: `openspec/changes/add-full-product-agent-orchestration/*`

---

## Phase 1 Tool Catalog

### Domain A: 衣物录入
- `analyze_cloth_image`
  - 输入：当前消息附件、可选文本提示
  - 输出：衣物识别结构化结果
  - 风险：read_like

- `draft_cloth_from_analysis`
  - 输入：图片分析结果、用户补充文本
  - 输出：衣物草稿对象
  - 风险：read_like

- `create_cloth`
  - 输入：衣物草稿
  - 输出：已创建衣物对象
  - 风险：create
  - 默认确认：是

### Domain B: 推荐结果落业务对象
- `generate_scene_recommendation`
  - 输入：scene、可选用户约束
  - 输出：推荐结果
  - 风险：recommend

- `save_recommendation_as_suit`
  - 输入：最新推荐结果、目标索引
  - 输出：创建的套装对象
  - 风险：create
  - 默认确认：是

- `save_recommendation_as_outfit_log`
  - 输入：最新推荐结果、日期、备注
  - 输出：创建的穿搭记录
  - 风险：create
  - 默认确认：是

### Shared Control Tools
- `request_missing_fields`
  - 输入：缺失字段列表、当前草稿
  - 输出：澄清提示
  - 风险：none

- `build_confirmation_card`
  - 输入：workflow 当前步骤、待执行 payload
  - 输出：确认摘要
  - 风险：none

---

## Workflow Templates

### Workflow 1: `ingest_cloth_from_image`
适用场景：用户上传衣物图片并希望加入衣橱。

步骤：
1. 识别输入含图片，路由到衣物录入工作流
2. 调用 `analyze_cloth_image`
3. 调用 `draft_cloth_from_analysis`
4. 校验必要字段：`name`、`type`，可选补全 `color/style/season/material`
5. 若必要字段缺失，进入澄清
6. 生成待保存摘要
7. 用户确认
8. 调用 `create_cloth`
9. 写入消息、工作流状态和结果摘要

### Workflow 2: `recommend_and_save_suit`
适用场景：用户先要推荐，再要求保存为套装。

步骤：
1. 调用 `generate_scene_recommendation`
2. 返回推荐结果并写入 `latestTask`
3. 用户继续要求保存
4. 生成确认摘要
5. 用户确认
6. 调用 `save_recommendation_as_suit`
7. 回写结果与任务历史

### Workflow 3: `recommend_and_create_outfit_log`
适用场景：用户先要推荐，再要求记为今天穿搭。

步骤：
1. 调用 `generate_scene_recommendation`
2. 返回推荐结果并写入 `latestTask`
3. 用户继续要求记录穿搭
4. 生成确认摘要
5. 用户确认
6. 调用 `save_recommendation_as_outfit_log`
7. 回写结果与任务历史

---

## Task 1: Define Orchestrator Boundaries

**Files:**
- Create: `server/controllers/agentOrchestrator.js`
- Create: `server/controllers/agentWorkflow.helpers.js`
- Modify: `server/controllers/unifiedAgentRuntime.js`

- [ ] Step 1: 定义统一入口路由后的三种执行模式：普通对话、工具增强聊天、模板化 workflow
- [ ] Step 2: 定义 workflow state 最小结构：`workflowType`、`step`、`draft`、`missingFields`、`pendingConfirmation`
- [ ] Step 3: 明确 `latestTask` 与 workflow state 的关系，避免重复存储和逻辑冲突
- [ ] Step 4: 将当前 unified-agent runtime 的任务路由逻辑整理为 orchestrator 可调用接口

## Task 2: Expand Tool Registry for Phase 1

**Files:**
- Modify: `server/utils/toolRegistry.js`
- Modify: `server/controllers/clothes.js`
- Modify: `server/controllers/clothesVision.js`
- Modify: `server/controllers/suits.js`
- Modify: `server/controllers/outfitLogs.js`

- [ ] Step 1: 梳理并注册衣物录入、推荐保存、记录穿搭所需工具
- [ ] Step 2: 为每个工具补齐输入校验与错误语义
- [ ] Step 3: 为工具定义风险等级与确认策略
- [ ] Step 4: 确保工具只复用现有业务执行层，不新增数据库绕行逻辑

## Task 3: Implement Image-to-Wardrobe Workflow

**Files:**
- Create: `server/controllers/agentWorkflow.helpers.js`
- Modify: `server/controllers/unifiedAgentRuntime.js`
- Modify: `client/src/pages/AiChat/index.jsx`

- [ ] Step 1: 识别“图片 + 存入衣橱”类请求并路由到 `ingest_cloth_from_image`
- [ ] Step 2: 复用现有视觉识别能力生成结构化衣物草稿
- [ ] Step 3: 在缺失关键字段时进入澄清而不是直接失败或直接写入
- [ ] Step 4: 在前端展示待保存摘要与确认操作
- [ ] Step 5: 确认后完成创建衣物并刷新会话状态

## Task 4: Implement Recommendation Follow-up Workflows

**Files:**
- Modify: `server/controllers/agent.js`
- Modify: `server/controllers/unifiedAgentRuntime.js`
- Modify: `client/src/pages/AiChat/index.jsx`

- [ ] Step 1: 让推荐结果在 unified-agent 中稳定成为后续 workflow 的输入上下文
- [ ] Step 2: 接入“保存为套装”工作流
- [ ] Step 3: 接入“记录为穿搭”工作流
- [ ] Step 4: 确认推荐类后续写操作沿用统一确认机制，而不是散落在聊天页临时分支中

## Task 5: Add Workflow State Recovery

**Files:**
- Modify: `server/controllers/unifiedAgentRuntime.js`
- Modify: `client/src/pages/AiChat/index.jsx`
- Modify: `client/src/components/AgentHistoryPanel/index.jsx`

- [ ] Step 1: 为待确认 workflow 增加恢复契约
- [ ] Step 2: 为失败/澄清中 workflow 增加恢复契约
- [ ] Step 3: 前端恢复会话时同时恢复 workflow 状态，而不是只恢复消息列表

## Task 6: Add Contextual Entrypoints

**Files:**
- Modify: `client/src/pages/Outfit/index.jsx`
- Modify: `client/src/pages/Recommend/index.jsx`
- Modify: `client/src/pages/ProfileInsights/index.jsx`
- Modify: `client/src/pages/Person/index.jsx`

- [ ] Step 1: 为衣橱页增加“交给 Agent 处理当前衣物/图片”的入口
- [ ] Step 2: 为推荐页增加“将当前推荐交给 Agent 继续处理”的入口
- [ ] Step 3: 为画像/个人页增加“让 Agent 修改偏好或读取画像”的入口
- [ ] Step 4: 入口统一使用 route state 或 query 带入上下文

## Task 7: Testing and Verification

**Files:**
- Create: `server/tests/agentOrchestrator.test.js`
- Create: `server/tests/agentWorkflow.integration.test.js`

- [ ] Step 1: 为 orchestrator 路由决策写单测
- [ ] Step 2: 为 `ingest_cloth_from_image` 写集成测试
- [ ] Step 3: 为“推荐 -> 保存套装”写集成测试
- [ ] Step 4: 为“推荐 -> 记录穿搭”写集成测试
- [ ] Step 5: 运行 `node --test server/tests/agentOrchestrator.test.js server/tests/agentWorkflow.integration.test.js`
- [ ] Step 6: 运行 `cd client && npm run lint`
- [ ] Step 7: 手工验证三条主链路

---

## Immediate Execution Order

1. 先定义 orchestrator 边界和 workflow state
2. 再补齐 Phase 1 所需工具与 schema
3. 先做 `ingest_cloth_from_image`
4. 再做推荐结果后续两条写工作流
5. 最后做恢复与入口联动

---

## Notes for This Session

- Phase 1 的关键不是“让更多话术命中”，而是让 workflow 能稳定接住真实业务流程
- 不要一开始就追求覆盖所有页面操作，先把三条高价值链路做扎实
- 若页面已有逻辑和 Agent 逻辑出现重复，应优先下沉共享业务函数，而不是继续复制

