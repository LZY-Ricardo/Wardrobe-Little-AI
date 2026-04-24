## Context
当前统一 Agent 已经有三层记忆结构：
- 最近 12 轮完整消息
- `agent_session_memory` 中的会话摘要
- `user_style_profile` 中的长期偏好

但其中“标题”和“摘要”部分仍偏规则化。为了提升统一 Agent 的智能感，需要让模型理解“这段会话主要在做什么”“当前还卡在哪”“哪些约束已经被确认”，并生成更稳定、可读、可恢复的结构化摘要。同时，又必须保留规则降级，以避免模型波动导致会话恢复不可用。

## Goals / Non-Goals
- Goals:
  - 让会话标题更像主题概括，而不是首条输入的截断版
  - 让会话摘要更像结构化记忆，而不是字符串拼接
  - 保持现有 `session_memory` 恢复契约不变
  - 在模型不可用时自动回退到规则摘要
- Non-Goals:
  - 不重写统一 Agent 的会话存储层
  - 不改变 `recent_messages` 的恢复逻辑
  - 不把标题和摘要生成扩展成独立工作流引擎

## Decisions
- Decision: 会话标题使用 LLM 生成短标题，长度控制在 8 到 16 个字之间，并在模型失败时回退到现有 `deriveSessionTitle` 规则。
  - Why: 标题主要用于会话列表浏览，必须短、稳、可读。

- Decision: 会话摘要使用 LLM 输出结构化 JSON，包含：
  - `summary`
  - `key_facts`
  - `active_goals`
  - `pending_actions`
  - `last_summarized_message_id`
  - Why: 这样既可直接恢复，又可支持后续任务理解与会话延续。

- Decision: 结构化摘要生成失败时回退到规则摘要，但必须返回完整结构，而不是只给一段字符串。
  - Why: 前端恢复契约和后续运行时依赖结构化字段，不能因模型失败而破坏契约。

- Decision: 标题与摘要优先在这些时机更新：
  - 会话从“新会话”进入有效主题时，生成标题
  - 消息超过 12 轮时，刷新摘要
  - 写操作从待确认变为已执行/已取消/已过期时，刷新摘要
  - Why: 这些节点最能代表会话主题稳定和状态变化。

## Prompt Strategy
### Title Prompt
- 输入：最近消息窗口 + 会话摘要（如有） + 当前长期偏好摘要（可选）
- 输出：单行中文标题
- 约束：
  - 8~16 个字优先
  - 避免“帮我…”、“我想…”这种原句式
  - 避免标点和冗长修饰

### Summary Prompt
- 输入：待摘要的历史消息 + 当前已有摘要（如有） + 长期偏好摘要（如有）
- 输出：JSON
```json
{
  "summary": "...",
  "key_facts": ["...", "..."],
  "active_goals": ["..."],
  "pending_actions": ["..."]
}
```
- 约束：
  - 所有字段必须存在
  - 句子简洁
  - 不编造不存在的对象或状态

## Failure Fallback
### Title Fallback
- 回退到 `deriveSessionTitle`

### Summary Fallback
- 回退到规则摘要，但仍要生成：
  - `summary`
  - `key_facts`
  - `active_goals`
  - `pending_actions`
  - `last_summarized_message_id`

## Integration Points
- `unifiedAgent.helpers`
  - 增加标题/摘要格式化与规则降级函数
- `unifiedAgentRuntime`
  - 增加 LLM 标题生成器和摘要生成器接入点
  - 将会话标题更新与摘要刷新统一挂到运行时触发条件
- 会话列表
  - 直接复用更智能的标题
- 恢复接口
  - 继续复用现有结构，不改契约

## Risks / Trade-offs
- 模型输出不稳定，可能生成风格不统一的标题
  - Mitigation: 严格约束标题长度和风格，失败则规则回退
- 模型摘要可能遗漏关键事实
  - Mitigation: 保留结构化字段校验，不合格则规则回退
- 摘要调用增加请求成本
  - Mitigation: 仅在阈值和关键状态变化时触发，不每轮消息都调用

## Open Questions
1. 标题是否允许用户手工改名覆盖模型结果？本次先不做
2. 摘要生成是否需要批量后台任务？本次先不做
