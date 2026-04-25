# LLM Autonomous Tool Calling Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 让 unified-agent 将工具选择权交给 LLM，同时保留现有写操作确认护栏与任务历史。

**Architecture:** 在 `unifiedAgentRuntime` 中新增通用的 LLM tool-calling loop，统一注入工具目录、执行工具、处理待确认写操作，并把结果回填给模型生成最终回复。现有规则分流保留为 fallback，但不再作为主路径。图片分析工具并入同一套 runtime，避免单独分叉。

**Tech Stack:** Node.js, Koa, DeepSeek Chat Completions, node:test, OpenSpec

---

### Task 1: 定义通用工具调用契约

**Files:**
- Modify: `server/utils/toolRegistry.js`
- Modify: `server/controllers/unifiedAgentRuntime.js`
- Test: `server/tests/unifiedAgent.integration.test.js`

- [ ] **Step 1: 写失败测试，覆盖 LLM 返回只读工具调用时 runtime 会执行工具并生成最终结果**
- [ ] **Step 2: 运行该测试并确认因缺少通用 tool loop 失败**
- [ ] **Step 3: 为工具目录补充 LLM 可见定义、风险等级与读取接口**
- [ ] **Step 4: 在 runtime 中实现单轮工具解析与执行**
- [ ] **Step 5: 重新运行测试并确认通过**

### Task 2: 打通多轮工具调用与最终回复生成

**Files:**
- Modify: `server/controllers/unifiedAgentRuntime.js`
- Modify: `server/controllers/unifiedAgent.helpers.js`
- Test: `server/tests/unifiedAgent.integration.test.js`

- [ ] **Step 1: 写失败测试，覆盖 LLM 连续调用多个只读工具后输出最终回复**
- [ ] **Step 2: 运行测试并确认因仅支持单次决策失败**
- [ ] **Step 3: 实现多轮 tool loop、最大轮数与工具结果回填**
- [ ] **Step 4: 清理最终回复中的结构化工具结果泄漏**
- [ ] **Step 5: 重新运行测试并确认通过**

### Task 3: 让写操作进入“LLM 决策、runtime 确认”链路

**Files:**
- Modify: `server/utils/toolRegistry.js`
- Modify: `server/controllers/unifiedAgentRuntime.js`
- Modify: `server/controllers/agent.js`
- Test: `server/tests/unifiedAgent.integration.test.js`

- [ ] **Step 1: 写失败测试，覆盖 LLM 决定创建/修改/删除动作时 runtime 返回待确认任务而不是直接落库**
- [ ] **Step 2: 运行测试并确认当前实现仍依赖硬编码任务分流而失败**
- [ ] **Step 3: 在 runtime 中把写工具统一桥接到现有确认机制**
- [ ] **Step 4: 保留删除强确认与低风险免确认逻辑**
- [ ] **Step 5: 重新运行测试并确认通过**

### Task 4: 将图片分析纳入统一工具目录

**Files:**
- Modify: `server/controllers/unifiedAgentRuntime.js`
- Modify: `server/controllers/agentOrchestrator.js`
- Test: `server/tests/agentWorkflow.integration.test.js`
- Test: `server/tests/unifiedAgent.integration.test.js`

- [ ] **Step 1: 写失败测试，覆盖图文输入由同一 tool loop 决定调用 `analyze_image` 与后续工具**
- [ ] **Step 2: 运行测试并确认因图片工具仍走独立分支失败**
- [ ] **Step 3: 把图片分析工具合并到统一 runtime，并让录入衣橱工作流消费其结果**
- [ ] **Step 4: 保留图片分析失败时的控制台日志与回复兜底**
- [ ] **Step 5: 重新运行测试并确认通过**

### Task 5: 回归验证与文档同步

**Files:**
- Modify: `openspec/changes/add-full-product-agent-orchestration/design.md`
- Modify: `openspec/changes/add-full-product-agent-orchestration/tasks.md`
- Test: `server/tests/unifiedAgent.integration.test.js`
- Test: `server/tests/agentWorkflow.integration.test.js`

- [ ] **Step 1: 更新 OpenSpec 任务清单，标注本阶段的 LLM 自主工具调用工作**
- [ ] **Step 2: 运行后端相关测试**
- [ ] **Step 3: 运行 `openspec validate add-full-product-agent-orchestration --strict`**
- [ ] **Step 4: 汇总剩余 fallback 逻辑与后续收敛点**
