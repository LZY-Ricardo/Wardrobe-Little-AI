## 1. Implementation
- [x] 1.1 为 unified-agent 注册 `generate_outfit_preview` 工具并补齐 handler 解析
- [x] 1.2 抽取可复用的预览图生成核心方法，供路由与 Agent 工具共享
- [x] 1.3 让 autonomous tool runtime 支持在同一轮里累积媒体结果并继续调用下一工具
- [x] 1.4 在 unified-agent 回复落库时合并展示当前单品图与生成后的预览图
- [x] 1.5 为 runtime、media handler、tool catalog/handler resolver 添加回归测试

## 2. Validation
- [x] 2.1 运行 `node --test server/tests/autonomousToolRuntime.test.js server/tests/toolRegistry.catalog.test.js server/tests/toolHandlerResolver.test.js server/tests/mediaReadTools.test.js`
- [x] 2.2 运行 `openspec validate add-agent-outfit-preview-tool --strict`
