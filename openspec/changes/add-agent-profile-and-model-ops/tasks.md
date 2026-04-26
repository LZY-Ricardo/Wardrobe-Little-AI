## 1. Implementation
- [ ] 1.1 新增昵称更新、头像上传、人物模特上传、人物模特删除工具
- [ ] 1.2 接入统一确认链路和结果摘要
- [ ] 1.3 让 unified-agent 能从自然语言和工具调用两条路径触发这些动作
- [ ] 1.4 保持图片大小/格式限制与 Person 页现有行为一致
- [ ] 1.5 为工具目录、确认链路和 unified-agent 增加回归测试

## 2. Validation
- [ ] 2.1 运行 `node --test server/tests/toolRegistry.catalog.test.js server/tests/toolHandlerResolver.test.js server/tests/confirmationService.test.js server/tests/profileWriteTools.test.js`
- [ ] 2.2 运行 `node --test --test-name-pattern "user name|avatar|character model" server/tests/unifiedAgent.integration.test.js`
- [ ] 2.3 运行 `openspec validate add-agent-profile-and-model-ops --strict`
