## 1. Spec
- [x] 1.1 新增 `refactor-agent-return-context-protocol` 变更提案与设计说明
- [x] 1.2 补充 `task-agent` 与 `unified-agent` 的协议收敛 spec delta
- [x] 1.3 运行 `openspec validate refactor-agent-return-context-protocol --strict`

## 2. Frontend
- [x] 2.1 新增统一 `agentContext` 读写 helper
- [x] 2.2 让 `UnifiedAgent`、`AiChat/sessionState`、`returnNavigation` 优先使用新协议
- [x] 2.3 将页面进入 unified-agent 与页面回流高频入口改为写入新协议

## 3. Backend
- [x] 3.1 新增后端 `agentContext` 协议 helper
- [x] 3.2 让结果按钮、确认流、legacy fallback、附件补全和 autonomous runtime 兼容新协议
- [x] 3.3 在关键返回 state 中优先输出新协议

## 4. Validation
- [x] 4.1 补充前端测试：会话恢复、回流对象解析
- [x] 4.2 补充后端测试：runtime 上下文解析、结果按钮 state
- [x] 4.3 运行协议相关测试与必要校验
