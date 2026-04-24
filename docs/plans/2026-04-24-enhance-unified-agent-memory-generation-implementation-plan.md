# Unified Agent Memory Generation Enhancement Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 为统一长对话式 Agent 增加 LLM 驱动的会话标题生成和结构化摘要生成能力，并在模型失败时自动回退到规则生成。

**Architecture:** 在现有 unified agent 运行时中插入一个轻量的“标题/摘要生成器”层。该层优先使用 DeepSeek 非流式调用生成标题和结构化摘要，输出不合格或模型不可用时回退到当前规则生成逻辑，确保恢复契约和会话可用性不被破坏。

**Tech Stack:** Koa + mysql2 + DeepSeek；Node `node:test`；现有 unified agent 会话与摘要存储层。

---

## File Map

### Backend
- Modify: `server/controllers/unifiedAgent.helpers.js`
- Modify: `server/controllers/unifiedAgentRuntime.js`
- Modify: `server/utils/deepseekClient.js` (reuse only if helper method needed)
- Create: `server/tests/unifiedAgentMemoryGeneration.test.js`

### Existing Data
- Reuse: `agent_sessions`
- Reuse: `agent_session_memory`
- Reuse: `user_style_profile`

## Task 1: Define LLM Output Contract

**Files:**
- Modify: `openspec/changes/enhance-unified-agent-memory-generation/design.md`

- [ ] Step 1: 明确标题输出约束（长度、风格、失败回退）
- [ ] Step 2: 明确结构化摘要 JSON 字段
- [ ] Step 3: 明确字段校验失败时的回退条件

## Task 2: Add Tests First

**Files:**
- Create: `server/tests/unifiedAgentMemoryGeneration.test.js`

- [ ] Step 1: 写“标题生成失败时回退规则标题”的失败测试
- [ ] Step 2: 写“摘要生成失败时回退规则摘要”的失败测试
- [ ] Step 3: 写“模型成功时保留结构化字段”的失败测试
- [ ] Step 4: 运行 `node --test server/tests/unifiedAgentMemoryGeneration.test.js`

## Task 3: Implement Title Generation

**Files:**
- Modify: `server/controllers/unifiedAgent.helpers.js`
- Modify: `server/controllers/unifiedAgentRuntime.js`

- [ ] Step 1: 增加规则标题 fallback helper
- [ ] Step 2: 增加 LLM 标题 prompt 组装
- [ ] Step 3: 增加标题结果校验
- [ ] Step 4: 在会话标题仍为默认值时优先走 LLM 生成

## Task 4: Implement Structured Summary Generation

**Files:**
- Modify: `server/controllers/unifiedAgent.helpers.js`
- Modify: `server/controllers/unifiedAgentRuntime.js`

- [ ] Step 1: 增加规则摘要 fallback helper
- [ ] Step 2: 增加 LLM 摘要 prompt 组装
- [ ] Step 3: 增加结构化 JSON 校验
- [ ] Step 4: 在消息超过 12 轮或关键状态变化时优先走 LLM 摘要生成

## Task 5: Verification

**Files:**
- Test: `server/tests/unifiedAgentMemoryGeneration.test.js`

- [ ] Step 1: 运行 `node --test server/tests/unifiedAgentMemoryGeneration.test.js`
- [ ] Step 2: 运行 unified agent 全量测试
- [ ] Step 3: 运行闭环与 Agent 全量回归测试
- [ ] Step 4: 运行 `cd client && npm run lint`

## Notes for This Session

- 优先保证“输出契约稳定”，不要先追求摘要写得多漂亮
- 任何模型失败都不能破坏会话恢复能力
