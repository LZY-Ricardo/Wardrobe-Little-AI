## 1. Spec
- [ ] 1.1 编写 `unified-agent` 的 spec delta，定义分层工具体系、工具元数据与策略层约束
- [ ] 1.2 编写 `task-agent` 的 spec delta，定义工具确认策略、上下文注入与执行边界约束
- [ ] 1.3 运行 `openspec validate refactor-agent-tool-architecture --strict`

## 2. Backend Refactor
- [ ] 2.1 新建 `server/agent/tools/registry`，抽出统一工具 catalog 与查询接口
- [ ] 2.2 新建 `server/agent/tools/policies`，沉淀确认策略、工具可见性策略与上下文策略
- [ ] 2.3 新建 `server/agent/tools/runtime`，拆出工具定义构建、执行路由与事件适配层
- [ ] 2.4 按业务域建立 `handlers` 目录，并逐步迁移衣物、套装、穿搭记录、画像、图片分析工具
- [ ] 2.5 将 `server/utils/toolRegistry.js` 降级为兼容导出层，避免业务逻辑继续膨胀
- [ ] 2.6 收敛 `server/controllers/unifiedAgentRuntime.js` 中的工具编排逻辑，只保留会话与高层 loop 编排
- [ ] 2.7 拆分 `server/controllers/agent.js` 的职责，明确 confirmation、task history、legacy fallback 的归属
- [ ] 2.8 为兼容层建立冻结规则，禁止新增业务逻辑继续进入 `toolRegistry.js`、`unifiedAgentRuntime.js`、`agent.js`

## 3. Policy & Runtime Behavior
- [ ] 3.1 为工具定义补充统一 metadata 字段：domain、mode、confirmationPolicy、llmVisible、contextRequirements
- [ ] 3.2 为工具定义补充展示与确认相关 metadata：uiLabel、resultPresenter、confirmationDescriptor
- [ ] 3.2 统一查询、写入、批量写入、删除、图片理解等工具的分类与执行规则
- [ ] 3.3 将低风险免确认、删除强制确认、待确认持久化恢复统一接入策略层
- [ ] 3.4 让 runtime 基于 metadata 而不是硬编码分支决定工具暴露与执行路径
- [ ] 3.5 让前端依赖的 toolCalls、toolResultsSummary、流式工具状态由事件适配层统一生成

## 4. Migration Batches
- [ ] 4.1 迁移基础读工具批次：用户画像、偏好洞察、衣橱统计、衣橱列表、衣物详情
- [ ] 4.2 迁移衣物写工具批次：创建衣物、批量创建衣物、更新衣物、切换收藏、删除衣物
- [ ] 4.3 迁移推荐/套装/穿搭写工具批次：推荐生成、保存套装、记录穿搭、删除套装、删除穿搭记录
- [ ] 4.4 迁移画像与偏好工具批次：更新性别、更新低风险免确认
- [ ] 4.5 迁移多模态工具批次：图片分析与图片驱动衣物录入链路
- [ ] 4.6 每完成一批，输出“已迁移工具清单 / 未迁移工具清单 / 对应回归测试清单”

## 5. Validation
- [ ] 5.1 为 registry / policy / runtime / event adapter 新增单元测试
- [ ] 5.2 为 presenter / confirmation descriptor 新增兼容性测试
- [ ] 5.3 保留并扩展统一 Agent 的自主工具调用集成测试
- [ ] 5.4 保留并扩展确认恢复、图片识别入衣橱、批量保存衣物等关键链路测试
- [ ] 5.5 运行前端 lint 与相关后端测试，确认重构不改变现有对外行为
