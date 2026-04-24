## 1. Spec & Validation
- [ ] 1.1 明确 LLM 标题与结构化摘要的输出契约
- [ ] 1.2 编写 `enhance-unified-agent-memory-generation` spec delta
- [ ] 1.3 运行 `openspec validate enhance-unified-agent-memory-generation --strict`

## 2. Backend
- [ ] 2.1 新增标题生成 helper 与规则降级逻辑
- [ ] 2.2 新增结构化摘要生成 helper 与规则降级逻辑
- [ ] 2.3 接入 DeepSeek 非流式调用，用于标题和摘要生成
- [ ] 2.4 在统一 Agent 运行时接入标题更新时机
- [ ] 2.5 在统一 Agent 运行时接入摘要刷新时机
- [ ] 2.6 增加结构化结果校验，不合格则回退规则摘要

## 3. Verification
- [ ] 3.1 为标题生成写 helper 测试
- [ ] 3.2 为结构化摘要生成与回退写 helper 测试
- [ ] 3.3 为统一会话标题更新与摘要刷新写 integration 测试
- [ ] 3.4 运行后端全量回归测试
- [ ] 3.5 运行前端 lint
