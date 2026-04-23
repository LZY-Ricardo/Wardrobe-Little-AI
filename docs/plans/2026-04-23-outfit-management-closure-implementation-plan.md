# Outfit Management Closure Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 为 Clothora 补齐“推荐生成 -> 推荐历史 -> 用户反馈 -> 穿搭记录 -> 偏好画像 -> 数据分析”的业务闭环，并优先交付第一阶段可运行版本。

**Architecture:** 先扩展结构化业务数据层，再补后端接口与前端页面，最后基于这些对象聚合画像和统计结果。推荐历史与反馈是第一阶段切入点，因为它们最容易复用现有推荐流程，并为后续穿搭记录、画像和 Agent 提供统一上游对象。

**Tech Stack:** React 18 + Vite + Zustand + antd-mobile；Koa + mysql2 + JWT；OpenSpec；Node 内置 `node:test` 用于新增后端纯逻辑单元测试。

---

## File Map

### Backend
- Create: `server/migrations/create_outfit_management_closure.sql`
- Create: `server/routes/recommendations.js`
- Create: `server/controllers/recommendations.js`
- Create: `server/controllers/recommendations.helpers.js`
- Create: `server/tests/recommendations.helpers.test.js`
- Create: `server/routes/outfitLogs.js`
- Create: `server/controllers/outfitLogs.js`
- Create: `server/routes/profileInsights.js`
- Create: `server/controllers/profileInsights.js`
- Modify: `server/app.js`
- Modify: `server/controllers/sceneApi.js`

### Frontend
- Create: `client/src/pages/RecommendationHistory/index.jsx`
- Create: `client/src/pages/RecommendationHistory/index.module.less`
- Create: `client/src/pages/OutfitLogs/index.jsx`
- Create: `client/src/pages/OutfitLogs/index.module.less`
- Create: `client/src/pages/ProfileInsights/index.jsx`
- Create: `client/src/pages/ProfileInsights/index.module.less`
- Create: `client/src/pages/WardrobeAnalytics/index.jsx`
- Create: `client/src/pages/WardrobeAnalytics/index.module.less`
- Modify: `client/src/router/index.jsx`
- Modify: `client/src/pages/Recommend/index.jsx`
- Modify: `client/src/pages/Person/index.jsx`
- Modify: `client/src/pages/Outfit/index.jsx`
- Modify: `client/src/store/index.js`

### Docs / Specs
- Already prepared: `openspec/changes/add-outfit-management-closure/*`
- Create or update status notes only if implementation scope changes materially

## Delivery Phases

### Phase 1: Recommendation History + Feedback
目标：让每次推荐结果自动沉淀为可追踪对象，并支持反馈回流。

### Phase 2: Outfit Logs
目标：让用户可以手动记录穿搭，或从推荐结果快速生成穿搭记录。

### Phase 3: Style Profile
目标：基于结构化行为数据生成长期偏好摘要，供系统与 Agent 使用。

### Phase 4: Wardrobe Analytics
目标：将闭环数据转化为管理视图和答辩可展示的统计页面。

## Task 1: Define Phase 1 Data Contract

**Files:**
- Create: `server/migrations/create_outfit_management_closure.sql`
- Modify: `openspec/changes/add-outfit-management-closure/design.md`

- [x] Step 1: 定义 `recommendation_history` 表字段
- [x] Step 2: 定义 `recommendation_feedback` 表字段与外键关系
- [x] Step 3: 明确推荐结果保存的最小字段集合
- [x] Step 4: 确认推荐历史与套装/穿搭记录的关联预留字段
- [x] Step 5: 在 SQL 迁移文件中写出建表语句与索引

## Task 2: Add Tested Recommendation Helper Layer

**Files:**
- Create: `server/controllers/recommendations.helpers.js`
- Create: `server/tests/recommendations.helpers.test.js`

- [x] Step 1: 先为“推荐输入摘要构建”写失败测试
- [x] Step 2: 运行 `node --test server/tests/recommendations.helpers.test.js`
- [x] Step 3: 实现最小 helper 使测试通过
- [x] Step 4: 为“推荐结果摘要和反馈标签规范化”补失败测试
- [x] Step 5: 再次运行 `node --test server/tests/recommendations.helpers.test.js`

## Task 3: Implement Recommendation History Backend

**Files:**
- Create: `server/routes/recommendations.js`
- Create: `server/controllers/recommendations.js`
- Modify: `server/app.js`

- [x] Step 1: 增加推荐历史控制器查询函数
- [x] Step 2: 增加推荐历史写入函数
- [x] Step 3: 增加推荐详情查询函数
- [x] Step 4: 增加采纳状态更新函数
- [x] Step 5: 增加反馈写入与查询函数
- [x] Step 6: 新建路由并统一使用 JWT 鉴权
- [x] Step 7: 在 `server/app.js` 注册新路由

## Task 4: Integrate Recommendation Auto-Persistence

**Files:**
- Modify: `client/src/pages/Recommend/index.jsx`
- Modify: `server/controllers/sceneApi.js`

- [x] Step 1: 确定推荐历史由前端持久化还是后端持久化
- [x] Step 2: 在推荐成功后写入推荐历史
- [x] Step 3: 为推荐结果附带必要上下文摘要
- [x] Step 4: 防止推荐结果为空时写入脏历史

## Task 5: Build Recommendation History Page

**Files:**
- Create: `client/src/pages/RecommendationHistory/index.jsx`
- Create: `client/src/pages/RecommendationHistory/index.module.less`
- Modify: `client/src/router/index.jsx`
- Modify: `client/src/pages/Person/index.jsx`

- [x] Step 1: 新建历史页骨架和列表查询
- [x] Step 2: 展示推荐场景、结果摘要、采纳状态
- [x] Step 3: 加入反馈提交入口
- [x] Step 4: 在个人中心添加入口
- [x] Step 5: 在路由中注册页面

## Task 6: Build Outfit Log Backend

**Files:**
- Create: `server/routes/outfitLogs.js`
- Create: `server/controllers/outfitLogs.js`
- Modify: `server/app.js`

- [x] Step 1: 定义 `outfit_logs` 与 `outfit_log_items` 数据写入逻辑
- [x] Step 2: 实现列表、详情、创建、修改、删除接口
- [x] Step 3: 支持 `recommendation_id`、`suit_id`、`source` 字段
- [x] Step 4: 注册新路由

## Task 7: Build Outfit Log Frontend

**Files:**
- Create: `client/src/pages/OutfitLogs/index.jsx`
- Create: `client/src/pages/OutfitLogs/index.module.less`
- Modify: `client/src/router/index.jsx`
- Modify: `client/src/pages/Recommend/index.jsx`
- Modify: `client/src/pages/Outfit/index.jsx`
- Modify: `client/src/pages/Person/index.jsx`

- [x] Step 1: 实现穿搭记录列表页
- [x] Step 2: 实现新建穿搭记录表单
- [x] Step 3: 增加“从推荐结果记录穿搭”
- [ ] Step 4: 增加“从衣橱加入穿搭记录”
- [x] Step 5: 增加个人中心入口

## Task 8: Build Style Profile Backend + UI

**Files:**
- Create: `server/routes/profileInsights.js`
- Create: `server/controllers/profileInsights.js`
- Create: `client/src/pages/ProfileInsights/index.jsx`
- Create: `client/src/pages/ProfileInsights/index.module.less`
- Modify: `client/src/router/index.jsx`
- Modify: `client/src/pages/Person/index.jsx`

- [x] Step 1: 编写画像聚合规则
- [x] Step 2: 实现画像查询接口
- [x] Step 3: 实现画像刷新接口
- [x] Step 4: 完成画像展示页
- [x] Step 5: 在个人中心添加画像入口

## Task 9: Build Analytics Backend + UI

**Files:**
- Create: `client/src/pages/WardrobeAnalytics/index.jsx`
- Create: `client/src/pages/WardrobeAnalytics/index.module.less`
- Modify: `server/controllers/profileInsights.js`
- Modify: `client/src/router/index.jsx`
- Modify: `client/src/pages/Person/index.jsx`

- [x] Step 1: 实现衣物分类、风格、颜色统计
- [x] Step 2: 实现推荐次数、采纳率、穿搭趋势统计
- [x] Step 3: 实现分析页展示
- [x] Step 4: 在个人中心添加分析入口

## Task 10: Verification Checklist

**Files:**
- Test: `server/tests/recommendations.helpers.test.js`
- Verify: `client` lint and critical manual smoke tests

- [x] Step 1: 运行 `node --test server/tests/recommendations.helpers.test.js`
- [x] Step 2: 运行 `cd client && npm run lint`
- [ ] Step 3: 手工验证“生成推荐 -> 自动入历史 -> 提交反馈”
- [ ] Step 4: 手工验证“推荐转穿搭记录”
- [ ] Step 5: 手工验证“画像页与分析页展示”

## Immediate Execution Order

1. 先完成 Phase 1：`recommendation_history` + `recommendation_feedback`
2. 再完成 Phase 2：`outfit_logs` + `outfit_log_items`
3. 然后完成 Phase 3：`user_style_profile`
4. 最后补 Phase 4：分析聚合与展示

## Notes for This Session

- 本轮先执行 Phase 1，优先交付推荐历史与反馈闭环
- 后续阶段遵循同一计划顺序推进
- 若中途发现字段需要调整，以 OpenSpec 为准并同步更新本计划
