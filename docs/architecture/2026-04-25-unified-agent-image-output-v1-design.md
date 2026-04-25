# Unified Agent 通用图片输出 V1 设计

## 背景

当前 Clothora 的 unified-agent 已支持用户向 agent 发送图片，并在同一轮对话中完成图片分析与文本流式回复。但 assistant 侧消息仍以文本为主，聊天协议和前端渲染层都没有“agent 主动回图”的正式能力。

这直接限制了几个高频场景：

- 用户在获得穿搭推荐后，希望直接查看推荐单品图片
- 用户追问“把刚才那件/那套/那条记录的图片发我看看”时，agent 只能文字描述
- 未来若要扩展到更多业务对象或图片派生能力，当前消息模型缺少稳定的媒体承载结构

因此 V1 需要为 unified-agent 增加“assistant 通用图片输出”能力，但先只覆盖系统已有图片与由已有图片组合生成的图片，不引入外部 URL 或 AI 生图。

## 目标

- 让 assistant message 可以在任意对话场景中输出图片
- 统一 user/assistant 图片消息的底层协议，避免维护两套渲染逻辑
- 支持两类图片来源：
  - 系统已有图片，例如衣橱单品图
  - 组合图片，例如套装/推荐结果的 composite cover
- 保持当前 SSE、会话恢复、消息持久化链路兼容
- 为后续扩展到外部图、搜索图、AI 生图保留协议空间

## 非目标

- 不在 V1 接入外部图片 URL 直出
- 不在 V1 接入联网搜图
- 不在 V1 接入 AI 生图
- 不让模型自由编造图片来源；V1 的图片输出必须能映射到系统已知业务对象

## 设计原则

### 1. 图片是 assistant 主消息内容，不是附属说明

图片不应继续塞进 `toolResultsSummary`、`actionButton` 或临时展示字段中。assistant 的图片输出属于消息主内容，应与文本并列持久化并可恢复。

### 2. 先统一协议，再扩展来源

V1 只做内部图片与组合图，但消息协议应具备可扩展性，后续新增外部图或生图时不应推翻现有 schema。

### 3. 模型负责表达意图，服务端负责补充可回显图片

V1 不要求模型主动生成完整图片附件。服务端根据已知业务对象和当前任务上下文决定是否补图，避免模型编造不存在的图片对象或不稳定引用。

## 方案概述

### 消息协议

assistant message 继续沿用 `meta.attachments` 作为图片承载字段，但扩展 attachment schema，使其同时适用于 user/assistant。

V1 attachment 结构：

```json
{
  "type": "image",
  "name": "白色衬衫上衣",
  "mimeType": "image/png",
  "dataUrl": "data:image/png;base64,...",
  "source": "wardrobe",
  "variant": "original",
  "objectType": "cloth",
  "objectId": 23
}
```

组合图示例：

```json
{
  "type": "image",
  "name": "明日通勤搭配",
  "mimeType": "image/png",
  "dataUrl": "data:image/png;base64,...",
  "source": "composite",
  "variant": "composite",
  "objectType": "recommendation",
  "objectId": 18
}
```

字段说明：

- `source`：图片来源，V1 只允许 `wardrobe`、`suit`、`outfit_log`、`recommendation`、`composite`
- `variant`：图片形态，V1 只允许 `original`、`composite`
- `objectType`：业务对象类型，例如 `cloth`、`suit`、`outfit_log`、`recommendation`
- `objectId`：业务对象 id，便于后续追溯与扩展

### 后端模块划分

新增独立图片装配层，例如：

- `server/controllers/unifiedAgentAttachments.js`

职责：

- 将业务结果映射为 assistant 可发送的 attachment 列表
- 复用已有图片字段构造 `original` 图
- 在需要时复用组合图逻辑构造 `composite` 图
- 控制 V1 可输出图片的来源白名单

`unifiedAgentRuntime.js` 只负责：

- 判定当前回复是否允许补图
- 调用 attachment builder
- 在 assistant message 持久化时写入 `meta.attachments`

### 前端渲染

`AiChat` 当前已经具备用户图片网格渲染能力。V1 将其抽象为通用消息图片区：

- user/assistant 共用一套附件渲染逻辑
- 单图展示为大卡
- 多图展示为网格
- 若同时存在 `composite` 与 `original`，优先将 `composite` 作为主图
- 保留点击预览能力

### 触发策略

V1 采用“服务端确定性补图”，而不是“模型任意声明要回图”。

允许自动补图的场景：

- 推荐结果
- 单件衣物详情
- 单套套装详情
- 单条穿搭记录详情
- 基于当前上下文对象的继续追问，例如“把这套图发我”

不自动补图的场景：

- 无法映射到业务对象的泛泛问答
- 只有文字历史、缺少可解析对象的旧消息
- 外部图片请求

## 数据流

### 发送链路

1. agent 完成一次文本回复或任务结果回复
2. runtime 从 `latestTask`、任务结果、当前上下文中解析候选业务对象
3. attachment builder 根据对象类型装配图片
4. 将 attachment 列表写入 assistant message 的 `meta.attachments`
5. SSE `message_saved` 恢复 payload 返回完整消息
6. 前端恢复后统一渲染图文消息

### 会话恢复

当前 `hydrateMessage` 已会把 `meta.attachments` 展开到 `message.attachments`。V1 只需扩展 attachment schema 的归一化逻辑，既可兼容旧消息，也可支持 assistant 图片消息恢复。

## 关键实现点

### 1. 扩展 attachment 归一化

需要同时修改：

- `server/controllers/unifiedAgentMessageMeta.js`
- `client/src/pages/AiChat/messageMeta.js`

新增字段白名单与长度限制：

- `source`
- `variant`
- `objectType`
- `objectId`

同时保持对旧 attachment 结构的兼容，避免影响已存在的用户图片消息。

### 2. 统一 assistant 图片装配

对以下对象生成图片：

- `cloth`
  - 直接使用 `image`
- `recommendation`
  - 由推荐项中的衣物图片生成 `composite`
  - 可同时附带最多 3 张原始衣物图
- `suit`
  - 优先组合图，再回原始单品图
- `outfit_log`
  - 同 suit 逻辑

### 3. 历史推荐数据的处理

当前 `recommendation_history.result_payload` 保存的 `items` 不包含 `image`。因此 V1 不应依赖 recommendation_history 单表直接恢复图片，而应在运行时从真实衣物对象补齐图片，或利用最新上下文对象中的完整衣物数据。

这意味着 V1 首版必须以“当前轮次/当前上下文对象”优先，不承诺任意旧推荐历史都能 100% 无额外查询地回图。

### 4. 组合图生成

客户端已有 `client/src/utils/compositeCover.js`。V1 可以先复用现有组合图实现以降低改动面。

首版建议：

- 先在前端渲染阶段消费服务端已给出的 `composite` 图
- 组合图生成位置优先保持单一，避免前后端双端各生成一份不一致的封面

若当前后端不便直接生成 composite dataUrl，可先由已有推荐/套装页面的现成组合图结果回传；若仍不可行，再评估是否将组合图生成迁入服务端。

## 风险与权衡

### 1. `meta.attachments` 继续承载主内容

严格来说，图片已经接近主内容层，不是理想的长期模型。但当前消息表结构与恢复链路已经建立在 `meta_json` 上，V1 继续复用 `meta.attachments` 是最小改动方案。

后续若 assistant 多媒体能力继续扩大，再评估是否将 attachments 提升为消息表显式字段。

### 2. recommendation 历史回图能力受限

由于推荐历史表未冗余图片，旧历史详情的回图需要额外查询或依赖上下文对象。V1 先保证当前会话与当前对象链路稳定，不为历史全量追溯引入过度设计。

### 3. 组合图位置需要统一

如果组合图一部分在前端生成，一部分在后端生成，容易造成图片不一致。V1 实现时需要明确“最终谁生成 composite dataUrl”。

## 测试策略

后端：

- `unifiedAgentMessageMeta` 附件归一化测试
- assistant message 带图片附件时的 hydrate/restore 测试
- recommendation / cloth detail / suit detail / outfit_log detail 的 attachment builder 测试
- unified-agent runtime 集成测试，验证 assistant message 能持久化 `attachments`

前端：

- `messageMeta` 与 `viewModels` 对 assistant attachments 的映射测试
- `AiChat` assistant 单图/多图/组合图渲染测试
- 旧用户图片消息兼容测试

## 后续扩展接口

为未来 Phase 2/3 预留：

- `source: external_url`
- `source: generated`
- `variant: preview`
- `thumbnailDataUrl`
- `remoteUrl`

但这些字段不在 V1 实现范围内。

## 验收标准

- assistant 可在支持的业务场景中返回图片
- 图片与文本可在同一条 assistant message 中共存
- 会话刷新后图片仍能恢复
- user/assistant 图片消息共用渲染链路
- 不影响当前用户发图与图片分析流式链路
