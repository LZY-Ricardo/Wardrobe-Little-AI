# Change: 基于本地 LLM + 规则降级的场景化穿搭推荐

## Why
- 现有 Recommend 依赖 Coze 工作流，不可用且无降级，页面只能展示静态数据。
- 需要利用本地 LLM（Ollama 深度模型）结合用户衣柜生成场景推荐，同时在 LLM 不可用时提供规则化兜底。

## What Changes
- 后端新增/改造 `/scene/generateSceneSuits`：以用户衣柜为输入，优先调用本地 LLM 生成搭配 JSON；超时/失败自动切换规则算法生成 3-5 套。
- Prompt 约束：仅可使用用户衣柜中的 `cloth_id`，输出结构化 JSON，限制套数与字段长度，过滤无效 id。
- 规则降级：按场景->类型/季节/风格/颜色权重生成组合，缺少项时提示补齐。
- 响应契约：`{code, data:[{id, scene, description/reason, items:[{cloth_id,...}]}], msg?}`，前端无感知切换。
- 前端 Recommend 复用接口，展示 LLM 推荐或规则推荐结果，可提示来源（模型/规则）。

## Impact
- Specs：新增 scene 能力规范。
- 代码：`server/controllers/sceneApi.js`、`server/routes/scene.js`；可能新增 LLM 调用/配置；前端 Recommend 页面解析/文案。
- 配置：本地 LLM 地址/模型（可复用 `/chat` 的 Ollama）；降级规则可内置配置。***
