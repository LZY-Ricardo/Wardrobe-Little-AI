# 变更：将统一 Agent 扩展为全站操作代理

## Why
当前项目的 unified-agent 已具备统一会话、图文输入、部分任务执行和确认机制，但仍然只能覆盖少量预设任务。项目中的大多数核心功能仍然要求用户进入具体页面手动操作，导致 Agent 更像“增强聊天入口”，而不是“统一业务代理入口”。

如果希望 Agent 真正替代用户完成项目中的实际业务流程，就需要把现有页面能力系统化沉淀为受控工具，并让 unified-agent 能够基于文字、图片和上下文完成多步任务编排、参数澄清、确认执行与结果回写。

## What Changes
- 将 unified-agent 的目标从“统一会话 + 少量任务”升级为“统一会话 + 全站业务代理”
- 为项目中的核心手动操作建立统一的 Agent 工具目录、输入输出契约和风险分级
- 让 Agent 支持从文字或图片输入发起多步工作流，例如“图片识别衣物 -> 生成草稿 -> 确认 -> 存入衣橱”
- 建立页面功能到 Agent 工具的映射关系，使衣橱、套装、推荐、穿搭记录、画像与搭配预览等能力都可被 Agent 代理
- 扩展统一确认策略，明确查询、推荐、创建、修改、删除等不同操作等级的执行边界
- 为 Agent 新增工作流历史、步骤状态和失败恢复的约束，确保可追踪、可解释、可回滚到澄清状态

## Impact
- Affected specs:
  - `task-agent`
  - `unified-agent`
- Affected code:
  - `server/controllers/unifiedAgentRuntime.js`
  - `server/controllers/agent.js`
  - `server/utils/toolRegistry.js`
  - `server/controllers/clothesApi.js`
  - `server/controllers/clothesVision.js`
  - `server/controllers/sceneApi.js`
  - `server/controllers/suits.js`
  - `server/controllers/outfitLogs.js`
  - `server/controllers/profileInsights.js`
  - `server/routes/unifiedAgent.js`
  - `client/src/pages/AiChat/index.jsx`
  - `client/src/pages/UnifiedAgent/index.jsx`
  - `client/src/pages/Outfit/index.jsx`
  - `client/src/pages/Person/index.jsx`
  - `client/src/pages/Match/index.jsx`
  - `client/src/pages/ProfileInsights/index.jsx`

