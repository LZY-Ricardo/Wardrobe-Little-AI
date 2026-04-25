## ADDED Requirements

### Requirement: Reasoning SSE Event

SSE 流 SHALL 在 DeepSeek API 返回 `reasoning_content` 时，向客户端推送 `{ type: 'reasoning', text: '<token>' }` 事件。

#### Scenario: Model produces reasoning content
- **WHEN** DeepSeek API stream chunk 包含 `delta.reasoning_content`
- **THEN** 后端 emit `{ type: 'reasoning', text: '<reasoning_token>' }` SSE 事件
- **AND** 推理 token 逐个推送，与 `content` 事件共享同一 SSE 连接

#### Scenario: Model does not produce reasoning content
- **WHEN** DeepSeek API stream chunk 不包含 `delta.reasoning_content`（如 `deepseek-chat` 模型）
- **THEN** 不推送任何 `reasoning` 类型事件
- **AND** 前端不渲染思考块，行为与当前一致

---

### Requirement: Thinking Process Real-time Display

前端 SHALL 在 streaming 阶段实时展示模型推理内容。

#### Scenario: Reasoning tokens arriving, no content yet
- **WHEN** SSE 收到 `reasoning` 事件且 `message.content` 为空
- **THEN** 在 AI 消息气泡中显示思考块
- **AND** 思考块处于展开状态，显示实时累积的推理文本
- **AND** 推理文本末尾显示流式光标（blinking `▊`）
- **AND** 主内容区域隐藏（typing dots 不显示）

#### Scenario: Reasoning text throttling
- **WHEN** 短时间内连续收到多个 `reasoning` 事件
- **THEN** 前端对 reasoning 事件做节流（100ms 间隔）
- **AND** 节流期间累积 token，批量更新 `localMessages`
- **AND** 用户感知不到延迟

#### Scenario: Throttle buffer flushes before terminal events
- **WHEN** reasoning 节流缓冲区仍有未写入的 token
- **AND** 收到首个 `content`、`message_saved`、`error`、reader 结束或 abort
- **THEN** 前端先 flush 缓冲区，再处理后续状态切换
- **AND** 最后一批 reasoning 文本不会丢失

---

### Requirement: Thinking Process Auto-collapse

思考块 SHALL 在正式内容开始输出时自动折叠。

#### Scenario: Content arrives, user has not manually expanded
- **WHEN** SSE 收到第一个 `content` 事件（`message.content` 从空变为非空）
- **AND** 用户未手动点击过展开按钮（`expandedReasoning` 中不包含该消息 ID）
- **THEN** 思考块自动应用折叠样式
- **AND** 折叠动画平滑过渡（`max-height` + `opacity` transition）
- **AND** 显示"思考了 X 秒 ▾"摘要文字

#### Scenario: Content arrives, user has manually expanded
- **WHEN** SSE 收到 `content` 事件
- **AND** 用户之前手动点击过展开按钮（`expandedReasoning` 中包含该消息 ID）
- **THEN** 思考块保持展开状态，不自动折叠

#### Scenario: Expanded state survives message replacement
- **WHEN** streaming 消息已被用户手动展开
- **AND** `message_saved` 事件用持久化消息替换本地 streaming 占位消息
- **THEN** 持久化消息继续保持展开状态
- **AND** 不出现“先展开后闪回折叠”的 UI 跳变

---

### Requirement: Thinking Process Manual Toggle

用户 SHALL 能手动展开和收起思考过程。

#### Scenario: User clicks collapsed thinking block
- **WHEN** 用户点击"思考了 X 秒 ▾"按钮
- **THEN** 思考块展开，显示完整推理内容
- **AND** 按钮文字变为"收起思考过程 ▴"
- **AND** 展开动画平滑过渡

#### Scenario: User clicks expanded thinking block
- **WHEN** 用户点击"收起思考过程 ▴"按钮
- **THEN** 思考块折叠，隐藏推理内容
- **AND** 按钮文字变为"思考了 X 秒 ▾"

#### Scenario: Thinking duration display
- **WHEN** 思考块处于折叠状态
- **THEN** 显示"思考了 X 秒"文字
- **AND** streaming 消息使用 `reasoningStartTime` 时间戳精确计算
- **AND** 历史消息使用字符数估算（约 30 字符/秒）

---

### Requirement: Historical Message Thinking Display

历史消息 SHALL 从持久化数据中恢复思考内容。

#### Scenario: Session restore with reasoning content
- **WHEN** 用户打开历史会话，消息的 `meta.reasoningContent` 非空
- **THEN** `mapMessage()` 提取 `reasoningContent` 字段
- **AND** AI 消息气泡显示可折叠的思考块
- **AND** 思考块默认折叠，显示估算的思考耗时

#### Scenario: Session restore without reasoning content
- **WHEN** 用户打开历史会话，消息的 `meta.reasoningContent` 为空或不存在
- **THEN** 思考块不渲染，消息显示与当前一致

#### Scenario: Stream completed, message_saved replaces local message
- **WHEN** streaming 完成，`message_saved` 事件触发
- **THEN** 持久化消息的 `meta.reasoningContent` 映射到前端 message 对象
- **AND** 思考块继续正常显示（无缝切换）

---

### Requirement: Reasoning Content Preservation on Failure

流式传输中断时 SHALL 保留已累积的思考内容。

#### Scenario: Stream aborts during reasoning phase
- **WHEN** 流在推理阶段因网络错误中断
- **AND** `reasoningContent` 非空但 `content` 为空
- **THEN** 思考块保持展开状态
- **AND** 显示已累积的部分推理文本
- **AND** 消息标记为失败状态

#### Scenario: Stream aborts after reasoning, before content
- **WHEN** 推理已完成但内容未完全到达时流中断
- **THEN** 保留已累积的 `reasoningContent`
- **AND** 思考块默认折叠（因为部分 `content` 已到达）
- **AND** 用户可手动展开查看

#### Scenario: User cancels stream during reasoning
- **WHEN** 用户主动取消流式传输
- **AND** 当前消息已累积部分 `reasoningContent` 或 `content`
- **THEN** 前端保留该消息而不是直接移除
- **AND** 已累积的思考内容继续可见
- **AND** 消息标记为取消状态，而不是失败状态

### Requirement: Reasoning and Tool Phase Coexistence

前端 SHALL 在 reasoning 与工具阶段文案同时存在时维持稳定且可读的展示顺序。

#### Scenario: Reasoning visible while tool phase message exists
- **WHEN** streaming 消息同时包含 `reasoningContent` 与 `toolPhase`
- **THEN** 思考块渲染在主内容区上方
- **AND** `toolPhase` 文案显示在思考块下方、主内容区上方
- **AND** typing dots 不再显示
