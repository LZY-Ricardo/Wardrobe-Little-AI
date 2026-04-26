# Change: add agent outfit log editing

## Why
当前 unified-agent 已能创建、查看和删除穿搭记录，但还不能编辑已有记录。这使得 Agent 无法覆盖 OutfitLogs 页已经具备的后端更新能力，也无法完成“把这条记录改成通勤/补一句备注/换成这两件单品”这类实际需求。

## What Changes
- 为 unified-agent 增加 `update_outfit_log` 写工具
- 支持基于当前穿搭记录上下文修改日期、场景、天气、满意度、备注和单品列表
- 扩展确认链路、结果摘要与返回导航，让更新后的记录能够回到穿搭记录页

## Impact
- Affected specs: unified-agent-outfit-log-editing
- Affected code: `server/agent/tools/registry/catalog.js`, `server/agent/tools/handlers/outfitLogs/writeTools.js`, `server/controllers/confirmationService.js`, `server/controllers/legacyTaskFallbackService.js`, `server/tests/unifiedAgent.integration.test.js`
