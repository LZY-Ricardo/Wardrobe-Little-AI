# Unified Agent 通用图片输出 V1 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 让 unified-agent 的 assistant message 在系统已有图片与组合图场景下支持通用图片输出，并保持会话恢复、SSE 和前端聊天渲染一致。

**Architecture:** 继续复用现有 `meta.attachments` 持久化链路，但扩展 attachment schema，使其适用于 assistant。新增独立 attachment builder 负责把衣物、推荐、套装、穿搭记录等业务对象映射成图片附件，前端则将当前仅用于用户图片的渲染逻辑抽成通用消息图片区。

**Tech Stack:** Koa, React, Vite, node:test, existing unified-agent runtime, existing AiChat message meta normalization

---

### Task 1: 扩展 assistant attachment 协议

**Files:**
- Modify: `server/controllers/unifiedAgentMessageMeta.js`
- Modify: `client/src/pages/AiChat/messageMeta.js`
- Test: `server/tests/unifiedAgentMessageMeta.test.js`
- Test: `client/src/pages/AiChat/viewModels.test.mjs`

- [ ] **Step 1: 为服务端 meta 归一化补失败测试**

为 `server/tests/unifiedAgentMessageMeta.test.js` 新增 case：
- assistant attachment 保留 `source`、`variant`、`objectType`、`objectId`
- 旧 attachment 结构仍可通过
- 非法字段被裁剪

- [ ] **Step 2: 运行服务端目标测试并确认先失败**

Run: `node --test "server/tests/unifiedAgentMessageMeta.test.js"`
Expected: FAIL，原因是新增字段未被保留

- [ ] **Step 3: 扩展服务端 normalizeAttachments**

在 `server/controllers/unifiedAgentMessageMeta.js` 中：
- 为 attachment 增加 `source`、`variant`、`objectType`
- 将 `objectId` 归一化为有限正整数
- 保持旧字段兼容与数量上限

- [ ] **Step 4: 为前端 message meta / view model 补失败测试**

在 `client/src/pages/AiChat/viewModels.test.mjs` 或必要的新测试中增加：
- assistant message 的 attachment 扩展字段能被保留
- 旧 user image message 仍正常映射

- [ ] **Step 5: 运行前端目标测试并确认先失败**

Run: `cd client && node --test "src/pages/AiChat/viewModels.test.mjs"`
Expected: FAIL，原因是扩展字段未映射或被丢弃

- [ ] **Step 6: 扩展前端 attachment 归一化**

在 `client/src/pages/AiChat/messageMeta.js` 中同步扩展 attachment schema，确保前后端归一化规则一致。

- [ ] **Step 7: 重新运行协议层测试**

Run:
- `node --test "server/tests/unifiedAgentMessageMeta.test.js"`
- `cd client && node --test "src/pages/AiChat/viewModels.test.mjs"`

Expected: PASS

### Task 2: 新增 assistant 图片附件装配层

**Files:**
- Create: `server/controllers/unifiedAgentAttachments.js`
- Modify: `server/controllers/unifiedAgent.helpers.js`
- Test: `server/tests/unifiedAgentAttachments.test.js`

- [ ] **Step 1: 为 attachment builder 写失败测试**

新建 `server/tests/unifiedAgentAttachments.test.js`，覆盖：
- cloth -> 1 张 `original` 图
- recommendation -> 1 张 `composite` + 最多 3 张原始图
- 无图片对象 -> 空数组

- [ ] **Step 2: 运行 attachment builder 测试并确认先失败**

Run: `node --test "server/tests/unifiedAgentAttachments.test.js"`
Expected: FAIL，原因是模块不存在

- [ ] **Step 3: 创建 `unifiedAgentAttachments.js` 最小实现**

实现以下职责：
- 规范化 cloth / suit / recommendation / outfit_log 候选对象
- 生成统一 attachment 结构
- 控制数量上限
- 只允许内部来源与组合图来源

- [ ] **Step 4: 在 helper 层提供业务对象解析入口**

在 `server/controllers/unifiedAgent.helpers.js` 增加小型 helper：
- 解析当前 cloth
- 解析当前 recommendation 结果
- 解析当前 suit / outfit log

避免在 runtime 中直接写大段业务判断。

- [ ] **Step 5: 重新运行 attachment builder 测试**

Run: `node --test "server/tests/unifiedAgentAttachments.test.js"`
Expected: PASS

### Task 3: 将 assistant 图片接入 unified-agent runtime

**Files:**
- Modify: `server/controllers/unifiedAgentRuntime.js`
- Modify: `server/tests/unifiedAgent.integration.test.js`
- Test: `server/tests/unifiedAgentStream.test.js`
- Test: `server/tests/unifiedAgentStreamController.test.js`

- [ ] **Step 1: 为 runtime 集成链路补失败测试**

在 `server/tests/unifiedAgent.integration.test.js` 或相关 stream test 中新增 case：
- recommendation 场景 assistant message 最终保存后带 `attachments`
- cloth detail 场景 assistant message 带 `attachments`

- [ ] **Step 2: 运行目标 runtime 测试并确认先失败**

Run:
- `node --test "server/tests/unifiedAgent.integration.test.js"`

Expected: FAIL，原因是 assistant message 尚未附带 attachments

- [ ] **Step 3: 在 runtime 中接入 attachment builder**

在 `server/controllers/unifiedAgentRuntime.js` 中：
- 在保存 assistant message 前，根据 latestTask / taskResult / 当前对象解析 attachment
- 将 attachment 写入 assistant message `meta`
- 保持 `actionButton`、`toolCalls`、`toolResultsSummary` 兼容

- [ ] **Step 4: 确认流式恢复 payload 不丢失 assistant attachments**

检查 `message_saved`、`restoreAgentSession` 路径，必要时调整测试夹具，保证会话恢复后图片仍存在。

- [ ] **Step 5: 重新运行服务端 runtime 相关测试**

Run:
- `node --test "server/tests/unifiedAgent.integration.test.js"`
- `node --test "server/tests/unifiedAgentStream.test.js"`
- `node --test "server/tests/unifiedAgentStreamController.test.js"`

Expected: PASS

### Task 4: 将 AiChat 图片渲染升级为通用消息图片区

**Files:**
- Modify: `client/src/pages/AiChat/index.jsx`
- Modify: `client/src/pages/AiChat/viewModels.js`
- Modify: `client/src/pages/AiChat/contract.test.mjs`
- Modify: `client/src/pages/AiChat/index.module.less`

- [ ] **Step 1: 为 assistant 图片渲染补失败测试**

在 `client/src/pages/AiChat/contract.test.mjs` 或适合的测试文件中新增 case：
- assistant 单图渲染
- assistant 多图渲染
- `composite` 图优先主展示

- [ ] **Step 2: 运行前端目标测试并确认先失败**

Run:
- `cd client && node --test "src/pages/AiChat/contract.test.mjs"`
- `cd client && node --test "src/pages/AiChat/viewModels.test.mjs"`

Expected: FAIL，原因是 assistant attachments 还未进入渲染分支

- [ ] **Step 3: 在 viewModels 中补充 attachment 展示语义**

在 `client/src/pages/AiChat/viewModels.js` 中：
- 保留 attachment 扩展字段
- 增加主图优先级计算（`composite` 优先）
- 不破坏现有 user image message

- [ ] **Step 4: 抽取通用消息图片区**

在 `client/src/pages/AiChat/index.jsx` 中：
- 将现有用户图片网格改成通用 renderer
- assistant 也走同一组件/同一分支
- 保持 action button、tool timeline、reasoning 展示互不干扰

- [ ] **Step 5: 补充必要样式**

在 `client/src/pages/AiChat/index.module.less` 中：
- 支持 assistant 图片卡的布局
- 支持主图 + 缩略图
- 避免对用户消息样式回归

- [ ] **Step 6: 重新运行前端测试**

Run:
- `cd client && node --test "src/pages/AiChat/contract.test.mjs"`
- `cd client && node --test "src/pages/AiChat/viewModels.test.mjs"`

Expected: PASS

### Task 5: 回归验证与最小烟测

**Files:**
- No new files unless fixing regressions found during verification

- [ ] **Step 1: 运行语法与目标测试**

Run:
- `node -c "server/controllers/unifiedAgentAttachments.js"`
- `node -c "server/controllers/unifiedAgentRuntime.js"`
- `cd client && npx eslint "src/pages/AiChat/index.jsx" "src/pages/AiChat/viewModels.js" "src/pages/AiChat/messageMeta.js"`

Expected: PASS

- [ ] **Step 2: 运行本次新增/受影响测试集**

Run:
- `node --test "server/tests/unifiedAgentMessageMeta.test.js" "server/tests/unifiedAgentAttachments.test.js" "server/tests/unifiedAgent.integration.test.js" "server/tests/unifiedAgentStream.test.js" "server/tests/unifiedAgentStreamController.test.js"`
- `cd client && node --test "src/pages/AiChat/contract.test.mjs" "src/pages/AiChat/viewModels.test.mjs"`

Expected: PASS

- [ ] **Step 3: 记录未覆盖风险**

若存在未完成项，明确记录：
- recommendation 历史老数据不带 image 的回图限制
- composite 图生成位置是否仍需后续统一
- 仓库中与本任务无关的既有 lint 失败项
