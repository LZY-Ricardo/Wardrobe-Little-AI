## Context
- 当前 `/chat` 与 `generateSceneSuits` 依赖本地 Ollama `/api/chat`，通过 SSE 转发 message.content 文本，前端聚合 data 行并在 `[DONE]` 结束。
- 需求：迁移到云端 DeepSeek Chat Completions（参考官方文档：`POST https://api.deepseek.com/v1/chat/completions`，Authorization Bearer，`stream` 支持 SSE，delta.content 持续返回）。需要统一 planner 与主回复、场景推荐的调用方式。
- 前端协议约束：仍然使用 SSE（`data: <string>` 多行 + `[DONE]`），并过滤 `<think>/<thinking>` 文本块。

## Goals / Non-Goals
- Goals：用 DeepSeek 替换 Ollama；保持 `/chat` SSE 协议与工具调用链；场景推荐仍先试 LLM、失败自动规则降级；集中配置/鉴权与超时。
- Non-Goals：不改前端 UI/交互；不调整现有 prompt 逻辑与工具定义；不引入数据库/业务字段变化；不新增新的前端协议格式。

## Decisions
- 终端地址：`DEEPSEEK_BASE_URL` 默认为 `https://api.deepseek.com`，统一使用 `/v1/chat/completions`；鉴权 header `Authorization: Bearer ${DEEPSEEK_API_KEY}`，Content-Type JSON。
- 模型配置：`DEEPSEEK_CHAT_MODEL`（默认 `deepseek-chat`）用于主回复；`DEEPSEEK_PLANNER_MODEL`（默认沿用 chat 模型）用于 planner 非流式调用；支持 env 覆盖。
- 聊天流式：请求体 `{model, messages, stream:true, temperature:0.4}`，读取 SSE chunk 中 `choices[].delta.content` 追加转发为 `data: "<text>"` 行，保留 `[DONE]` 结束；如有 `reasoning_content`/空增量需忽略或追加空串；收到 HTTP 错误/超时时写入 `event: error` 与 JSON 提示。
- Planner 调用：`stream:false`，取 `choices[0].message.content` 解析 JSON，保留现有超时（可复用 `DEEPSEEK_TIMEOUT_MS`/独立 planner timeout）；解析失败视为无 tool plan。
- 场景推荐：非流式调用，使用 `response_format: {type:'json_object'}`（或解析 `message.content` JSON）；限定 tokens/超时，解析失败或 4xx/5xx 时回退规则推荐。
- 配置替换：移除/废弃 OLLAMA_*，新增 `DEEPSEEK_API_KEY`（必填）、`DEEPSEEK_BASE_URL`、`DEEPSEEK_CHAT_MODEL`、`DEEPSEEK_PLANNER_MODEL`、`DEEPSEEK_TIMEOUT_MS`、`DEEPSEEK_MAX_HISTORY`（沿用现有 MAX_HISTORY 功能）。

## Risks / Trade-offs
- 风险：API key 泄漏 / 日志打印；措施：屏蔽密钥日志，只记录 status/code。  
- 风险：429/限流导致聊天中断；措施：前端收到 error event，提示稍后重试；可增加指数退避。  
- 风险：DeepSeek SSE 分片格式与 Ollama 不同（delta vs message）；措施：仅消费 `delta.content`，忽略其他字段，确保聚合为文本。  
- 风险：场景推荐 JSON 不规范；措施：启用 `response_format`、宽松解析并保持规则降级。

## Migration Plan
1) 添加 DeepSeek 配置与 .env.example 样例；实现共享 HTTP 客户端（含超时、错误包装、流式读取）。  
2) 替换 `/chat` 调用链（planner + 主回复），保持 SSE 协议。  
3) 替换 `generateSceneSuits` LLM 调用，保留规则降级。  
4) 冒烟：聊天流式/取消/超时、工具调用、DeepSeek 限流/401、场景推荐成功与降级。

## Open Questions
- 默认模型是否使用 `deepseek-chat` 还是 `deepseek-reasoner`？当前方案默认 chat，可按需要改 env。  
- 是否需要附带 `stream_options.include_usage` 返回 tokens？暂不需要，保持前端协议简洁。
