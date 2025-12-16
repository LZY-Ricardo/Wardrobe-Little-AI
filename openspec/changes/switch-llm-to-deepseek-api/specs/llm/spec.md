## ADDED Requirements

### Requirement: 聊天接口必须使用 DeepSeek 云端流式代理并保持 SSE 协议
后端 `/chat` 路由 MUST 调用 DeepSeek Chat Completions（POST `{DEEPSEEK_BASE_URL}/v1/chat/completions`，stream=true，Authorization Bearer），并将返回的 `choices[].delta.content` 逐段转发为 `data: "<chunk>"` SSE 行，末尾发送 `data: [DONE]` 结束。不得回退到本地 Ollama。
#### Scenario: 成功代理聊天流式响应
- **WHEN** 用户携带有效 token 调用 `/chat` 并提供对话历史
- **THEN** 服务端向 DeepSeek 发起 stream 请求，按顺序写入每个 delta.content 为 SSE data 行，最后发送 `[DONE]` 并关闭连接

### Requirement: Planner 与工具调用使用 DeepSeek 非流式并安全降级
聊天需要读取真实数据时，planner MUST 通过 DeepSeek 非流式调用生成 JSON 计划（temperature 0、stream=false），无法解析/HTTP 错误/超时则跳过工具调用并直接进入主回复生成，仍由 DeepSeek 流式返回。
#### Scenario: Planner JSON 失败时降级
- **WHEN** DeepSeek planner 响应缺失、status 非 2xx 或 message.content 无法解析为 JSON
- **THEN** 服务端不执行工具调用，带历史消息直接请求主模型生成回复，向前端返回正常流式结果或错误事件

### Requirement: 场景推荐使用 DeepSeek 非流式 JSON 输出并保留规则降级
`/scene/generateSceneSuits` MUST 首选 DeepSeek 非流式（`stream=false`，使用 `response_format` 或解析 `message.content` JSON）生成 3-5 套仅含有效 `cloth_id` 的组合；若 HTTP/超时/解析失败则自动切换本地规则生成，仍返回 `code=1` 与提示。
#### Scenario: DeepSeek 失败时规则降级
- **WHEN** DeepSeek 请求超时、返回 4xx/5xx 或输出 JSON 无法解析
- **THEN** 服务端记录错误并改用规则推荐，过滤无效 cloth_id，返回 `code=1`、数据来源标记为 rule、msg 说明已降级

### Requirement: DeepSeek 鉴权与配置必须由环境变量提供
系统 MUST 通过环境变量提供 `DEEPSEEK_API_KEY`（必填）、`DEEPSEEK_BASE_URL`（默认 `https://api.deepseek.com`）、`DEEPSEEK_CHAT_MODEL`、`DEEPSEEK_PLANNER_MODEL`、超时与历史上限配置；缺少密钥时应拒绝调用并返回清晰错误。
#### Scenario: 缺少密钥时阻止调用
- **WHEN** 环境未配置 `DEEPSEEK_API_KEY`
- **THEN** `/chat` 与场景推荐接口立即返回错误（SSE error event 或 `code=0`+msg），提示需要配置密钥后重试
