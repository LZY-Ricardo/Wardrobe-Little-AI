## Context
当前 Agent 工具链已经具备三类能力：

1. LLM 自主决定是否调用已登记工具
2. 写操作通过统一确认流执行
3. 图片分析、衣橱查询、推荐生成、衣物修改等能力都已接入同一会话入口

但现有架构中的核心问题是“能力已成形，结构仍偏临时”：
- 工具目录和执行分发集中在一个大注册表文件里
- 写操作确认与工具执行桥接逻辑混合在同一个 Agent 控制器中
- 运行时对工具可见性、风险分级、上下文注入的判断逻辑写死在流程代码里
- 新增一个工具通常意味着要同时修改注册表、运行时和确认逻辑

如果希望后续把项目中所有用户可手动完成的操作都逐步沉淀为 Agent 可代理能力，就必须先把工具体系本身重构成稳定的架构单元。

## Goals / Non-Goals
- Goals:
  - 建立清晰的 Agent 工具体系分层：注册、运行时、策略、执行
  - 让工具元数据成为单一事实来源，支撑 LLM tool schema、权限判断和确认策略
  - 支持读工具、写工具、批量工具、图片工具的统一管理
  - 降低新增工具和修改工具时的改动面
  - 在保持现有对外行为稳定的前提下完成架构迁移
- Non-Goals:
  - 不在本次变更中引入插件市场式的完全动态自动扫描机制
  - 不改变前端现有确认交互模型与核心接口语义
  - 不一次性重写全部业务 controller
  - 不取消当前写操作确认机制

## Decision Summary
### 决策 1：采用“分层重构 + 兼容迁移”方案
- 结论：采用“注册层 + 运行时层 + 策略层 + handlers 层”的分层架构，同时保留现有工具名和主要调用协议
- 原因：这是风险最低、最适合当前代码库的演进路径。相比纯领域拆分或插件化平台，它更容易在不破坏现有行为的前提下完成迁移

### 决策 2：工具元数据必须成为单一事实来源
- 结论：每个工具都由统一元数据对象描述，至少包含：
  - `name`
  - `domain`
  - `mode`（read / write / write_batch / multimodal）
  - `dangerous`
  - `confirmationPolicy`
  - `llmVisible`
  - `contextRequirements`
  - `parameters`
- 原因：当前“工具定义给 LLM 看”和“工具执行时的行为判断”分散在多处，容易偏离。统一元数据后，LLM schema、权限判断和执行路由都从同一个源生成

### 决策 3：确认策略从执行逻辑中拆出
- 结论：确认策略独立成策略层模块，例如：
  - `confirmationPolicy.js`
  - `toolVisibilityPolicy.js`
  - `contextPolicy.js`
- 原因：当前“什么工具需要确认、什么工具可以免确认、删除为什么总是确认”这些规则分散在 `agent.js` 与 runtime 里，不利于后续审计与测试

### 决策 4：工具执行逻辑按业务域组织
- 结论：handlers 按业务域组织，而不是继续堆在统一 registry 文件里
- 原因：项目本身已经是衣物、套装、穿搭记录、画像、图片理解等清晰业务域，执行层按域拆分更符合仓库现状和后续扩展方向

## Target Architecture
### 1. 目录结构
建议目标结构如下：

```text
server/agent/
  tools/
    registry/
      catalog.js
      index.js
    policies/
      confirmationPolicy.js
      contextPolicy.js
      toolVisibilityPolicy.js
    runtime/
      autonomousToolRuntime.js
      toolExecutionRouter.js
      toolDefinitionBuilder.js
      toolEventAdapter.js
    handlers/
      wardrobe/
        readTools.js
        writeTools.js
      suits/
        readTools.js
        writeTools.js
      outfitLogs/
        readTools.js
        writeTools.js
      profile/
        readTools.js
        writeTools.js
      vision/
        analyzeImageTool.js
```

兼容层保留：
- `server/utils/toolRegistry.js` 作为过渡导出层
- `server/controllers/agent.js` 保留任务历史与确认编排
- `server/controllers/unifiedAgentRuntime.js` 保留会话、SSE 和高层消息编排

### 2. 职责边界
#### 注册层
- 聚合所有工具元数据
- 暴露：
  - 全部工具列表
  - 根据名称查询工具
  - 根据 LLM 可见性和上下文过滤工具

#### 运行时层
- 构建 LLM 可见工具 schema
- 执行 autonomous tool loop
- 将工具调用路由到执行层或确认层
- 不再持有具体业务规则和确认规则细节

#### 事件适配层
- 统一生成工具执行过程中的事件与展示元数据
- 统一处理：
  - `tool_call_started`
  - `tool_call_completed`
  - `toolCalls`
  - `toolResultsSummary`
  - 供前端展示的工具状态文案
- 保证前端现有“工具执行中 / 已完成 / 待确认”的体验在重构后保持兼容

#### 策略层
- 决定工具是否对当前 LLM 可见
- 决定某个工具是否必须确认
- 决定哪些上下文需要注入给模型
- 将“低风险免确认”“删除强制确认”等规则集中收敛

#### Handler 层
- 每个工具实际调用共享业务函数
- 不处理会话、SSE、确认 UI 等上层概念
- 尽量保持函数粒度清晰、可测试

#### Agent 任务编排补充职责
- `agent.js` 在本次重构后不应继续承担全部杂糅逻辑，而应显式拆分为：
  - `confirmationService`：生成待确认任务、确认执行、取消执行、恢复 pending 状态
  - `agentTaskHistoryRepository`：任务历史写入、更新、查询、恢复
  - `legacyTaskFallbackService`：处理未走 tool loop 的兼容任务解析与旧自然语言兜底执行
- 在迁移完成前，`agent.js` 可作为聚合入口，但新增逻辑不得继续直接堆入主文件

## Tool Metadata Model
建议统一工具元数据结构如下：

```js
{
  name: 'create_cloth',
  domain: 'wardrobe',
  mode: 'write',
  llmVisible: true,
  dangerous: true,
  confirmationPolicy: 'always',
  contextRequirements: ['userId'],
  description: '创建一条衣物记录到当前用户衣橱',
  uiLabel: '保存到衣橱',
  resultPresenter: 'wardrobe.write.createClothResultPresenter',
  confirmationDescriptor: 'wardrobe.write.createClothConfirmationDescriptor',
  parameters: { ...jsonSchema },
  handler: 'wardrobe.write.createCloth'
}
```

对于低风险写操作可使用：
- `confirmationPolicy: 'low-risk-optional'`

对于查询类工具：
- `confirmationPolicy: 'never'`

对于批量写工具：
- `mode: 'write_batch'`

为保证执行与展示都来源一致，metadata 至少应支持以下两类扩展字段：
- 展示类：
  - `uiLabel`
  - `resultPresenter`
- 确认类：
  - `confirmationDescriptor`

其中：
- `resultPresenter` 负责生成工具执行后的摘要、状态文本与可选展示数据
- `confirmationDescriptor` 负责生成确认卡片所需的标题、摘要、范围与 details

## Execution Flow
### 读工具
1. runtime 从 registry 获取工具元数据
2. strategy 判断是否对当前会话/模型可见
3. toolExecutionRouter 调用对应 handler
4. 结果回填给 LLM 或直接回给前端

### 写工具
1. runtime 识别为写工具
2. confirmationPolicy 决定：
   - 直接执行
   - 进入确认
   - 拒绝执行
3. 若进入确认，由 `agent.js` 生成待确认任务和可恢复 payload
4. 用户确认后，再由执行路由调用 handler

### 流式事件与展示输出
1. runtime 在每次工具调用开始时通过 `toolEventAdapter` 生成标准事件
2. 工具执行完成后，再由 `toolEventAdapter` 生成成功/失败事件和展示摘要
3. 前端依赖的 `toolCalls`、`toolResultsSummary`、确认前后状态文本，统一由事件适配层构建
4. runtime 本身不直接硬编码前端展示字段，避免重构后再次形成新的集中式耦合

## Migration Strategy
采用三阶段迁移：

### 阶段 1：抽元数据，不改行为
- 把现有工具定义从 `toolRegistry.js` 中整理成标准 metadata
- 保持现有 `executeTool(name, args, ctx)` 兼容出口
- 增加 registry 与 policy 模块，但不立即删除旧逻辑
- 从本阶段开始，新增工具不得再直接把完整执行逻辑写入 `toolRegistry.js`

### 阶段 2：拆执行层
- 将衣物、套装、穿搭记录、画像、图片分析等工具执行迁移到 handlers
- `toolRegistry.js` 退化为兼容层
- 为关键策略补测试

### 阶段 3：收敛 runtime / confirm flow
- runtime 只关心 tool loop 和高层编排
- confirm flow 只关心待确认任务生成、恢复和确认执行
- 删除旧的硬编码判断分支

### 迁移批次建议
建议按以下批次迁移，而不是完全自由拆分：
1. 基础读工具：
   - `get_user_profile`
   - `get_profile_insight`
   - `get_wardrobe_analytics`
   - `list_clothes`
   - `get_cloth_detail`
2. 衣物写工具：
   - `create_cloth`
   - `create_clothes_batch`
   - `update_cloth_fields`
   - `set_cloth_favorite`
   - `delete_cloth`
3. 推荐/套装/穿搭写工具：
   - `generate_scene_suits`
   - `save_suit`
   - `create_outfit_log`
   - `delete_suit`
   - `delete_outfit_log`
4. 画像与偏好工具：
   - `update_user_sex`
   - `update_confirmation_preferences`
5. 多模态工具：
   - `analyze_image`

每一批迁移完成后，都必须通过对应回归测试，且未迁移工具不得混入新架构路径中间状态。

## Risks / Trade-offs
- 过渡期会出现“新旧结构并存”
  - Mitigation: 明确兼容层职责，阶段性迁移，避免一次性重写

- 工具元数据设计过少会继续把逻辑漏回 runtime
  - Mitigation: 本次提案要求元数据至少包含 domain、mode、confirmationPolicy、llmVisible、contextRequirements

- 工具元数据设计过多会增加维护负担
  - Mitigation: 只保留当前 runtime 确实需要消费的字段，避免做成过重的平台模型

- 运行时和确认层若迁移不彻底，仍会残留双重判断
  - Mitigation: 在迁移阶段明确“策略判断只能来自 policy 层”，禁止新增硬编码分支

## Validation Plan
- 为 registry 增加工具发现与过滤测试
- 为 policy 增加风险等级与确认决策测试
- 为 runtime 保留自主工具调用回归测试
- 为 confirm flow 保留数据库恢复测试
- 为 event adapter 增加流式事件与展示摘要测试
- 为 metadata presenter / confirmation descriptor 增加兼容性测试
- 对以下高价值链路做集成回归：
  - 图片识别并保存衣物
  - 批量保存识别出的多件衣物
  - 推荐后保存套装
  - 推荐后记录穿搭

## Migration Guardrails
- 新增工具禁止继续把完整逻辑直接写入 `server/utils/toolRegistry.js`
- 新增运行时判断禁止继续直接堆入 `server/controllers/unifiedAgentRuntime.js`
- 新增确认策略禁止继续直接堆入 `server/controllers/agent.js`
- 兼容层仅允许做转发、兼容导出与迁移期适配，不允许继续吸收新业务逻辑
- 每批迁移都必须附带“已迁移工具清单 + 对应测试清单 + 未迁移工具清单”

## Open Questions
1. 是否在本次变更中把工具可见性做成按 intent 精细过滤？建议纳入第一阶段最小版，只区分 clothing / project 两类
2. 是否让页面端未来也直接消费同一套 metadata？建议本次先不做，只服务 Agent 后端
3. 是否在本次变更中彻底移除旧 `toolRegistry.js`？建议不移除，保留兼容层直到第二轮收尾
