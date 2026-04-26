## Context
当前 Agent 已经具备全产品能力补齐所需的大部分基础设施，但页面跳转 state 与 latestTask 上下文仍延续了多轮迭代留下的顶层字段模式。前端主要在进入 unified-agent、恢复 AiChat 会话和页面回流时使用这些字段；后端则在结果按钮、确认流、附件补全和 autonomous runtime 中再次识别这些对象。

这次变更要解决的问题不是新增能力，而是把“页面上下文如何进入 Agent、Agent 结果如何回流页面”收敛成一个统一协议，并降低后续继续扩散字段名的风险。

## Goals / Non-Goals
- Goals:
  - 建立统一的 `agentContext` 协议
  - 让前后端关键读取层优先走新协议
  - 让新写入路径统一输出 `agentContext`
  - 保持现有历史页面 state 与历史 latestTask 数据兼容
- Non-Goals:
  - 不重写数据库结构
  - 不要求一次性删除所有旧字段分支
  - 不重构所有 Agent 工具输出 schema

## Decisions
- Decision: 使用单一顶层字段 `agentContext` 承载页面上下文。
  - Why: 页面导航 state 需要一个稳定入口，避免不断增加新的顶层字段名。

- Decision: `agentContext` 采用按语义分组的结构：`latestTask`、`focus`、`draft`、`insight`、`attachments`。
  - Why: 这些语义已经覆盖当前项目的主要上下文类型，也便于将来扩展。

- Decision: 读取层“新协议优先、旧字段兼容”，写入层“优先输出新协议”。
  - Why: 可以在不打断现有流程的情况下逐步完成迁移。

## Protocol
```js
{
  agentContext: {
    latestTask: {...},
    focus: {
      type: 'cloth' | 'suit' | 'outfitLog' | 'recommendationHistory',
      entity: {...}
    },
    draft: {
      type: 'suit' | 'outfitLog',
      entity: {...}
    },
    insight: {
      type: 'profile' | 'analytics' | 'weather' | 'styleProfile',
      entity: {...}
    },
    attachments: [
      {
        type: 'image',
        mimeType: 'image/jpeg',
        name: 'shoe.jpg',
        dataUrl: 'data:image/jpeg;base64,...'
      }
    ]
  }
}
```

## Legacy Mapping
- `selectedCloth` -> `agentContext.focus = { type: 'cloth', entity }`
- `selectedSuit` -> `agentContext.focus = { type: 'suit', entity }`
- `selectedOutfitLog` -> `agentContext.focus = { type: 'outfitLog', entity }`
- `recommendationHistory` -> `agentContext.focus = { type: 'recommendationHistory', entity }`
- `latestProfile` -> `agentContext.insight = { type: 'profile', entity }`
- `latestAnalytics` -> `agentContext.insight = { type: 'analytics', entity }`
- `latestWeather` -> `agentContext.insight = { type: 'weather', entity }`
- `styleProfile` -> `agentContext.insight = { type: 'styleProfile', entity }`
- `manualSuitDraft` -> `agentContext.draft = { type: 'suit', entity }`
- `manualOutfitLogDraft` -> `agentContext.draft = { type: 'outfitLog', entity }`
- `prefillImages` -> `agentContext.attachments`
- `latestResult` -> `agentContext.latestTask`

## Risks / Trade-offs
- 旧页面或历史消息仍可能只带旧字段
  - Mitigation: 读取层兼容旧字段，测试覆盖两套输入

- 后端 latestTask 结构仍存在历史形态
  - Mitigation: 在解析 helper 中统一抽象，不要求所有业务结果一次性改写

- 页面写入点较多，容易漏改
  - Mitigation: 优先覆盖 unified-agent 高价值入口、Agent 结果按钮和已接入回流页面，并通过 `rg` 回扫验证
