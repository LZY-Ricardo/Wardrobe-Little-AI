## 1. 方案设计与配置
- [x] 1.1 设计 DeepSeek 客户端与配置项（base_url/model/key/timeout/history 上限），定义 SSE 转发约束。
- [x] 1.2 更新 `server/.env.example` 与相关文档，补充新环境变量说明。

## 2. 聊天接口迁移
- [x] 2.1 将 `/chat` 主流式代理改为调用 DeepSeek `/v1/chat/completions`（stream=true），保持前端 SSE data 行与 `[DONE]` 结束标记。
- [x] 2.2 将 planner/tool 调用改为 DeepSeek 非流式调用，确保 JSON 解析与错误处理。
- [x] 2.3 增强错误与超时处理（API 401/429/5xx），返回前端可识别提示与状态。

## 3. 场景推荐迁移
- [x] 3.1 在 `generateSceneSuits` 中调用 DeepSeek 非流式 JSON 输出，使用 response_format/JSON 解析并限制超时。
- [x] 3.2 保留并完善规则降级与数据清洗，记录错误信息方便排查。

## 4. 验证
- [x] 4.1 手工冒烟：聊天流式、取消/超时、工具调用、场景推荐成功与降级路径。
