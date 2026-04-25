# Unified Agent Tool Calling Architecture

> 目标：让 Clothora 的 unified-agent 成为统一业务代理入口，由 LLM 自主决定调用哪些工具，而 runtime 负责执行护栏、确认拦截与状态回写。

## 1. 当前架构结论

当前真实接口（`/unified-agent` 与兼容 `/chat`）已采用：

- **LLM 主导工具选择**
- **runtime 负责工具执行与护栏**
- **写操作统一进入确认流**

也就是说，用户输入文本、图片或图文组合后：

1. unified-agent 构造系统提示、会话摘要、长期偏好摘要和当前对象上下文
2. 将工具目录注入给 LLM
3. LLM 自主决定：
   - 是否调用工具
   - 调用哪些工具
   - 工具调用顺序
   - 什么时候结束并输出最终回复
4. runtime 负责：
   - 工具白名单
   - 参数解析与校验
   - 最大轮数限制
   - 错误兜底
   - 写操作确认
   - 任务历史与消息持久化

## 2. 工具目录

当前 unified-agent 可被 LLM 决策调用的工具分为三类：

### 2.1 读取类工具

- `get_user_profile`
- `get_profile_insight`
- `get_wardrobe_analytics`
- `list_clothes`
- `get_cloth_detail`
- `generate_scene_suits`
- `analyze_image`

特点：

- 可直接执行
- 返回最小必要字段
- 结果回填给模型继续推理或直接回答

### 2.2 写入类工具（需确认）

- `create_cloth`
- `update_cloth_fields`
- `set_cloth_favorite`
- `delete_cloth`
- `delete_suit`
- `delete_outfit_log`
- `save_suit`
- `create_outfit_log`
- `update_user_sex`
- `update_confirmation_preferences`

特点：

- LLM 可以决定“要调用哪个写工具”
- runtime 不直接落库，而是桥接到既有确认模型
- 删除类操作始终确认
- 低风险动作可继续复用免确认偏好

## 3. 会话上下文注入

为了让 LLM 能处理“这件 / 这双 / 刚刚那套 / 当前记录”这种表达，runtime 会在 tool loop 前注入标准化上下文块：

- 当前衣物上下文
- 当前套装上下文
- 当前穿搭记录上下文
- 当前推荐结果上下文
- 会话摘要
- 长期偏好摘要

这样 LLM 可以直接基于上下文决定：

- 查看详情
- 修改字段
- 删除对象
- 保存推荐为套装
- 记录推荐为穿搭

## 4. 图片链路

图片不再被视为“特殊 workflow 入口”，而是统一纳入工具目录中的 `analyze_image`：

1. LLM 看到图片与用户目标
2. 自主决定是否调用 `analyze_image`
3. 获取分析结果后继续决定：
   - 直接回答图片相关问题
   - 生成衣物草稿并发起 `create_cloth`
   - 要求用户补字段澄清

兼容层中仍保留旧的图片工作流，但真实 autonomous 模式不会优先走旧链路。

## 5. Runtime 护栏

runtime 的职责边界如下：

### 5.1 允许的能力

- 只执行工具目录中登记过的工具
- 接受 LLM 的多轮工具调用
- 将工具结果结构化回填给模型
- 在需要时终止并返回待确认任务

### 5.2 不允许的能力

- 不允许模型直接访问数据库
- 不允许模型绕过确认直接执行高风险写操作
- 不允许未知工具名执行
- 不允许无限轮工具调用

### 5.3 错误恢复

当出现以下情况时，会话不会直接失败：

- 未知工具
- 坏参数
- 写工具待确认构造失败
- 图片分析失败
- 普通工具执行报错

这些错误会被包装为 tool result 回填给模型，由模型继续澄清或给出兜底回复。

## 6. 统一消息协议

为了让数据库恢复、SSE 流式过程和前端渲染保持一致，unified-agent 现在使用一套收口后的消息协议。

更贴近实现细节的共享契约说明见：

- [Unified Agent Shared Contract](./unified-agent-shared-contract.md)

### 6.1 `agent_messages` 关键字段

每条消息的持久化最小字段如下：

- `role`
  - `user`
  - `assistant`
- `content`
  - 最终展示文本
  - 用户图片消息会保存为 `[图片消息]` 或包含 `用户说明：...`
- `message_type`
  - `chat`
  - `image`
  - `multimodal`
  - `task_result`
  - `confirm_request`
  - `confirm_result`
- `confirmation_status`
  - `''`
  - `pending`
  - `confirmed`
  - `cancelled`
- `task_id`
  - 对应任务历史 id，可为空
- `tool_name`
  - 兼容旧链路保留字段
- `meta_json`
  - 结构化展示元数据

其中：

- `appendMessage` 在写库前会对 `message_type`、`confirmation_status`、`meta_json` 做归一化
- `hydrateMessage` 在读库后会再次做协议级清洗，保证历史脏数据不会直接泄露到前端

### 6.2 `meta_json` 协议

`meta_json` 只保留以下受支持字段：

```json
{
  "attachments": [
    {
      "type": "image",
      "mimeType": "image/jpeg",
      "name": "shoe.jpg",
      "dataUrl": "data:image/jpeg;base64,..."
    }
  ],
  "reasoningContent": "先分析图片，再决定是否需要写入工具",
  "actionButton": {
    "label": "打开编辑衣物",
    "to": "/update",
    "pageKey": "editCloth",
    "pageLabel": "编辑衣物",
    "reason": "继续补充品牌、季节、材质等信息",
    "variant": "secondary",
    "state": {
      "cloth_id": 12,
      "name": "白色运动鞋"
    }
  },
  "pendingConfirmation": {
    "confirmId": "confirm_xxx",
    "summary": "准备保存到衣橱",
    "scope": "cloth_id=12",
    "risk": "将新增一件衣物",
    "actionLabel": "保存到衣橱",
    "targetPage": {
      "key": "wardrobe",
      "label": "虚拟衣柜",
      "to": "/outfit"
    },
    "details": {
      "name": "白色运动鞋",
      "type": "鞋类",
      "color": "白色",
      "season": "春秋"
    }
  },
  "toolCalls": [
    {
      "name": "analyze_image",
      "label": "图片分析",
      "status": "success",
      "at": 1745560000000
    }
  ],
  "toolResultsSummary": [
    "识别到一双白色运动鞋"
  ]
}
```

约束说明：

- 只保留白名单字段，未知字段会被丢弃
- 仅保留可 JSON 序列化的 plain object / array / primitive
- 文本、数组长度、嵌套深度都有上限，避免 meta 无限膨胀
- `actionButton` 至少需要 `label + to`
- `pendingConfirmation` 至少需要 `confirmId`
- `toolCalls` 至少需要 `name` 或 `label`

### 6.3 SSE 事件协议

流式接口 `/unified-agent/sessions/:id/chat-stream` 当前会发送这些事件：

- `meta`
  - 会话层元信息，例如标题
- `reasoning`
  - 增量思考文本
- `content`
  - 增量回复正文
- `tool_call_started`
  - 工具开始执行
  - `meta.toolCalls[0]` 会带 `label/status=running`
- `tool_call_completed`
  - 工具结束
  - `meta.toolCalls[0]` 会带 `label/status=success|failed`
  - `summary` 为工具结果摘要
- `task_result`
  - 本轮进入任务结果或待确认结果
  - `message` 为已落库 assistant 消息
- `message_saved`
  - 普通 assistant 回复完成并持久化
  - `message` 为已落库 assistant 消息
- `error`
  - 流式阶段错误

原则上：

- SSE 是“过程层协议”
- `agent_messages` 是“落库层协议”
- 前端最终展示统一以落库后的 `message + meta` 为准

## 7. 兼容层现状

以下旧逻辑仍然存在，但不再承担真实 autonomous 主路径职责：

- `runAgentWorkflow`
- `resolveWriteActionOptions`
- `classifyAgentTask`

它们目前的角色是：

- 支持旧测试与兼容模式
- 为逐步收敛提供过渡

真实接口下，主路径已经是统一 tool loop。

## 8. 验收标准

视为“全量自主工具调用”达成的标准：

- 纯文本请求由 LLM 自主决定读工具 / 写工具 / 不调用工具
- 图片请求由 LLM 自主决定是否先分析图片
- 推荐后的保存套装 / 记录穿搭由 LLM 自主触发
- 当前对象上下文操作由 LLM 自主决定
- 所有写操作仍受确认护栏约束
- 参数错误或工具错误不会炸会话

## 9. 后续建议

接下来最值得继续推进的是：

1. 前端展示更完整的工具调用状态与确认卡片
2. 逐步删除兼容层中的旧关键词分流
3. 为 SSE 增加 traceId / stepId，方便排查一轮 autonomous tool loop
4. 为 `genPreview` 等更复杂能力补充标准工具定义
