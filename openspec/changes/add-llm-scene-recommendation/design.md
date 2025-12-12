## Context
- Recommend 目前依赖 Coze 工作流不可用，需提供场景推荐新路径。
- 本地已有 Ollama deepseek-r1:7b（/chat 使用），可调用生成文本。
- 目标：用 LLM 选择衣柜组合，LLM 失效时规则降级，前端无感知。

## Goals / Non-Goals
- Goals: 以衣柜数据为约束生成 3-5 套场景推荐；返回结构化 JSON；自动降级规则；提供来源标记。
- Non-Goals: 生成真人模特合成图、复杂抠图；改动登录/鉴权链路。

## Decisions
- LLM 调用：优先本地 Ollama HTTP Chat 接口（与 /chat 同步 host/model），超时 3-5s。
- Prompt：传 scene + (sex/season 可选) + 衣柜精简清单，严格要求只用 cloth_id，输出 JSON。
- 输出校验：`JSON.parse` + schema 过滤；丢弃无效 cloth_id，限制套数 3-5。
- 降级：预置场景规则（type/style/season/颜色/favorite 权重）生成组合，source=rule。
- 响应：`{code,data,msg}`，每项含 scene/description(reason)/items/cover?/source。
- 合成图：不依赖外部服务，建议前端 Canvas/HTML 拼贴作为预览（可选）。

## Risks / Trade-offs
- 解析风险：LLM 可能输出非 JSON → 严格校验 + 降级。
- 性能：衣柜过大导致 prompt 超长 → 仅传必要字段，限制数量或按类型抽样。
- 依赖：Ollama 模型可用性/加载时间 → 设置短超时并缓存模型，降级兜底。
- 视觉：无真实合成图 → 采用平铺/拼贴展示，后续再迭代。***
