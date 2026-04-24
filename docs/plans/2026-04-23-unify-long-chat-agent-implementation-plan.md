# Unified Long-Chat Agent Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 将当前 `/chat` 的长对话能力与 `/agent` 的任务执行能力融合为一个统一长对话式 Agent，并支持会话持久化、历史恢复、摘要记忆和统一确认执行。

**Architecture:** 先建立统一会话数据层（会话、消息、会话摘要），再让统一 Agent 页面具备会话列表和恢复能力，随后把现有 `/chat` 的长对话链路与 `/agent` 的任务执行链路接入同一上下文组装流程。长期偏好继续复用 `user_style_profile`，短期上下文采用“最近 12 轮完整消息 + 会话摘要”的分层记忆结构。

**Tech Stack:** React 18 + Vite + Zustand + antd-mobile；Koa + mysql2 + DeepSeek 工具链；OpenSpec；Node `node:test`。

---

## File Map

### Backend
- Create: `server/migrations/create_unified_agent_sessions.sql`
- Create: `server/controllers/unifiedAgent.helpers.js`
- Create: `server/controllers/unifiedAgentSessions.js`
- Create: `server/controllers/unifiedAgentMemory.js`
- Create: `server/controllers/unifiedAgentRuntime.js`
- Create: `server/routes/unifiedAgent.js`
- Create: `server/tests/unifiedAgent.helpers.test.js`
- Create: `server/tests/unifiedAgent.integration.test.js`
- Modify: `server/app.js`
- Modify: `server/routes/chat.js`
- Modify: `server/controllers/agent.js`

### Frontend
- Create: `client/src/pages/UnifiedAgent/index.jsx`
- Create: `client/src/pages/UnifiedAgent/index.module.less`
- Create: `client/src/components/AgentSessionList/index.jsx`
- Create: `client/src/components/AgentSessionList/index.module.less`
- Modify: `client/src/router/index.jsx`
- Modify: `client/src/components/AiChatEntrance/index.jsx`
- Modify: `client/src/pages/Agent/index.jsx`
- Modify: `client/src/pages/AiChat/index.jsx`
- Modify: `client/src/pages/Recommend/index.jsx`
- Modify: `client/src/pages/Outfit/index.jsx`
- Modify: `client/src/pages/ProfileInsights/index.jsx`

### Existing Data / Reuse
- Reuse: `server/controllers/profileInsights.js`
- Reuse: `server/controllers/recommendations.js`
- Reuse: `server/controllers/outfitLogs.js`
- Reuse: `server/controllers/agent.js`
- Reuse: `server/utils/toolRegistry.js`

## Delivery Phases

### Phase 1: Unified Session Storage
目标：把会话、消息、摘要三层数据模型落到数据库，并支持会话恢复。

### Phase 2: Unified Agent Page
目标：统一 Agent 页面支持会话列表、历史恢复、最近 12 轮完整消息和消息发送。

### Phase 3: Merge `/chat` and `/agent` Runtime
目标：统一消息流、任务规划、工具调用和确认机制。

### Phase 4: Compatibility & Cutover
目标：将旧 `/aichat`、当前 `/agent` 收口为兼容入口或跳转入口。

## Task 1: Define Unified Session Data Contract

**Files:**
- Create: `server/migrations/create_unified_agent_sessions.sql`
- Modify: `openspec/changes/unify-long-chat-agent/design.md`

- [ ] Step 1: 定义 `agent_sessions` 表字段
- [ ] Step 2: 定义 `agent_messages` 表字段和消息类型枚举
- [ ] Step 3: 定义 `agent_session_memory` 表字段与 `last_summarized_message_id`
- [ ] Step 4: 写出 SQL 建表语句与索引
- [ ] Step 5: 明确恢复接口最小返回契约

## Task 2: Add Tested Unified Agent Helper Layer

**Files:**
- Create: `server/controllers/unifiedAgent.helpers.js`
- Create: `server/tests/unifiedAgent.helpers.test.js`

- [ ] Step 1: 为“最近 12 轮 + 摘要”上下文组装写失败测试
- [ ] Step 2: 运行 `node --test server/tests/unifiedAgent.helpers.test.js`
- [ ] Step 3: 实现最小上下文组装 helper
- [ ] Step 4: 为“恢复返回契约格式化”写失败测试
- [ ] Step 5: 再次运行 `node --test server/tests/unifiedAgent.helpers.test.js`

## Task 3: Implement Session Storage Layer

**Files:**
- Create: `server/controllers/unifiedAgentSessions.js`
- Create: `server/controllers/unifiedAgentMemory.js`

- [ ] Step 1: 实现创建会话
- [ ] Step 2: 实现会话列表
- [ ] Step 3: 实现写入消息
- [ ] Step 4: 实现读取最近 12 轮消息
- [ ] Step 5: 实现读取/更新会话摘要
- [ ] Step 6: 实现恢复接口所需的数据组合

## Task 4: Implement Unified Runtime Layer

**Files:**
- Create: `server/controllers/unifiedAgentRuntime.js`
- Create: `server/routes/unifiedAgent.js`
- Modify: `server/app.js`

- [ ] Step 1: 统一接收消息输入并附带 `session_id`
- [ ] Step 2: 读取会话摘要与长期偏好摘要
- [ ] Step 3: 接入最近 12 轮完整消息
- [ ] Step 4: 接入 LLM 问答与任务规划
- [ ] Step 5: 接入现有 Agent 工具执行与确认门控
- [ ] Step 6: 将消息与任务结果写回数据库
- [ ] Step 7: 注册统一 Agent 路由

## Task 5: Add Integration Test for Session Restore

**Files:**
- Create: `server/tests/unifiedAgent.integration.test.js`

- [ ] Step 1: 为“创建会话 -> 写入消息 -> 恢复会话”写失败测试
- [ ] Step 2: 为“超过 12 轮消息时按契约返回 recent_messages + session_memory”写失败测试
- [ ] Step 3: 为“统一会话中触发任务并确认执行”写失败测试
- [ ] Step 4: 运行 `node --test server/tests/unifiedAgent.integration.test.js`
- [ ] Step 5: 修正实现直到测试通过

## Task 6: Build Unified Agent Frontend

**Files:**
- Create: `client/src/pages/UnifiedAgent/index.jsx`
- Create: `client/src/pages/UnifiedAgent/index.module.less`
- Create: `client/src/components/AgentSessionList/index.jsx`
- Create: `client/src/components/AgentSessionList/index.module.less`
- Modify: `client/src/router/index.jsx`

- [ ] Step 1: 新建统一 Agent 页面骨架
- [ ] Step 2: 新增会话列表组件
- [ ] Step 3: 支持打开历史会话
- [ ] Step 4: 支持显示最近 12 轮完整消息
- [ ] Step 5: 支持显示任务理解卡片、确认卡片、工具结果卡片
- [ ] Step 6: 将新页面注册到路由

## Task 7: Merge Compatibility Entrypoints

**Files:**
- Modify: `client/src/components/AiChatEntrance/index.jsx`
- Modify: `client/src/pages/Agent/index.jsx`
- Modify: `client/src/pages/AiChat/index.jsx`
- Modify: `client/src/pages/Recommend/index.jsx`
- Modify: `client/src/pages/Outfit/index.jsx`
- Modify: `client/src/pages/ProfileInsights/index.jsx`
- Modify: `server/routes/chat.js`

- [ ] Step 1: 让旧悬浮入口跳转统一 Agent 页面
- [ ] Step 2: 让业务页快捷入口携带上下文进入统一 Agent 会话
- [ ] Step 3: 将旧 `/aichat` 页面改为兼容入口或跳转壳层
- [ ] Step 4: 评估 `/chat` 路由是否保留为兼容层或被统一接口取代

## Task 8: Verification Checklist

**Files:**
- Test: `server/tests/unifiedAgent.helpers.test.js`
- Test: `server/tests/unifiedAgent.integration.test.js`

- [ ] Step 1: 运行 `node --test server/tests/unifiedAgent.helpers.test.js server/tests/unifiedAgent.integration.test.js`
- [ ] Step 2: 运行现有 Agent 与闭环测试全量回归
- [ ] Step 3: 运行 `cd client && npm run lint`
- [ ] Step 4: 手工验证：新建会话 -> 连续对话 -> 关闭页面 -> 恢复旧会话
- [ ] Step 5: 手工验证：统一会话中执行推荐、保存套装、记录穿搭

## Immediate Execution Order

1. 先做会话表与消息表
2. 再做恢复接口与最近 12 轮上下文组装
3. 再做统一 Agent 页面
4. 然后把现有 `/chat` 与 `/agent` 运行时逐步并入
5. 最后收口旧入口

## Notes for This Session

- 本计划针对 `unify-long-chat-agent` 新 change
- 优先保证“会话恢复 + 长对话连续性”这条主链路
- 历史迁移策略和旧 `/chat` 兼容方式在实现前需要再确认一次
