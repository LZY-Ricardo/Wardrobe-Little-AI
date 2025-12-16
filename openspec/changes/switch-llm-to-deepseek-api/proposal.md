# Change: 后端 LLM 从本地 Ollama 迁移到云端 DeepSeek API

## Why
- 本地 Ollama 依赖模型部署与算力，生产环境不可用且稳定性不足，用户希望切换到云端 DeepSeek API。
- 聊天与场景推荐需要统一的大模型供应与鉴权机制，便于密钥管理与超时控制。
- 现有接口假设本地 deepseek-r1:7b，无法满足云端调用与计费策略。

## What Changes
- 替换 `/chat` 路由（含 planner/tool 调用链）为 DeepSeek `/v1/chat/completions` 流式代理，保持前端 SSE 协议与安全控制。
- 场景推荐 `generateSceneSuits` 改为调用 DeepSeek 非流式 JSON 输出，失败时继续规则降级。
- 新增 DeepSeek 配置项：`DEEPSEEK_API_KEY`、`DEEPSEEK_BASE_URL`、`DEEPSEEK_CHAT_MODEL`、`DEEPSEEK_PLANNER_MODEL`、超时/历史上限等，并更新 `.env.example`。
- 抽象共享 DeepSeek 客户端与错误处理，替换现有 OLLAMA_* 依赖。

## Impact
- Affected specs: llm（新增云端 DeepSeek 代理要求；场景推荐 LLM 行为更新）
- Affected code: `server/routes/chat.js`, `server/controllers/sceneApi.js`, `server/utils/aichatPrompt.js`, `server/.env.example`, `server/utils/*`（新增 DeepSeek 客户端）
