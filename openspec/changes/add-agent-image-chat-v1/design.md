## Context
当前项目已经具备三块相关能力：
1. 统一 Agent 会话模型与长对话能力
2. 聊天页输入区与本地消息乐观更新
3. 基础 SSE 流式回复能力

但这些能力尚未在“同一条聊天链路”中闭环：图片只能通过 `Add` 页独立上传，不能直接在 Agent 会话中作为用户消息发送。这导致聊天体验与穿搭分析体验割裂。

本变更的目标是：在不引入完整附件平台的前提下，为统一 Agent 提供一个可用、稳定、范围受控的图片直发聊天 V1，并以更标准的 Agent 方式接入视觉能力。

具体来说：
- `DeepSeek` 继续作为统一 Agent 的主对话模型与最终回答生成器
- 复用现有 `SiliconFlow Vision` 视觉模型作为图片解析工具，只负责图像理解，不直接对用户输出最终回答
- 统一 Agent Runtime 负责工具注册、工具调用编排、工具结果回注和 SSE 阶段事件
- 带图消息不再使用图片摘要直接参与任务分类，避免误路由

## Goals
- 用户可以在聊天页直接选择单张图片并发送给 Agent。
- 用户可以发送“纯图”或“图 + 文本”。
- Agent 在同一会话内基于图片工具结果继续回复。
- 会话恢复、历史列表、摘要预览都能兼容图片消息。
- 带图消息在前端表现为“阶段事件 + 最终文本流”的连续体验。
- `DeepSeek` 具有自主决定是否调用图片工具的能力。

## Non-Goals
- 多图上传
- 原始二进制文件长期存储系统
- 聊天中的图片裁剪、标注、编辑
- 图片直接落库为衣橱条目
- 消息撤回、已读回执、复杂附件权限控制
- 首版不建设通用多工具平台或复杂工具链规划引擎

## Product Design
### Input Composer
- 加号菜单第一项改为“上传图片”或“打开相册”
- 选中后在输入框上方展示待发送图片卡片
- 卡片支持：
  - 缩略图
  - 删除待发送图片
  - 可与输入框文本同时存在

### Send Rules
- 文本为空、图片为空：禁止发送
- 仅文本：走现有文本聊天接口
- 仅图片：走图文聊天接口
- 图片 + 文本：走图文聊天接口

### Message List
- 用户侧：
  - 图片消息卡片
  - 如带文本则图片下方显示文本
- Agent 侧：
  - 继续以 Markdown 文本回复为主
  - 不要求在 V1 中返回图片

### Streaming UX
- 带图消息发送后，前端应先进入流式占位状态
- 若模型触发图片工具：
  - 展示“正在分析图片”阶段态
  - 工具返回后进入最终文本流式输出
- 若模型未触发图片工具：
  - 直接进入文本流式输出

### Failure UX
- 图片发送失败时：
  - 保留用户本地图片消息卡片
  - 显示失败状态
  - 不回退为空状态
- 图片工具失败时：
  - 保持当前会话稳定
  - 允许模型基于已有文字上下文给出降级回复

## API Design
### Option Chosen
V1 不改造现有纯文本 `/sessions/:id/chat` 接口为 multipart 上传，而是新增或扩展同一路由支持结构化 JSON 图文消息输入。

推荐输入结构：

```json
{
  "input": "帮我分析这件衣服适合什么场景",
  "latestTask": null,
  "attachments": [
    {
      "type": "image",
      "mimeType": "image/jpeg",
      "name": "shirt.jpg",
      "dataUrl": "data:image/jpeg;base64,..."
    }
  ]
}
```

### Why this shape
- 与当前 Axios JSON 请求兼容，前端改动较小
- 便于 V1 快速复用现有会话接口
- 对后端校验与消息落库更直接

### Constraints
- 单次请求最多 1 张图片
- 图片类型仅允许 `image/*`
- 服务端需限制 dataUrl 大小

## Tool Calling Design
### Chosen Approach
采用“LLM 可调用图片工具 + 轻量兜底策略”的混合方案：
- 默认向 `DeepSeek` 暴露 `analyze_image` 工具
- 由 `DeepSeek` 决定是否需要调用该工具
- 对于“仅发送图片且无文本”这类高概率依赖视觉理解的输入，允许后端做最小兜底，确保至少有一次图片理解机会

### Why this approach
- 比固定前置图片分析更符合 Agent 的职责边界
- 比纯自由工具调用更稳，避免用户只发图时模型未触发工具
- 可在后续平滑扩展到更多工具而不破坏主对话链路

### Tool Contract
工具名：`analyze_image`

输入：
```json
{
  "attachmentIndex": 0,
  "question": "用户当前关于图片的提问，可为空"
}
```

输出：
```json
{
  "summary": "一双白色低帮帆布鞋，风格简洁偏休闲",
  "category": "shoes",
  "attributes": {
    "color": ["white"],
    "style": ["casual", "minimal"],
    "season": ["spring", "summer"],
    "material": ["canvas"]
  },
  "confidence": 0.88
}
```

约束：
- 每条用户消息最多调用 1 次
- 仅允许访问当前消息附件
- 工具结果作为结构化上下文返回给 `DeepSeek`
- 工具结果不直接作为最终用户回复落地

## Backend Flow
1. 接收图文输入
2. 校验附件数量、类型、大小
3. 将用户原始消息写入会话
4. 构建统一 Agent 对话上下文，并向 `DeepSeek` 注册 `analyze_image` 工具定义
5. 执行首轮 `DeepSeek` 请求：
   - 若无需工具：直接进入最终文本流
   - 若触发工具：发出 `tool_call_started` SSE 事件
6. 后端调用 `SiliconFlow Vision`，获取结构化图片分析结果
7. 将工具结果回注到同一轮对话中，并继续执行 `DeepSeek`
8. 发出最终 `content` SSE 流，并在结束后落库 assistant 消息
9. 发出 `message_saved` 事件，刷新会话恢复数据

### Fallback Rules
- 若工具超时或失败：
  - 发出 `tool_call_completed`，标记失败
  - 允许 `DeepSeek` 基于已有文本上下文给出降级说明
- 若用户仅发送图片且未附文：
  - 允许后端自动提供一条简短的兜底用户意图，如“请先理解这张图片并给出基础判断”

### Task Routing Rules
- 写操作、确认操作仍优先走现有任务分支
- 带图消息在 V1 中统一优先进入工具增强聊天链路，以保证最终回复能回到文本流式输出
- 纯文本消息继续沿用现有任务 Agent 分支与聊天分支逻辑
- 写操作、确认操作的续接不受影响

## Data Model
### `agent_messages`
V1 需要支持以下消息类型：
- `chat`
- `image`
- `multimodal`

推荐：
- `content`：保留用户文本内容
- `meta`：新增 JSON 字段或等价结构，保存：
  - `attachments`
  - `imagePreview`
  - `toolCalls`
  - `toolResultsSummary`

如果当前表结构暂不支持 `meta`，可先将结构化内容以 JSON 字符串形式存入 `content` 或新增兼容字段，但需要在实现中明确技术债。

## Summary / Preview Rules
### Session Restore
- 恢复会话时，图片消息必须能还原出：
  - 缩略图预览
  - 关联文本（如有）

### Session List Preview
- 图片消息的摘要优先级：
  1. 用户输入文本摘要
  2. 若无文本，则显示 `发送了一张图片`
  3. 若有工具结果摘要，可显示短句但不得过长

## Security / Performance
- 图片仅允许单张
- 服务端需要校验 dataUrl 前缀是否合法
- 必须限制 base64 大小，避免消息请求过大
- V1 不引入原始 HTML 渲染，不扩大 XSS 面
- 工具调用次数与超时需严格限制，避免被滥用
- `SiliconFlow Vision` 的原始输出需做结构化校验后再回注给 `DeepSeek`

## Rollout Plan
1. 先支持聊天页待发送图片预览
2. 再支持图文接口协议与消息恢复
3. 再接入 `SiliconFlow Vision` 图片工具与工具调用编排
4. 再补充 SSE 阶段事件与最终文本流
5. 最后根据效果决定是否逐步替代“跳 Add 页上传”的主入口

## Open Questions
1. 图片消息元数据是扩展现有表结构，还是短期以 JSON 字符串兼容？
2. `DeepSeek` 现有 SDK 封装中的工具调用协议，采用单轮函数调用适配还是显式多轮编排？
3. V1 是否需要立即支持“发送后重试”？建议先预留状态，不强制首版完成。
