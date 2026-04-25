## 1. Spec
- [x] 1.1 完成 `task-agent` 的能力扩展 spec delta，定义“全站手动操作工具化”的约束
- [x] 1.2 完成 `unified-agent` 的能力扩展 spec delta，定义“统一代理编排入口”的约束
- [x] 1.3 运行 `openspec validate add-full-product-agent-orchestration --strict`

## 2. Backend Architecture
- [x] 2.1 梳理页面手动能力到 Agent 工具的映射清单
- [x] 2.2 为高价值业务域定义统一工具输入输出 schema 与风险等级
- [x] 2.3 为 unified-agent 新增工作流编排层，统一普通对话、工具增强聊天与任务工作流
- [x] 2.4 把衣物录入图片链路改造为 Agent 可复用的标准业务流程
- [x] 2.5 把推荐保存、穿搭记录、画像调整等高价值写操作接入统一确认模型

## 3. Frontend Experience
- [x] 3.1 在 unified-agent 会话中展示任务理解、澄清状态、确认卡片和执行结果
- [x] 3.2 为相关业务页面提供进入 unified-agent 的上下文快捷入口
- [x] 3.3 让图文输入可以触发“识别 -> 草稿 -> 确认 -> 保存”的连续体验

## 4. Validation
- [x] 4.1 为工具目录、工作流路由和确认机制补充后端测试
- [x] 4.2 为高价值工作流补充集成测试：图片录入衣橱、推荐保存为套装、推荐记录穿搭
- [x] 4.3 运行前端 lint 与关键回归验证，确认 unified-agent 与现有页面能力行为一致
