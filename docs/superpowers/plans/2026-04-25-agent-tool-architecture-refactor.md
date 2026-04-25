# Agent 工具体系架构重构 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 将 Agent 工具体系从集中式注册表重构为分层架构，同时保持 unified-agent 现有对外行为、确认流和前端展示兼容。

**Architecture:** 采用“注册层 + 策略层 + 运行时层 + handler 层 + 兼容层”的渐进迁移方案。先抽离工具元数据和策略，再迁移按业务域组织的执行逻辑，最后收敛 runtime 与 confirmation/fallback 逻辑，整个过程中保留 `server/utils/toolRegistry.js`、`server/controllers/agent.js`、`server/controllers/unifiedAgentRuntime.js` 的兼容出口，但禁止继续向这些兼容层注入新业务逻辑。

**Tech Stack:** Node.js, Koa, DeepSeek tool calling, MySQL, Node test runner, ESLint

---

## File Map

### New Files
- `server/agent/tools/registry/catalog.js`：统一工具元数据目录，聚合所有工具定义
- `server/agent/tools/registry/index.js`：暴露 catalog 查询、按名称取工具、按上下文过滤工具
- `server/agent/tools/policies/confirmationPolicy.js`：统一确认策略与低风险免确认判断
- `server/agent/tools/policies/contextPolicy.js`：统一 latest task / multimodal / session context 注入规则
- `server/agent/tools/policies/toolVisibilityPolicy.js`：按 intent / 输入模式 / 会话上下文过滤 LLM 可见工具
- `server/agent/tools/runtime/toolDefinitionBuilder.js`：把元数据转换为 LLM tools schema
- `server/agent/tools/runtime/toolExecutionRouter.js`：根据 metadata 与 ctx 分发到具体 handler
- `server/agent/tools/runtime/toolEventAdapter.js`：统一生成 tool 过程事件、toolCalls、toolResultsSummary
- `server/agent/tools/handlers/wardrobe/readTools.js`：衣物域读工具
- `server/agent/tools/handlers/wardrobe/writeTools.js`：衣物域写工具
- `server/agent/tools/handlers/suits/readTools.js`：套装域读工具
- `server/agent/tools/handlers/suits/writeTools.js`：套装域写工具
- `server/agent/tools/handlers/outfitLogs/readTools.js`：穿搭记录域读工具
- `server/agent/tools/handlers/outfitLogs/writeTools.js`：穿搭记录域写工具
- `server/agent/tools/handlers/profile/readTools.js`：画像/偏好域读工具
- `server/agent/tools/handlers/profile/writeTools.js`：画像/偏好域写工具
- `server/agent/tools/handlers/vision/analyzeImageTool.js`：图片分析工具 handler
- `server/controllers/agentTaskHistoryRepository.js`：Agent 任务历史读写与恢复
- `server/controllers/confirmationService.js`：待确认任务生成、确认、取消、恢复
- `server/controllers/legacyTaskFallbackService.js`：未进入 tool loop 的旧自然语言任务 fallback
- `server/tests/toolRegistry.catalog.test.js`：registry 层测试
- `server/tests/toolPolicies.test.js`：policy 层测试
- `server/tests/toolExecutionRouter.test.js`：执行路由测试
- `server/tests/toolEventAdapter.test.js`：事件适配层测试

### Modified Files
- `server/utils/toolRegistry.js`：降级为兼容导出层
- `server/controllers/unifiedAgentRuntime.js`：改用新 registry / policy / runtime 模块
- `server/controllers/agent.js`：收敛为兼容聚合出口，调用 confirmation/history/fallback 服务
- `server/controllers/qwenVision.js`：通过新 vision handler 复用，避免双入口分叉
- `server/tests/agent.integration.test.js`
- `server/tests/unifiedAgent.integration.test.js`
- `server/tests/agentWorkflow.integration.test.js`

### Compatibility Constraints
- `server/utils/toolRegistry.js` 只能保留导出、适配和迁移期转发，不允许新增业务执行逻辑
- `server/controllers/unifiedAgentRuntime.js` 不允许新增工具级 if/else 分发
- `server/controllers/agent.js` 不允许继续吸收新的确认策略或执行桥接逻辑

---

### Task 1: 搭建工具元数据与目录层

**Files:**
- Create: `server/agent/tools/registry/catalog.js`
- Create: `server/agent/tools/registry/index.js`
- Modify: `server/utils/toolRegistry.js`
- Test: `server/tests/toolRegistry.catalog.test.js`

- [ ] **Step 1: 编写失败测试，锁定 catalog 的基础能力**

```js
test('catalog exposes all registered tool names and metadata fields', () => {
  const { listTools, getToolByName } = require('../agent/tools/registry')
  const tools = listTools()
  assert.ok(tools.find((tool) => tool.name === 'create_cloth'))
  assert.equal(getToolByName('create_cloth').domain, 'wardrobe')
  assert.equal(getToolByName('create_cloth').mode, 'write')
})
```

- [ ] **Step 2: 运行测试，确认当前缺失**

Run: `node --test server/tests/toolRegistry.catalog.test.js`  
Expected: FAIL，提示模块或导出不存在

- [ ] **Step 3: 在 catalog 中建立标准 metadata 结构**

要求至少覆盖字段：
- `name`
- `domain`
- `mode`
- `dangerous`
- `confirmationPolicy`
- `llmVisible`
- `contextRequirements`
- `parameters`
- `uiLabel`
- `resultPresenter`
- `confirmationDescriptor`

- [ ] **Step 4: 在 registry/index 中实现查询接口**

要求提供：
- `listTools()`
- `getToolByName(name)`
- `listToolsForLlm(context)`

- [ ] **Step 5: 把 `server/utils/toolRegistry.js` 改造成兼容层**

保持对外兼容：
- `TOOL_DEFINITIONS`
- `getToolDefinition(name)`
- `executeTool(name, args, ctx)`  

但内部不再直接维护工具事实来源，而是转调新 registry 和后续 router。

- [ ] **Step 6: 运行测试验证 catalog 与兼容层**

Run: `node --test server/tests/toolRegistry.catalog.test.js server/tests/unifiedAgent.integration.test.js`  
Expected: PASS

---

### Task 2: 建立策略层

**Files:**
- Create: `server/agent/tools/policies/confirmationPolicy.js`
- Create: `server/agent/tools/policies/contextPolicy.js`
- Create: `server/agent/tools/policies/toolVisibilityPolicy.js`
- Test: `server/tests/toolPolicies.test.js`

- [ ] **Step 1: 编写失败测试，锁定策略行为**

```js
test('delete tools always require confirmation', () => {
  const { resolveConfirmationRequirement } = require('../agent/tools/policies/confirmationPolicy')
  const result = resolveConfirmationRequirement({ mode: 'write', confirmationPolicy: 'always', name: 'delete_cloth' }, {})
  assert.equal(result.requiresConfirmation, true)
})

test('low risk favorite toggle can honor user preference', () => {
  const { resolveConfirmationRequirement } = require('../agent/tools/policies/confirmationPolicy')
  const result = resolveConfirmationRequirement(
    { mode: 'write', confirmationPolicy: 'low-risk-optional', name: 'set_cloth_favorite' },
    { profile: { confirmationPreferences: { lowRiskNoConfirm: true } } }
  )
  assert.equal(result.requiresConfirmation, false)
})
```

- [ ] **Step 2: 运行测试确认缺失**

Run: `node --test server/tests/toolPolicies.test.js`  
Expected: FAIL

- [ ] **Step 3: 实现确认策略模块**

覆盖规则：
- 查询工具永不确认
- 删除类始终确认
- 低风险写工具可按用户偏好免确认
- 批量写工具默认确认

- [ ] **Step 4: 实现上下文策略模块**

至少支持：
- latest cloth/suit/outfit-log/recommendation context
- multimodal attachments
- session memory / preference summary 的最小注入接口

- [ ] **Step 5: 实现工具可见性策略**

第一阶段至少支持：
- `clothing` 与 `project` 两类 intent 过滤
- 图片输入时才暴露 `analyze_image`

- [ ] **Step 6: 运行策略测试**

Run: `node --test server/tests/toolPolicies.test.js`  
Expected: PASS

---

### Task 3: 建立运行时层与事件适配层

**Files:**
- Create: `server/agent/tools/runtime/toolDefinitionBuilder.js`
- Create: `server/agent/tools/runtime/toolExecutionRouter.js`
- Create: `server/agent/tools/runtime/toolEventAdapter.js`
- Modify: `server/controllers/unifiedAgentRuntime.js`
- Test: `server/tests/toolExecutionRouter.test.js`
- Test: `server/tests/toolEventAdapter.test.js`

- [ ] **Step 1: 编写失败测试，锁定工具 schema 构建与事件格式**

```js
test('toolDefinitionBuilder converts metadata into llm tool schema', () => {
  const { buildLlmToolDefinitions } = require('../agent/tools/runtime/toolDefinitionBuilder')
  const defs = buildLlmToolDefinitions([{ name: 'list_clothes', description: 'x', parameters: { type: 'object', properties: {} } }])
  assert.equal(defs[0].function.name, 'list_clothes')
})

test('toolEventAdapter returns frontend-compatible tool meta', () => {
  const { buildToolCompletedEventMeta } = require('../agent/tools/runtime/toolEventAdapter')
  const meta = buildToolCompletedEventMeta({ toolName: 'analyze_image', ok: true, summary: '图片分析完成' })
  assert.equal(meta.toolCalls[0].name, 'analyze_image')
  assert.equal(meta.toolResultsSummary[0], '图片分析完成')
})
```

- [ ] **Step 2: 运行测试确认缺失**

Run: `node --test server/tests/toolExecutionRouter.test.js server/tests/toolEventAdapter.test.js`  
Expected: FAIL

- [ ] **Step 3: 实现 toolDefinitionBuilder**

要求：
- 从 registry metadata 生成 LLM tools schema
- 不再在 `unifiedAgentRuntime.js` 内手写大块工具定义拼装逻辑

- [ ] **Step 4: 实现 toolEventAdapter**

要求统一产出：
- `tool_call_started`
- `tool_call_completed`
- `toolCalls`
- `toolResultsSummary`

- [ ] **Step 5: 实现 toolExecutionRouter**

要求：
- 读工具直接执行
- 写工具依据 confirmationPolicy 决定走确认或直执
- 不在 router 中硬编码业务域逻辑，只根据 metadata 找 handler

- [ ] **Step 6: 把 `unifiedAgentRuntime.js` 接到新 runtime 层**

保留：
- 会话恢复
- SSE
- 消息写入
- autonomous loop 高层流程  

迁出：
- 工具 schema 拼装
- 工具执行细节
- 工具事件 meta 拼装

- [ ] **Step 7: 运行 runtime 相关测试**

Run: `node --test server/tests/toolExecutionRouter.test.js server/tests/toolEventAdapter.test.js server/tests/unifiedAgent.integration.test.js`  
Expected: PASS

---

### Task 4: 建立 confirmation / history / fallback 服务

**Files:**
- Create: `server/controllers/agentTaskHistoryRepository.js`
- Create: `server/controllers/confirmationService.js`
- Create: `server/controllers/legacyTaskFallbackService.js`
- Modify: `server/controllers/agent.js`
- Test: `server/tests/agent.integration.test.js`

- [ ] **Step 1: 编写失败测试，锁定待确认任务恢复与历史仓储行为**

```js
test('confirmation service can recover pending task from repository', async () => {
  const { getPendingByConfirmId } = require('../controllers/confirmationService')
  const pending = await getPendingByConfirmId(userId, confirmId)
  assert.equal(pending.confirmId, confirmId)
})
```

- [ ] **Step 2: 运行测试确认缺失**

Run: `node --test server/tests/agent.integration.test.js`  
Expected: FAIL in newly added coverage

- [ ] **Step 3: 抽出任务历史仓储**

迁移职责：
- insert history
- update history
- list history
- parse result_summary
- recover pending confirmation

- [ ] **Step 4: 抽出 confirmation service**

迁移职责：
- build persisted confirmation payload
- stage pending confirmation
- confirm
- cancel
- low-risk auto execute decision bridge

- [ ] **Step 5: 抽出 fallback service**

迁移职责：
- `classifyAgentTask`
- 非 tool loop 的兼容任务执行
- recommendation / analytics / closet query 等旧入口兜底

- [ ] **Step 6: 让 `agent.js` 退化为聚合出口**

要求：
- 对外 API 名保持不变
- 内部只编排新服务
- 禁止新增业务规则继续堆积

- [ ] **Step 7: 运行确认流测试**

Run: `node --test server/tests/agent.integration.test.js server/tests/agentWorkflow.integration.test.js`  
Expected: PASS

---

### Task 5: 迁移基础读工具批次

**Files:**
- Create/Modify: `server/agent/tools/handlers/profile/readTools.js`
- Create/Modify: `server/agent/tools/handlers/wardrobe/readTools.js`
- Modify: `server/utils/toolRegistry.js`
- Test: `server/tests/unifiedAgent.integration.test.js`

- [ ] **Step 1: 把以下工具迁入 handlers**
- `get_user_profile`
- `get_profile_insight`
- `get_wardrobe_analytics`
- `list_clothes`
- `get_cloth_detail`

- [ ] **Step 2: 每迁一个工具，都从兼容层切到 router + handler**

- [ ] **Step 3: 跑该批次回归**

Run: `node --test server/tests/unifiedAgent.integration.test.js server/tests/profileInsights.helpers.test.js`  
Expected: PASS

- [ ] **Step 4: 记录批次结果**

输出：
- 已迁移工具清单
- 未迁移工具清单
- 本批测试清单

---

### Task 6: 迁移衣物写工具批次

**Files:**
- Create/Modify: `server/agent/tools/handlers/wardrobe/writeTools.js`
- Modify: `server/controllers/agent.js`
- Test: `server/tests/agent.integration.test.js`
- Test: `server/tests/unifiedAgent.integration.test.js`

- [ ] **Step 1: 迁移以下工具**
- `create_cloth`
- `create_clothes_batch`
- `update_cloth_fields`
- `set_cloth_favorite`
- `delete_cloth`

- [ ] **Step 2: 为每个工具接入 metadata 中的 presenter 与 confirmation descriptor**

- [ ] **Step 3: 跑该批次回归**

Run: `node --test server/tests/agent.integration.test.js server/tests/unifiedAgent.integration.test.js`  
Expected: PASS

- [ ] **Step 4: 记录批次结果**

---

### Task 7: 迁移推荐 / 套装 / 穿搭写工具批次

**Files:**
- Create/Modify: `server/agent/tools/handlers/suits/readTools.js`
- Create/Modify: `server/agent/tools/handlers/suits/writeTools.js`
- Create/Modify: `server/agent/tools/handlers/outfitLogs/readTools.js`
- Create/Modify: `server/agent/tools/handlers/outfitLogs/writeTools.js`
- Test: `server/tests/unifiedAgent.integration.test.js`

- [ ] **Step 1: 迁移以下工具**
- `generate_scene_suits`
- `save_suit`
- `create_outfit_log`
- `delete_suit`
- `delete_outfit_log`

- [ ] **Step 2: 跑推荐与记录链路回归**

Run: `node --test server/tests/unifiedAgent.integration.test.js server/tests/agentWorkflow.integration.test.js`  
Expected: PASS

- [ ] **Step 3: 记录批次结果**

---

### Task 8: 迁移画像 / 偏好 / 多模态工具批次并做总收口

**Files:**
- Create/Modify: `server/agent/tools/handlers/profile/writeTools.js`
- Create/Modify: `server/agent/tools/handlers/vision/analyzeImageTool.js`
- Modify: `server/controllers/qwenVision.js`
- Modify: `server/controllers/unifiedAgentRuntime.js`
- Test: `server/tests/unifiedAgent.integration.test.js`
- Test: `server/tests/agentWorkflow.integration.test.js`

- [ ] **Step 1: 迁移以下工具**
- `update_user_sex`
- `update_confirmation_preferences`
- `analyze_image`

- [ ] **Step 2: 保证图片识别链路继续支持多件结构化结果**

- [ ] **Step 3: 跑多模态与批量入衣橱回归**

Run: `node --test server/tests/unifiedAgent.integration.test.js server/tests/agentWorkflow.integration.test.js`  
Expected: PASS

- [ ] **Step 4: 完成兼容层收口检查**

检查：
- `toolRegistry.js` 是否只剩兼容导出和转发
- `agent.js` 是否只剩服务聚合
- `unifiedAgentRuntime.js` 是否不再新增工具级硬编码分支

- [ ] **Step 5: 运行最终回归**

Run:
```bash
node --test server/tests/toolRegistry.catalog.test.js server/tests/toolPolicies.test.js server/tests/toolExecutionRouter.test.js server/tests/toolEventAdapter.test.js
node --test server/tests/agent.integration.test.js server/tests/agentWorkflow.integration.test.js server/tests/unifiedAgent.integration.test.js
cd client && npm run lint -- --quiet
```

Expected: all PASS

---

### Task 9: 文档与交付检查

**Files:**
- Modify: `openspec/changes/refactor-agent-tool-architecture/tasks.md`
- Modify: `docs/architecture/ai-chat-tool-calling.md` (if still relevant)

- [ ] **Step 1: 完成后回写 OpenSpec tasks 状态**

- [ ] **Step 2: 补更新后的工具结构说明文档**

- [ ] **Step 3: 记录兼容层保留项与后续删除条件**

- [ ] **Step 4: 交付前核对变更范围**

确认：
- 没有新业务逻辑继续写入兼容层
- 所有迁移批次都有对应测试
- 前端确认卡、工具状态展示、批量保存链路行为保持兼容
