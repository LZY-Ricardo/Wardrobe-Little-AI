# 变更：统一 Agent 回流与页面上下文字段协议

## Why
当前项目已经让多个页面把当前对象、草稿、洞察结果或图片上下文带入 unified-agent，并在 Agent 执行后把结果回流到目标页面。但这些状态字段仍以 `selectedCloth`、`latestWeather`、`manualSuitDraft`、`prefillImages` 等零散命名分散在前端页面、会话恢复、结果按钮和后端上下文解析中。

这种做法会带来三个问题：一是字段名持续扩散，新增页面时容易继续复制旧模式；二是前后端都要维护多套“猜字段”逻辑；三是回流协议不够显式，难以演进与测试。

## What Changes
- 引入统一的页面导航与回流协议 `agentContext`
- 将当前页面对象、草稿、洞察、附件等上下文收敛为显式结构，而不是继续扩散顶层零散字段
- 前后端关键读取层优先识别新协议，同时兼容旧字段
- 页面入口、Agent 结果按钮与回流高频页面改为优先写入新协议
- 为统一协议补充前后端测试，覆盖会话恢复、页面回流和后端上下文解析

## Impact
- Affected specs:
  - `task-agent`
  - `unified-agent`
- Affected code:
  - `client/src/pages/UnifiedAgent/index.jsx`
  - `client/src/pages/AiChat/sessionState.js`
  - `client/src/utils/returnNavigation.js`
  - `client/src/utils/agentContext.js`
  - `client/src/pages/*/index.jsx` 中跳转 unified-agent 或消费回流 state 的页面
  - `server/controllers/unifiedAgent.helpers.js`
  - `server/controllers/confirmationService.js`
  - `server/controllers/legacyTaskFallbackService.js`
  - `server/controllers/unifiedAgentAttachments.js`
  - `server/agent/tools/runtime/autonomousToolRuntime.js`
  - `server/agent/context/agentContextProtocol.js`
