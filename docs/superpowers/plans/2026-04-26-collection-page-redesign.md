# Collection Page Redesign Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 重做 `/match?tab=collection` 的套装库页面，让它更像紧凑的“收藏库/资产库”而不是大卡片堆叠页，同时保留现有的套装操作能力。

**Architecture:** 保持 `MatchHub` 负责顶层 tab 切换，`Suits` 负责 collection 内容。新增一个小型 `viewModel` 统一处理套装标题、封面、缩略图、场景和条目预览，避免在 JSX 里继续堆展示逻辑。样式主要收敛在 `Suits` 与少量 `MatchHub` 容器层。

**Tech Stack:** React 18, Zustand, react-router-dom, antd-mobile, react-vant, Less, node:test

---

### Task 1: Collection View Model

**Files:**
- Create: `client/src/pages/Suits/viewModel.js`
- Test: `client/src/pages/Suits/viewModel.test.mjs`
- Reference: `client/src/utils/suitName.js`

- [ ] **Step 1: Write the failing test for title/meta/thumb derivation**
- [ ] **Step 2: Run `node client/src/pages/Suits/viewModel.test.mjs` to verify it fails**
- [ ] **Step 3: Implement minimal suit card view model**
- [ ] **Step 4: Run the test again and verify it passes**

### Task 2: Suits Page Structure

**Files:**
- Modify: `client/src/pages/Suits/index.jsx`

- [ ] **Step 1: Replace inline card derivation with the new view model**
- [ ] **Step 2: Rebuild embedded collection header, stats, and card layout**
- [ ] **Step 3: Keep delete/Agent/new create flows unchanged while moving them into the new layout**

### Task 3: Collection Styles

**Files:**
- Modify: `client/src/pages/Suits/index.module.less`
- Modify: `client/src/pages/MatchHub/index.module.less`

- [ ] **Step 1: Rework collection page into a compact mobile library layout**
- [ ] **Step 2: Style suit mosaic cover, metadata rows, and action chips**
- [ ] **Step 3: Tighten MatchHub tab shell so the collection page sits in a cleaner frame**

### Task 4: Verification

**Files:**
- Test: `client/src/pages/Suits/viewModel.test.mjs`

- [ ] **Step 1: Run `node client/src/pages/Suits/viewModel.test.mjs`**
- [ ] **Step 2: Run `cd client && npm run lint`**
- [ ] **Step 3: Fix regressions and re-run verification**
