# Agent 图片聊天视觉工具化 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 让统一 Agent 支持单张图片直发聊天，并通过 `DeepSeek` 自主调用基于 `SiliconFlow Vision` 的图片解析工具，在前端展示工具阶段事件与最终文本流。

**Architecture:** 保留 `DeepSeek` 作为主对话模型，在 `server/controllers/unifiedAgentRuntime.js` 中新增工具调用编排。图片附件先作为用户消息的一部分持久化，再由 Runtime 根据模型返回决定是否调用基于 `SiliconFlow Vision` 的图片工具，并将工具结果回注给 `DeepSeek` 继续生成最终流式回复。前端 `AiChat` 继续消费同一 SSE 链路，新增工具阶段事件展示，同时兼容原有文本流与图片消息恢复。

**Tech Stack:** Koa, Axios, DeepSeek Chat Completions API, SiliconFlow Vision API, React 18, Ant Design Mobile, SSE, OpenSpec

---

### Task 1: 为图片工具接入梳理服务边界

**Files:**
- Create: `server/controllers/qwenVision.js`
- Modify: `server/controllers/unifiedAgentRuntime.js`
- Modify: `server/utils/deepseekClient.js`
- Modify: `server/.env.example`

- [ ] **Step 1: 读取现有 `clothesVision` 与 `deepseekClient` 代码，记录可复用的请求/错误处理模式**

Run: `sed -n '1,260p' server/controllers/clothesVision.js && sed -n '1,220p' server/utils/deepseekClient.js`
Expected: 看清现有视觉请求模式、超时配置、错误归一化方式。

- [ ] **Step 2: 编写一个失败中的服务契约测试草稿（哪怕先是最小 Node 脚本或伪测试清单）**

Test target:
- 缺少 `SILICONFLOW_API_KEY` 时抛出明确错误
- 非法 dataUrl 输入被拒绝
- 视觉服务返回非 JSON 结构时被归一化失败

Expected: 至少明确这三个失败场景的验证方式，后续实现时逐个验证。

- [ ] **Step 3: 实现 `server/controllers/qwenVision.js`**

Implementation:
- 提供 `analyzeImageWithVisionTool({ dataUrl, question })`
- 读取 `SILICONFLOW_API_KEY`、`SILICONFLOW_BASE_URL`、`SILICONFLOW_VISION_MODEL`
- 调用 SiliconFlow OpenAI 兼容接口
- 强制要求输出结构化 JSON
- 对返回值做 schema 归一化：`summary/category/attributes/confidence`

- [ ] **Step 4: 复用 `server/.env.example` 中现有的 SiliconFlow 相关配置**

Add:
- `SILICONFLOW_API_KEY`
- `SILICONFLOW_BASE_URL`
- `SILICONFLOW_VISION_MODEL`
- `SILICONFLOW_TIMEOUT_MS`

- [ ] **Step 5: 手工验证服务层**

Run: 使用临时脚本或 REPL 调一次 `analyzeImageWithVisionTool`
Expected: 成功返回结构化对象，失败时错误文案可读。

### Task 2: 为 DeepSeek 工具调用补充客户端支持

**Files:**
- Modify: `server/utils/deepseekClient.js`
- Test/Verify: `server/controllers/unifiedAgentRuntime.js` 中的最小调用演练

- [ ] **Step 1: 先写一个最小失败验证目标**

验证目标：
- `createChatCompletion` 能透传 `tools`
- 能接收非流式 tool call 响应
- 保持现有 `stream=true` 文本流不受影响

- [ ] **Step 2: 修改 `server/utils/deepseekClient.js`，允许透传 `tools`、`tool_choice` 以及后续消息结构**

Implementation:
- 不要硬编码删除额外字段
- 保持现有 `stream` 逻辑不变

- [ ] **Step 3: 手工发起一次带 `tools` 的非流式请求**

Expected: DeepSeek 返回正常响应；若触发工具调用，能在返回体中看到工具调用信息。

### Task 3: 重构统一 Agent Runtime 的带图会话分流

**Files:**
- Modify: `server/controllers/unifiedAgentRuntime.js`
- Modify: `server/utils/unifiedAgentMultimodal.js`
- Modify: `server/controllers/agent.helpers.js`

- [ ] **Step 1: 写下回归验证清单**

Cases:
- 纯文本消息仍走原有逻辑
- 带图普通问答不应直接进入 `profile/recommendation`
- 明确写操作仍保留确认流

- [ ] **Step 2: 在 `server/utils/unifiedAgentMultimodal.js` 中去掉“图片摘要直接驱动分类”的耦合**

Implementation:
- `storedContent` 仍可保留 `[图片消息]`
- `modelInput` 不再预先拼接会干扰业务分类的强摘要
- 保留图片附件本身与用户原文

- [ ] **Step 3: 在 `server/controllers/unifiedAgentRuntime.js` 中拆出“工具增强聊天”准备逻辑**

Implementation:
- 带图普通问答默认走 chat/tool pipeline
- 仅在用户文本明确表达业务任务时进入 task pipeline
- 保留 `latestTask` 写操作续接能力

- [ ] **Step 4: 调整 `server/controllers/agent.helpers.js` 的业务任务判定边界**

Implementation:
- 强化“明确业务意图”判断
- 不再允许图片摘要中的 `风格/颜色` 触发画像任务

- [ ] **Step 5: 手工验证分流**

Expected:
- “这个鞋子适合晴天穿吗”不进入 task_result
- “给我推荐一套通勤搭配”仍可进入业务任务链

### Task 4: 在 Runtime 中实现图片工具调用编排

**Files:**
- Modify: `server/controllers/unifiedAgentRuntime.js`
- Create or Modify: `server/utils/llmTooling.js`（如需要，若实现内聚可不新建）
- Modify: `server/utils/sseHelpers.js`（如需补充事件辅助）

- [ ] **Step 1: 先写最小失败验证**

Cases:
- 带图消息时，首轮 DeepSeek 可返回工具调用
- 每条消息最多一次 `analyze_image`
- 工具结果回注后能继续拿到最终文本

- [ ] **Step 2: 实现 `analyze_image` 工具定义与参数校验**

Tool schema:
```json
{
  "type": "function",
  "function": {
    "name": "analyze_image",
    "description": "分析当前用户消息中的图片，返回结构化穿搭相关属性",
    "parameters": {
      "type": "object",
      "additionalProperties": false,
      "properties": {
        "attachmentIndex": { "type": "integer", "minimum": 0, "maximum": 0 },
        "question": { "type": "string" }
      }
    }
  }
}
```

- [ ] **Step 3: 在 `sendUnifiedAgentMessageStream` 内增加非流式首轮决策**

Implementation:
- 首轮向 DeepSeek 发送 `tools`
- 若无工具调用，直接转到原文本流
- 若有工具调用，进入下一步

- [ ] **Step 4: 执行视觉工具并回注**

Implementation:
- 发 `tool_call_started`
- 调 `analyzeImageWithVisionTool`
- 发 `tool_call_completed`
- 将工具结果拼成 tool message 加回消息数组

- [ ] **Step 5: 在第二轮 DeepSeek 请求中开启 `stream=true`**

Expected:
- 只有最终自然语言回复走 token 流
- 工具原始 JSON 不直接发给前端当最终回答

- [ ] **Step 6: 加入超时、失败、重复调用限制**

Rules:
- 单条消息最多调用 1 次
- 失败时仍回注降级上下文
- 客户端断开时尽早终止

### Task 5: 扩展消息落库与恢复字段

**Files:**
- Modify: `server/controllers/unifiedAgentSessions.js`
- Modify: `server/controllers/unifiedAgentRuntime.js`
- Modify: `server/controllers/unifiedAgent.helpers.js`
- Modify: `server/migrations/alter_agent_messages_add_meta_json.sql`（如需要补充文档/兼容说明）

- [ ] **Step 1: 明确 meta 结构**

Schema:
- `attachments`
- `toolCalls`
- `toolResultsSummary`
- 可选 `toolStatus`

- [ ] **Step 2: 修改 `appendMessage` 与 hydrate 逻辑**

Implementation:
- 用户消息恢复时带回图片附件
- assistant 消息可带回工具摘要信息

- [ ] **Step 3: 修改会话摘要与恢复逻辑**

Expected:
- 图片消息仍显示“发送了一张图片”或用户文本摘要
- 不泄漏超长 JSON / base64

### Task 6: 前端消费图片工具阶段事件

**Files:**
- Modify: `client/src/pages/AiChat/index.jsx`
- Modify: `client/src/pages/AiChat/index.module.less`

- [ ] **Step 1: 先写 UI 行为验证清单**

Cases:
- `tool_call_started` 时出现阶段提示
- `tool_call_completed` 后进入 token 流
- 纯文本消息行为不变

- [ ] **Step 2: 扩展 SSE 事件消费分支**

Implementation:
- 处理 `tool_call_started`
- 处理 `tool_call_completed`
- 与现有 `content/message_saved/task_result/error` 兼容

- [ ] **Step 3: 设计最小 UI 呈现**

Implementation:
- 不新增重型组件
- 使用现有流式占位区域或轻量状态条展示“正在分析图片/图片分析完成”

- [ ] **Step 4: 保持图片消息本地乐观更新与失败态**

Expected:
- 即使工具失败，用户图片卡片不丢
- 最终错误或降级文案清晰

### Task 7: 验证与收尾

**Files:**
- Verify: `server/controllers/unifiedAgentRuntime.js`
- Verify: `client/src/pages/AiChat/index.jsx`
- Verify: OpenSpec tasks 文档状态

- [ ] **Step 1: 运行前端 lint**

Run: `cd client && npm run lint`
Expected: 通过；若失败，修复本次改动引入的问题。

- [ ] **Step 2: 手工冒烟后端与前端主流程**

Checklist:
- 纯文本聊天正常
- 单图提问先显示阶段事件，再流式输出
- 图 + 文本提问可触发工具调用
- 工具失败时有降级输出

- [ ] **Step 3: 更新 OpenSpec tasks 勾选状态**

Implementation:
- 将本次已完成的 tasks 项打勾
- 保持未完成项真实反映状态

- [ ] **Step 4: 整理剩余风险**

Include:
- 真实 SiliconFlow 配额/网络依赖
- DeepSeek 工具调用格式兼容性
- 是否需要下一步补自动化测试
