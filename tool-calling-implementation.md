# 工具调用（Tool Calling）实施步骤（面向本项目：Koa + React + Ollama）

> 目标：让 `/aichat` 的 AI 助手不只“聊天”，而是能**基于用户真实数据与项目接口**给出可执行指导（衣橱/场景推荐/搭配预览排查/用户资料等），并显著降低“泛泛而谈/幻觉”。

## 0. 当前项目背景（简述）

- 前端：`client/src/pages/AiChat/index.jsx` 通过 SSE 调用后端 `/chat` 并流式展示。
- 后端：`server/routes/chat.js` 将消息转发到本地 Ollama `/api/chat`（流式），并已具备：
  - 注入 system prompt（项目使用指导 + 穿搭知识）
  - 角色规范化（`bot` → `assistant`）
  - 鉴权（JWT `verify()`）
  - 历史裁剪与超时配置（env）
  - `/help` 快捷命令

工具调用要做的是：在服务端 **“先规划是否需要工具→执行工具→再让大模型用工具结果回答”**，前端仍保持只调 `/chat`，不增加复杂度。

---

## 1. 定义“工具调用”的最小闭环（MVP）

### 1.1 建议先做的工具（优先级从高到低）

> 注意：工具应该返回**最小必要数据**（尤其不要把 base64 图片塞给大模型）。

1) `get_user_profile`
- 用途：回答“为什么 match 不能生成/为什么推荐失败/我需要先设置什么”等问题
- 数据来源：`ctx.userId` + 现有用户信息查询（等价于 `/user/getUserInfo`）
- 返回建议字段：`{ id, username, sex, characterModel, hasPhoto }`

2) `list_clothes`
- 用途：回答“我的衣橱里有哪些？缺什么？按场景怎么选？”以及给出基于衣橱的搭配建议
- 数据来源：`getAllClothes(user_id)`（等价于 `/clothes/all`）
- 返回建议字段：`[{ cloth_id, name, type, color, style, season, material, favorite }]`
- 支持参数：`limit`、`type`、`style`、`season`、`favoriteOnly`

3) `generate_scene_suits`
- 用途：把“场景推荐”能力接到聊天里（用户在聊天里说“商务场景给我推荐”）
- 数据来源：当前已实现优先离线本地规则（无需 Coze）；Ollama 负责解释与补充建议。
- 返回建议字段：标准化后的 `{ suits: [...] }`，并保证可解析
- 失败降级：衣橱为空返回 `{ error: "EMPTY_CLOSET" }` 并引导先上传；规则无法组成套装时退化为单品推荐。

4) `get_project_help`（可选/未实现）
- 用途：当用户问“这个项目有什么功能/怎么用”时，返回**可信的项目功能索引**（避免模型编造）
- 数据来源：静态文本（可复用 `server/utils/aichatPrompt.js` 的项目概览块），或后续升级为 RAG

### 1.2 工具调用的统一协议（建议固定 JSON）

为了不依赖 Ollama 是否原生支持 function calling，建议采用“结构化输出 + 解析”的通用协议：

**规划阶段（planner）输出：**
```json
{
  "action": "tool",
  "tool": "list_clothes",
  "arguments": { "limit": 30, "favoriteOnly": true },
  "reason": "用户想基于衣橱做推荐"
}
```

或不需要工具：
```json
{ "action": "none", "reason": "..." }
```

> 强约束：planner 只允许输出 JSON，不允许额外解释文本；服务端对 JSON 做严格校验，失败则降级为普通聊天回答。

---

## 2. 服务端实现步骤（推荐方案：服务端编排，前端不变）

### 2.1 新增“工具注册表”（白名单 + schema + 执行器）

新增文件建议：
- `server/utils/toolRegistry.js`

内容结构建议：
1) `TOOLS`：工具定义数组（name/description/parameters JSON Schema）
2) `executeTool(name, args, ctx)`：只允许白名单工具执行
3) 参数校验：先简单手写校验（MVP），后续再引入 jsonschema/ajv（如确有需要）

伪代码示例（结构）：
```js
// server/utils/toolRegistry.js
const TOOLS = [
  {
    name: 'list_clothes',
    description: '获取当前用户衣橱列表（可筛选）',
    parameters: {
      type: 'object',
      properties: {
        limit: { type: 'integer', minimum: 1, maximum: 60 },
        favoriteOnly: { type: 'boolean' },
        type: { type: 'string' },
        season: { type: 'string' },
        style: { type: 'string' },
      },
    },
  },
  // ...
]

async function executeTool(name, args, ctx) {
  // 1) 白名单
  // 2) 参数校验（最小）
  // 3) 只返回必要字段（数据最小化）
}

module.exports = { TOOLS, executeTool }
```

### 2.2 在 `/chat` 内实现“两段式调用”

目标：保持当前 SSE 流式输出不变，但在后端内部做编排。

#### Step A：规划（planner，非流式）
1) 取最近 1-3 条用户消息（减少 token 与不确定性）
2) system prompt：明确告诉模型“只能输出 JSON 计划”
3) 调用 Ollama：`stream:false`，可尝试 `format:'json'`（如可用）
4) 解析 JSON：
   - 无法解析 → 降级到普通对话（不走工具）
   - `action:none` → 不调用工具，直接进入普通回答
   - `action:tool` → 进入 Step B

#### Step B：执行工具（tool runner）
1) 使用 `ctx.userId` 做鉴权上下文
2) 执行 `executeTool(tool, arguments, ctx)`
3) 处理超时/异常：
   - 可返回 `{ error: "...", detail: "..." }`
   - 不抛出未捕获异常，避免 SSE 中断

#### Step C：生成最终回答（answer，流式）
1) 构造 messages：
   - `system`：你当前用于“项目导览 + 穿搭建议”的 system prompt
   - `user`：用户原问题（或 recent history）
   - `assistant`：可选插入“我正在调用工具...”的提示（也可直接 SSE 输出一段提示）
   - `tool_result`：用固定格式注入（例如以 `【TOOL_RESULT】...` 包住 JSON）
2) 让模型“基于工具结果回答”，并强约束：
   - 引用工具结果时要说明依据（例如“根据你的衣橱里有：…”）
   - 不要编造工具未返回的字段
3) 调用 Ollama：`stream:true`，并继续 SSE 转发给前端（复用你现有实现）

> 最关键点：**工具结果注入格式要稳定**，例如：
```text
【TOOL_RESULT name=list_clothes】
{...json...}
【/TOOL_RESULT】
```
这样不依赖 Ollama 是否支持 `role:tool`，兼容性更强。

### 2.3 数据最小化与隐私

强建议：
- `list_clothes` 默认不返回 `image/base64`
- 只返回“推荐决策需要”的字段；必要时提供 `hasImage: true/false`
- 对 `username` 这类字段也尽量少回传（除非用于解释流程）

### 2.4 风险控制（务必做）

- 白名单：禁止任意函数执行
- 参数校验：避免 prompt injection 让模型构造危险参数（例如试图访问文件、拼 SQL）
- 超时：工具执行与 Ollama 调用都设置 timeout，并在 SSE 内给出友好提示
- 限流/并发：`/chat` 建议最少做“同一用户同时仅允许 1 个生成中请求”（后续再做全局限流）

---

## 3. 前端配合（可选，MVP 可不改）

MVP：前端仍只展示流式文本即可（你现在已经可用）。

增强项（建议第二阶段）：
- 展示“工具调用中…”的 UI 状态（例如一个小 badge）
- 展示“依据：衣橱/个人信息/场景推荐接口”的引用提示
- 给用户一个开关：是否允许 AI 读取衣橱数据（隐私提示）

---

## 4. 分阶段落地路线图（建议按顺序做）

### Phase 1（1-2 天）：工具调用 MVP
- [x] 工具注册表 + 2 个工具：`get_user_profile`、`list_clothes`
- [x] `/chat` 两段式：planner（非流式）→ tool → answer（结合 SSE 流式输出）
- [x] 失败降级：planner 解析失败 → 走普通聊天
- [x] 数据最小化（不回传图片）

### Phase 2（2-4 天）：补齐“场景推荐”与“项目导览”
- [x] `generate_scene_suits` 工具接入（优先离线规则；衣橱为空降级提示）
- [ ] `get_project_help` 工具（静态，可选）→ 后续升级为 RAG

### Phase 3（持续）：体验与安全
- [ ] 统一 traceId/日志，记录工具调用耗时与失败原因
- [ ] per-user 并发控制、限流、黑名单
- [ ] 前端展示工具调用状态

---

## 5. 你可以直接照抄的“planner prompt”模板（示例）

> 放在服务端常量里即可（不要太长）

```text
你是一个“工具调用规划器”。你只能输出 JSON，禁止输出任何额外文本。

可用工具：
1) get_user_profile({})：获取当前登录用户信息（sex/characterModel 等）
2) list_clothes({limit?, favoriteOnly?, type?, season?, style?})：获取衣橱衣物列表
3) generate_scene_suits({scene, limit?})：基于衣橱生成场景推荐（离线规则；不返回图片）
4) get_project_help({})：项目功能与页面导航（可选/未实现）

规则：
- 如果用户的问题需要依赖“用户真实数据”或“项目真实状态”，选择 action=tool。
- 如果只需要穿搭常识解释/项目概念解释，选择 action=answer。
- 当选择 action=tool 时，只能选择一个最关键的工具（MVP 先单工具），arguments 必须最小化。

输出格式（二选一）：
{ "action":"tool", "tool":"...", "arguments":{...}, "reason":"..." }
或
{ "action": "none", "reason": "..." }
```

---

## 6. 验收清单（建议你按这个冒烟）

- [ ] 询问项目功能：AI 不编造页面，能给 `/outfit`、`/add`、`/recommend`、`/match` 的清晰路径
- [ ] 询问“我衣橱里有什么”：AI 会触发 `list_clothes`，并给出概览/缺口建议
- [ ] 询问“商务场景怎么穿（基于我的衣橱）”：若衣橱少，AI 会提示先上传；若有衣橱，能引用衣物属性给建议
- [ ] 断网/超时：AI 会友好提示，不会卡死 SSE

---

## 7. 常见坑（提前规避）

- planner 输出经常夹带解释文本 → 必须强约束“只输出 JSON”，并做健壮解析/降级。
- 工具结果太大 → 要限制 `limit` 与字段，避免上下文爆炸与响应变慢。
- 图片/base64 入上下文 → 必须禁止或改成 `hasImage`。
- 用户多次点击发送导致并发 → 需要“同一用户单并发”或前端禁用按钮（你前端已有一定限制）。

---

## 8. 下一步建议（你确认后我可以直接实现）

如果你希望我继续把这套“工具调用 MVP”真正写进代码，我建议从：
1) `list_clothes` + `get_user_profile` 两个工具开始
2) `/chat` 内加入 planner/runner/answer 三段式编排
3) 前端仅加一个“显示工具调用状态”的小提示（可选）


---

## 9. 写操作工具（已实现，需二次确认）

为了避免误操作，写操作工具不会由 planner 自动触发，只能通过显式命令发起；服务端返回确认码后，用户再次确认才会执行。

### 9.1 可用命令
- `/favorite <cloth_id> on|off`：收藏/取消收藏衣物
- `/delete <cloth_id>`：删除衣物
- `/update <cloth_id> {"name":"...","color":"..."}`：更新衣物字段（不支持图片）
- `/sex man|woman`：更新性别设置（支持输入 男/女，会归一化为 man/woman）
- `取消` 或 `/cancel`：取消待确认操作

### 9.2 二次确认流程
1) 发送写操作命令 → 服务端返回“⚠️ 危险操作检测”与确认码
2) 在有效期内回复：`确认 <确认码>`（或 `/confirm <确认码>`）→ 才执行写操作
3) 确认码不匹配/已过期 → 拒绝执行；需要重新发起命令获取新确认码

### 9.3 开关与有效期
- `CHAT_WRITE_TOOL_ENABLED=0`：关闭写操作命令入口
- `CHAT_WRITE_CONFIRM_TTL_MS`：确认码有效期（默认 5 分钟）
