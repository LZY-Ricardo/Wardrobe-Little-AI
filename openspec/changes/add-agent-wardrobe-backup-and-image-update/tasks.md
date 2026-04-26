## 1. Implementation
- [ ] 1.1 新增衣橱导出工具并补齐结果摘要/下载型返回协议
- [ ] 1.2 新增衣橱导入工具并接入统一确认链路
- [ ] 1.3 新增衣物图片更新工具并复用现有图片校验约束
- [ ] 1.4 让 unified-agent/latestTask/attachments 能正确承接导入导出和图片更新结果
- [ ] 1.5 为工具目录、确认链路和 unified-agent 补回归测试

## 2. Validation
- [ ] 2.1 运行 `node --test server/tests/toolRegistry.catalog.test.js server/tests/toolHandlerResolver.test.js server/tests/confirmationService.test.js server/tests/wardrobeWriteTools.test.js`
- [ ] 2.2 运行 `node --test server/tests/unifiedAgent.integration.test.js`
- [ ] 2.3 运行 `openspec validate add-agent-wardrobe-backup-and-image-update --strict`
