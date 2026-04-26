# Change: add agent profile and model ops

## Why
当前 unified-agent 已能更新性别和低风险免确认偏好，但仍未覆盖个人中心里最常用的资料维护动作：昵称更新、头像上传、人物模特上传与删除。这让 Agent 无法完整替代 Person 页的关键手动操作。

## What Changes
- 为 unified-agent 增加昵称更新工具
- 为 unified-agent 增加头像上传工具
- 为 unified-agent 增加人物模特上传与删除工具
- 扩展确认链路、结果摘要与返回导航，让资料类操作完成后能稳定回到个人中心

## Impact
- Affected specs: unified-agent-profile-ops
- Affected code: `server/agent/tools/registry/catalog.js`, `server/agent/tools/handlers/profile/writeTools.js`, `server/controllers/confirmationService.js`, `server/controllers/unifiedAgentRuntime.js`, `server/tests/unifiedAgent.integration.test.js`
