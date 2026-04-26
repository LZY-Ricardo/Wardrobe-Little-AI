## 1. Implementation
- [ ] 1.1 新增 `update_outfit_log` 工具并复用现有更新接口
- [ ] 1.2 补齐确认链路、结果摘要和返回导航
- [ ] 1.3 让当前穿搭记录上下文下的自然语言请求可直达更新动作
- [ ] 1.4 为工具目录、确认链路和 unified-agent 增加回归测试

## 2. Validation
- [ ] 2.1 运行 `node --test server/tests/toolRegistry.catalog.test.js server/tests/toolHandlerResolver.test.js server/tests/confirmationService.test.js server/tests/outfitLogWriteTools.test.js`
- [ ] 2.2 运行 `node --test --test-name-pattern "update outfit log|穿搭记录更新" server/tests/unifiedAgent.integration.test.js`
- [ ] 2.3 运行 `openspec validate add-agent-outfit-log-editing --strict`
