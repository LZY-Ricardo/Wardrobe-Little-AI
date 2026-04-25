# Full Autonomous Tool Calling Phase 2 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 将 unified-agent 从“部分自主工具调用 + 旧规则 fallback”推进为“所有工具由 LLM 自主决定调用，runtime 只保留护栏与确认”的形态。

**Architecture:** 真实接口进入 unified-agent 后统一走 `unifiedAgentRuntime` 的 tool-calling loop，由 LLM 决定是否调用工具、调用哪些工具、何时停止。runtime 只负责工具白名单、参数校验、错误兜底、最大轮数控制、会话上下文注入，以及对写操作的统一确认拦截。旧的 `runAgentWorkflow`、`resolveWriteActionOptions`、`classifyAgentTask` 不再承担主路径职责，仅作为兼容层或测试过渡层存在，最终可逐步删除。

**Tech Stack:** Node.js, Koa, DeepSeek Chat Completions, node:test, OpenSpec

---

### Task 1: 统一真实入口为全量 autonomous tool loop

**Files:**
- Modify: `server/controllers/unifiedAgentRuntime.js`
- Modify: `server/routes/unifiedAgent.js`
- Modify: `server/routes/chat.js`
- Test: `server/tests/unifiedAgent.integration.test.js`

- [ ] **Step 1: 写失败测试**

为真实接口模式补测试，验证在 `enableAutonomousTools=true` 时：
- 不再先进入 `runAgentWorkflow`
- 不再先进入 `resolveWriteActionOptions`
- 若 LLM 不调用工具，则仍能返回普通聊天回复

- [ ] **Step 2: 运行测试并确认失败**

Run: `node --test "server/tests/unifiedAgent.integration.test.js" --test-name-pattern "autonomous"`
Expected: 旧 fallback 仍然先执行，测试失败。

- [ ] **Step 3: 实现最小改动**

在 `server/controllers/unifiedAgentRuntime.js` 中调整 `prepareAgentMessage()`：
- `enableAutonomousTools=true` 时直接进入统一 tool loop
- 只有显式测试/兼容模式才走旧 fallback
- 返回值保持现有 `latest_task` / `message` 结构，避免前端回归

- [ ] **Step 4: 重新运行测试**

Run: `node --test "server/tests/unifiedAgent.integration.test.js" --test-name-pattern "autonomous"`
Expected: PASS

- [ ] **Step 5: 提交检查点**

建议提交信息：`feat: route unified agent through autonomous tool loop`

### Task 2: 将图片录入链路并入统一工具编排

**Files:**
- Modify: `server/controllers/unifiedAgentRuntime.js`
- Modify: `server/controllers/agentOrchestrator.js`
- Modify: `server/controllers/agent.js`
- Test: `server/tests/agentWorkflow.integration.test.js`
- Test: `server/tests/unifiedAgent.integration.test.js`

- [ ] **Step 1: 写失败测试**

补测试覆盖：
- 用户发送图片时，LLM 可先调用 `analyze_image`
- 再根据结果决定回答问题、生成草稿或发起 `create_cloth`
- 缺字段时进入澄清，不直接写库

- [ ] **Step 2: 运行测试并确认失败**

Run: `node --test "server/tests/agentWorkflow.integration.test.js"`
Expected: 仍依赖 `runAgentWorkflow` 的图片录入流程，无法完全通过统一 tool loop。

- [ ] **Step 3: 写最小实现**

实现策略：
- 将 `analyze_image` 保留为统一工具目录的一部分
- 在 autonomous loop 中允许其输出被后续写工具消费
- `runAgentWorkflow` 降级为兼容层，不再是真实入口主链

- [ ] **Step 4: 运行测试验证**

Run:
- `node --test "server/tests/agentWorkflow.integration.test.js"`
- `node --test "server/tests/unifiedAgent.integration.test.js" --test-name-pattern "image|ingest|cloth"`

Expected: PASS

- [ ] **Step 5: 提交检查点**

建议提交信息：`feat: unify image ingest flow under tool loop`

### Task 3: 将上下文对象操作完全交给 LLM 决策

**Files:**
- Modify: `server/controllers/unifiedAgentRuntime.js`
- Modify: `server/controllers/agent.js`
- Modify: `server/controllers/unifiedAgent.helpers.js`
- Test: `server/tests/unifiedAgent.integration.test.js`

- [ ] **Step 1: 写失败测试**

增加测试覆盖这些表达：
- “查看刚刚那双鞋”
- “把这件衣服颜色改成蓝色”
- “删除这套搭配”
- “把当前推荐记成今天穿搭”

要求由 LLM 结合上下文自主决定工具，而不是靠 `resolveWriteActionOptions()` 手工解析。

- [ ] **Step 2: 运行测试并确认失败**

Run: `node --test "server/tests/unifiedAgent.integration.test.js" --test-name-pattern "current|contextual|刚刚|当前"`
Expected: 仍依赖旧的上下文规则解析逻辑。

- [ ] **Step 3: 写最小实现**

实现策略：
- 在 tool loop 前注入标准化上下文块（当前衣物 / 当前套装 / 当前推荐 / 当前记录）
- 写操作由 LLM 输出对应工具调用
- runtime 用 `executeAgentToolIntent()` 统一桥接到确认机制
- `resolveWriteActionOptions()` 降级为兼容层

- [ ] **Step 4: 运行测试验证**

Run: `node --test "server/tests/unifiedAgent.integration.test.js"`
Expected: PASS

- [ ] **Step 5: 提交检查点**

建议提交信息：`feat: move contextual actions into llm tool decisions`

### Task 4: 退役旧规则分流的主路径职责

**Files:**
- Modify: `server/controllers/unifiedAgentRuntime.js`
- Modify: `server/controllers/agentOrchestrator.js`
- Modify: `server/controllers/agent.helpers.js`
- Possibly Modify: `server/tests/agent.helpers.test.js`
- Test: `server/tests/unifiedAgent.integration.test.js`

- [ ] **Step 1: 写失败测试**

验证真实 autonomous 模式下：
- `classifyAgentTask()` 不再决定主路径
- `runAgentWorkflow()` 不再决定主路径
- `resolveWriteActionOptions()` 不再决定主路径

- [ ] **Step 2: 运行测试并确认失败**

Run:
- `node --test "server/tests/unifiedAgent.integration.test.js"`
- `node --test "server/tests/agent.helpers.test.js"`

Expected: 旧逻辑仍被主链引用。

- [ ] **Step 3: 写最小实现**

实现策略：
- 将这些函数保留为 fallback/兼容工具
- 从真实 autonomous 主路径中移除其调用依赖
- 保持测试可控，不一次性大删文件

- [ ] **Step 4: 重新运行测试**

Run:
- `node --test "server/tests/unifiedAgent.integration.test.js"`
- `node --test "server/tests/agentWorkflow.integration.test.js"`
- `node --test "server/tests/agent.helpers.test.js"`

Expected: PASS

- [ ] **Step 5: 提交检查点**

建议提交信息：`refactor: demote legacy agent routing to compatibility layer`

### Task 5: 强化 runtime 护栏与异常恢复

**Files:**
- Modify: `server/controllers/unifiedAgentRuntime.js`
- Modify: `server/utils/toolRegistry.js`
- Test: `server/tests/unifiedAgent.integration.test.js`

- [ ] **Step 1: 写失败测试**

覆盖这些风险：
- LLM 给出未知工具
- LLM 给出坏参数
- 多轮工具调用超过最大轮数
- 工具返回错误时，模型仍可继续澄清或兜底回复

- [ ] **Step 2: 运行测试并确认失败**

Run: `node --test "server/tests/unifiedAgent.integration.test.js" --test-name-pattern "invalid|unknown|max|error"`
Expected: 当前护栏不完整。

- [ ] **Step 3: 写最小实现**

补齐：
- `unknown tool` -> tool error message 回填
- invalid write args -> 不炸会话
- max rounds -> 稳定兜底回复
- tool meta 继续回写给前端

- [ ] **Step 4: 运行测试验证**

Run: `node --test "server/tests/unifiedAgent.integration.test.js"`
Expected: PASS

- [ ] **Step 5: 提交检查点**

建议提交信息：`fix: harden autonomous tool runtime guardrails`

### Task 6: 文档与规格同步

**Files:**
- Modify: `openspec/changes/add-full-product-agent-orchestration/design.md`
- Modify: `openspec/changes/add-full-product-agent-orchestration/tasks.md`
- Modify: `docs/architecture/ai-chat-tool-calling.md`

- [ ] **Step 1: 更新设计文档**

把当前架构描述更新为：
- 全量 LLM 决策工具调用
- runtime 负责执行护栏
- 写操作统一确认

- [ ] **Step 2: 更新任务清单**

将阶段二完成项同步到 OpenSpec `tasks.md`。

- [ ] **Step 3: 运行规格校验**

Run: `openspec validate add-full-product-agent-orchestration --strict`
Expected: PASS

- [ ] **Step 4: 提交检查点**

建议提交信息：`docs: align openspec with full autonomous tool calling`

### Task 7: 全量回归验证

**Files:**
- Test: `server/tests/unifiedAgent.integration.test.js`
- Test: `server/tests/agentWorkflow.integration.test.js`
- Test: `server/tests/agent.helpers.test.js`
- Test: `server/tests/unifiedAgent.helpers.test.js`
- Test: `server/tests/aichatPrompt.test.js`
- Test: `client` lint

- [ ] **Step 1: 运行后端测试**

Run:
- `node --test "server/tests/unifiedAgent.integration.test.js"`
- `node --test "server/tests/agentWorkflow.integration.test.js"`
- `node --test "server/tests/agent.helpers.test.js"`
- `node --test "server/tests/unifiedAgent.helpers.test.js"`
- `node --test "server/tests/aichatPrompt.test.js"`

Expected: 全部 PASS

- [ ] **Step 2: 运行前端 lint**

Run: `cd client && npm run lint -- --quiet`
Expected: PASS

- [ ] **Step 3: 人工冒烟检查**

检查真实接口下至少这些场景：
- 纯文本问衣橱
- 纯文本改衣物
- 图片问内容
- 图片直接存衣橱
- 推荐后保存为套装
- 推荐后记录穿搭

- [ ] **Step 4: 汇总残留兼容层**

记录哪些旧 helper 仍保留、为什么保留、何时可删除。
