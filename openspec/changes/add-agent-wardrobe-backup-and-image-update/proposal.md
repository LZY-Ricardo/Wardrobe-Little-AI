# Change: add agent wardrobe backup and image update

## Why
当前 unified-agent 已能创建、编辑和删除衣物，但还不能覆盖衣橱资产层的两类高价值手动操作：更新衣物图片，以及导入/导出衣橱数据。这导致 Agent 无法完整替代衣橱页的关键维护动作。

## What Changes
- 为 unified-agent 增加衣物图片更新能力，支持在已有衣物上下文上替换图片
- 为 unified-agent 增加衣橱导出能力，返回可下载结果而不是直接输出大段 JSON
- 为 unified-agent 增加衣橱导入能力，支持基于 JSON 资产包执行确认后导入
- 扩展确认链路、结果摘要和附件协议，避免大体积 base64 或导入 payload 直接污染聊天消息

## Impact
- Affected specs: unified-agent-wardrobe-assets
- Affected code: `server/agent/tools/registry/catalog.js`, `server/agent/tools/handlers/wardrobe/writeTools.js`, `server/controllers/confirmationService.js`, `server/controllers/unifiedAgentRuntime.js`, `server/tests/unifiedAgent.integration.test.js`
