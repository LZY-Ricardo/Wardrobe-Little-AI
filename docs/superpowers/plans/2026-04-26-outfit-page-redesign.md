# Outfit Page Redesign Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 将 `Outfit` 页面落地为新版衣橱管理界面，保留现有筛选与单品操作能力，同时改成默认收起二级筛选和底部详情抽屉。

**Architecture:** 保持 `client/src/pages/Outfit/index.jsx` 作为页面入口，新增轻量 `viewModel` 负责统计与筛选摘要，避免把展示推导逻辑继续堆在组件里。页面数据流仍然复用 `useClosetStore` 与现有接口，只改 UI 组织与样式。

**Tech Stack:** React 18, Zustand, antd-mobile, react-vant, Less, node:test

---

### Task 1: Outfit View Model

**Files:**
- Create: `client/src/pages/Outfit/viewModel.js`
- Test: `client/src/pages/Outfit/viewModel.test.mjs`

- [ ] **Step 1: Write the failing test**
- [ ] **Step 2: Run test to verify it fails**
- [ ] **Step 3: Write minimal implementation for stats, filter summary, and card tags**
- [ ] **Step 4: Run test to verify it passes**

### Task 2: Outfit Page JSX

**Files:**
- Modify: `client/src/pages/Outfit/index.jsx`
- Reference: `client/src/store/index.js`

- [ ] **Step 1: Replace inline display derivation with the new view model**
- [ ] **Step 2: Reorganize header, summary, compact filter bar, and filter panel**
- [ ] **Step 3: Convert detail modal content into bottom-sheet style structure**
- [ ] **Step 4: Verify page logic still supports search, filters, favorites, export/import, and detail actions**

### Task 3: Outfit Page Styles

**Files:**
- Modify: `client/src/pages/Outfit/index.module.less`

- [ ] **Step 1: Replace layered legacy styles with a single coherent mobile layout**
- [ ] **Step 2: Style compact and expanded secondary filter states**
- [ ] **Step 3: Style two-column card grid and bottom sheet actions**
- [ ] **Step 4: Check responsive behavior against the existing bottom navigation**

### Task 4: Verification

**Files:**
- Test: `client/src/pages/Outfit/viewModel.test.mjs`

- [ ] **Step 1: Run `node client/src/pages/Outfit/viewModel.test.mjs`**
- [ ] **Step 2: Run `cd client && npm run lint`**
- [ ] **Step 3: Fix any regressions and re-run verification**
