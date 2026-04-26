# Change: add agent outfit preview tool

## Why
当前 unified-agent 只能展示上下文里的衣物图片，无法复用搭配页现有的真人预览图生成能力。用户在搭配页把当前上衣和下衣交给 Agent 后，期望 Agent 能先展示两件单品，再继续生成真人预览图并在聊天流中展示。

## What Changes
- 为 unified-agent 新增 `generate_outfit_preview` 只读工具，基于当前搭配草稿/套装上下文生成真人预览图
- 复用现有 `clothesApi.generatePreview` 的 Coze 工作流能力，避免维护两套预览图生成协议
- 调整 autonomous tool runtime，使媒体类工具结果可以在同一轮里累积并继续后续工具调用
- 在聊天流中合并展示当前单品图与生成后的真人预览图

## Impact
- Affected specs: unified-agent-preview
- Affected code: `server/agent/tools/runtime/autonomousToolRuntime.js`, `server/agent/tools/handlers/media/readTools.js`, `server/controllers/clothesApi.js`, `server/controllers/unifiedAgentRuntime.js`
