# Task Agent Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 为 Clothora 落地第一阶段任务型 Agent，提供独立 Agent 页面、查询/推荐型任务执行、任务历史记录，并为后续写操作确认机制打下基础。

**Architecture:** 后端新增一个轻量任务编排层，对自然语言输入做意图分类、上下文组装和工具执行；前端新增独立 Agent 页面和入口，展示任务理解、结果摘要和任务历史。第一阶段只接入读工具和推荐工具，不接入危险写操作，从而在低风险范围内跑通 Agent 主链路。

**Tech Stack:** React 18 + Vite + Zustand + antd-mobile；Koa + mysql2 + DeepSeek 已有 chat/tooling；OpenSpec；Node `node:test`。

---

## File Map

### Backend
- Create: `server/migrations/create_agent_task_history.sql`
- Create: `server/controllers/agent.helpers.js`
- Create: `server/controllers/agent.js`
- Create: `server/routes/agent.js`
- Create: `server/tests/agent.helpers.test.js`
- Create: `server/tests/agent.integration.test.js`
- Modify: `server/app.js`
- Modify: `server/utils/toolRegistry.js`

### Frontend
- Create: `client/src/pages/Agent/index.jsx`
- Create: `client/src/pages/Agent/index.module.less`
- Modify: `client/src/router/index.jsx`
- Modify: `client/src/components/AiChatEntrance/index.jsx`
- Modify: `client/src/pages/Person/index.jsx`

### Docs / Specs
- Reuse: `openspec/changes/add-task-agent-for-wardrobe/*`

## Task 1: Define Agent History Data Contract

**Files:**
- Create: `server/migrations/create_agent_task_history.sql`

- [ ] Step 1: 定义 `agent_task_history` 表字段
- [ ] Step 2: 明确 source entry、task type、status、result summary 的最小契约
- [ ] Step 3: 写出 SQL 迁移文件

## Task 2: Add Tested Agent Helper Layer

**Files:**
- Create: `server/controllers/agent.helpers.js`
- Create: `server/tests/agent.helpers.test.js`

- [ ] Step 1: 先为任务意图分类写失败测试
- [ ] Step 2: 运行 `node --test server/tests/agent.helpers.test.js`
- [ ] Step 3: 实现最小任务分类与结果摘要 helper
- [ ] Step 4: 为上下文摘要构建写失败测试
- [ ] Step 5: 再次运行 `node --test server/tests/agent.helpers.test.js`

## Task 3: Implement Agent Backend

**Files:**
- Create: `server/controllers/agent.js`
- Create: `server/routes/agent.js`
- Modify: `server/app.js`
- Modify: `server/utils/toolRegistry.js`

- [ ] Step 1: 实现查询/推荐型任务的后端编排入口
- [ ] Step 2: 复用现有工具层接入衣橱、套装、推荐、画像、分析读取
- [ ] Step 3: 增加任务历史写入
- [ ] Step 4: 增加最近任务列表接口
- [ ] Step 5: 在 `server/app.js` 注册 Agent 路由

## Task 4: Add Backend Integration Test

**Files:**
- Create: `server/tests/agent.integration.test.js`

- [ ] Step 1: 为“查询衣橱”主链路写失败测试
- [ ] Step 2: 为“场景推荐”主链路写失败测试
- [ ] Step 3: 运行 `node --test server/tests/agent.integration.test.js`
- [ ] Step 4: 修正实现直到测试通过

## Task 5: Build Agent Frontend

**Files:**
- Create: `client/src/pages/Agent/index.jsx`
- Create: `client/src/pages/Agent/index.module.less`
- Modify: `client/src/router/index.jsx`
- Modify: `client/src/components/AiChatEntrance/index.jsx`
- Modify: `client/src/pages/Person/index.jsx`

- [ ] Step 1: 新建独立 Agent 页面骨架
- [ ] Step 2: 支持输入任务、展示任务理解和执行结果
- [ ] Step 3: 展示最近任务历史
- [ ] Step 4: 将悬浮入口跳转到独立 Agent 页面
- [ ] Step 5: 在个人中心增加 Agent 入口

## Task 6: Verification Checklist

**Files:**
- Test: `server/tests/agent.helpers.test.js`
- Test: `server/tests/agent.integration.test.js`

- [ ] Step 1: 运行 `node --test server/tests/agent.helpers.test.js server/tests/agent.integration.test.js`
- [ ] Step 2: 运行 `cd client && npm run lint`
- [ ] Step 3: 手工验证 Agent 查询衣橱、生成推荐、查看任务历史

## Immediate Execution Order

1. 先完成 `agent_task_history` 表和 helper
2. 再完成后端 `/agent` 查询/推荐主链路
3. 然后完成独立 Agent 页面
4. 最后补入口和任务历史展示

## Notes for This Session

- 本轮只实现第一阶段最小 Agent，不引入写操作确认
- 写操作、确认卡片、免确认配置放到下一小阶段
