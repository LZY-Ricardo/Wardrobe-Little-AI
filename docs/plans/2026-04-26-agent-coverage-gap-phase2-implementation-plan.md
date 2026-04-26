# Agent Coverage Gap Phase 2 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 补齐 Clothora 当前“用户手动可做，但 unified-agent 仍未覆盖”的核心操作，让 Agent 更接近“全项目操作层”，优先完成衣物图片更新、衣橱导入导出、个人资料维护和穿搭记录编辑。

**Architecture:** 继续沿用现有 `tool catalog -> tool handlers -> confirmationService -> unifiedAgentRuntime` 受控编排架构，不新增绕开业务 controller 的自由写库路径。所有新增能力优先复用现有页面/API 的真实执行层，只把缺失动作补成标准化工具、确认描述和前端上下文入口。

**Tech Stack:** React 18 + Vite + antd-mobile + Zustand；Koa + mysql2 + DeepSeek + unified-agent SSE；OpenSpec changes；Node `node:test`。

---

## Why This Plan Exists

当前 Agent 已覆盖衣橱主链路、场景推荐、套装保存、穿搭记录创建、反馈、天气、画像和图片分析，但与“所有手动操作都能被文字或图片替代”的目标相比，仍有明确差集：

1. 用户可手动更新衣物图片，但 Agent 目前只能改字段，不能改图片。
2. 用户可手动导入/导出衣橱，但 Agent 没有资产备份恢复能力。
3. 用户可手动维护头像、人物模特、昵称、密码，但 Agent 未接入。
4. 后端已支持穿搭记录更新，但 Agent 只有创建/删除，没有编辑。

---

## Scope

### In Scope
- Agent 更新衣物图片与基础字段
- Agent 触发衣橱导出与 JSON 导入
- Agent 维护昵称、头像、人物模特、性别、确认偏好
- Agent 支持穿搭记录编辑
- 对应 confirmation、result presenter、附件展示与 page context 入口补齐
- 关键集成测试与手工验收清单

### Out of Scope
- 登录/注册流程 Agent 化
- 密码明文回显、自动读取旧密码等高风险交互
- 套装编辑/重命名
- 推荐算法升级
- 通用浏览器自动化 Agent

### Risk Notes
- `updatePassword` 需要显式收集旧密码与新密码，不能从历史消息猜测。
- 导入/导出涉及较大 payload，不能直接把整包数据塞进普通消息正文，需要走附件或系统返回下载结果。
- 人物模特/头像/衣物图片都涉及 base64 图片，必须复用现有压缩/大小限制，不允许直接放大写入面。

---

## Gap Matrix

| 功能 | 手动现状 | Agent 现状 | 结论 |
|---|---|---|---|
| 衣物基础字段更新 | 已支持 | 已支持 | 已覆盖 |
| 衣物图片更新 | 已支持 | 未支持 | 高优先级缺口 |
| 衣橱导出 | 已支持 | 未支持 | 高优先级缺口 |
| 衣橱导入 | 已支持 | 未支持 | 高优先级缺口 |
| 套装保存/删除 | 已支持 | 已支持 | 已覆盖 |
| 穿搭记录创建/删除 | 已支持 | 已支持 | 已覆盖 |
| 穿搭记录编辑 | 后端支持 | 未支持 | 中优先级缺口 |
| 昵称更新 | 已支持 | 未支持 | 高优先级缺口 |
| 性别更新 | 已支持 | 已支持 | 已覆盖 |
| 头像上传 | 已支持 | 未支持 | 高优先级缺口 |
| 人物模特上传/删除 | 已支持 | 未支持 | 高优先级缺口 |
| 确认偏好更新 | 已支持 | 已支持 | 已覆盖 |
| 密码修改 | 已支持 | 未支持 | 中高优先级缺口 |

---

## Recommended Change Split

不要把这批内容一次塞进一个大 change。推荐拆成 3 个独立 change：

1. `add-agent-profile-and-model-ops`
2. `add-agent-wardrobe-backup-and-image-update`
3. `add-agent-outfit-log-editing`

这样每条 change 都能独立评审、独立验收，也更符合 OpenSpec 的粒度控制。

---

## File Map

### Backend
- Modify: `server/agent/tools/registry/catalog.js`
- Modify: `server/controllers/confirmationService.js`
- Modify: `server/controllers/unifiedAgentRuntime.js`
- Modify: `server/controllers/unifiedAgent.helpers.js`
- Modify: `server/controllers/unifiedAgentAttachments.js`
- Modify: `server/controllers/legacyTaskFallbackService.js`
- Modify: `server/agent/tools/runtime/resultPresenterResolver.js`
- Modify: `server/agent/tools/runtime/confirmationDescriptorResolver.js`
- Modify: `server/agent/tools/runtime/autonomousToolRuntime.js`
- Create: `server/agent/tools/handlers/profile/writeTools.js` or extend existing profile write handlers
- Create: `server/agent/tools/handlers/wardrobe/writeTools.js` additions for image update / import / export
- Create: `server/agent/tools/handlers/outfitLogs/writeTools.js` additions for log update
- Modify: `server/routes/clothes.js`
- Modify: `server/routes/user.js`
- Modify: `server/routes/outfitLogs.js`
- Test: `server/tests/unifiedAgent.integration.test.js`
- Test: `server/tests/agentWorkflow.integration.test.js`
- Test: `server/tests/confirmationService.test.js`
- Test: `server/tests/toolRegistry.catalog.test.js`

### Frontend
- Modify: `client/src/pages/AiChat/useAgentStreamSession.js`
- Modify: `client/src/pages/AiChat/viewModels.js`
- Modify: `client/src/pages/Outfit/index.jsx`
- Modify: `client/src/pages/Update/index.jsx`
- Modify: `client/src/pages/Person/index.jsx`
- Modify: `client/src/pages/OutfitLogs/index.jsx`
- Modify: `client/src/utils/agentContext.js`

### Docs / Specs
- Create: `openspec/changes/add-agent-profile-and-model-ops/*`
- Create: `openspec/changes/add-agent-wardrobe-backup-and-image-update/*`
- Create: `openspec/changes/add-agent-outfit-log-editing/*`

---

## Delivery Order

### Phase A: 衣物图片更新 + 衣橱导入导出
这是最该先做的一批，因为它直接补“衣橱资产操作层”的核心缺口。

### Phase B: 个人资料与人物模特操作
这批是用户明确可见的资料维护能力，适合作为第二阶段。

### Phase C: 穿搭记录编辑
这是业务完整性增强，但优先级低于前两批。

### Phase D: 密码修改
这批需要更谨慎的澄清和确认交互，可以单独压后处理。

---

## Task 1: Spec and Contract Alignment

**Files:**
- Create: `openspec/changes/add-agent-profile-and-model-ops/proposal.md`
- Create: `openspec/changes/add-agent-profile-and-model-ops/tasks.md`
- Create: `openspec/changes/add-agent-wardrobe-backup-and-image-update/proposal.md`
- Create: `openspec/changes/add-agent-wardrobe-backup-and-image-update/tasks.md`
- Create: `openspec/changes/add-agent-outfit-log-editing/proposal.md`
- Create: `openspec/changes/add-agent-outfit-log-editing/tasks.md`

- [ ] Step 1: 为三批能力分别定义 change scope，不混写成单一大 proposal。
- [ ] Step 2: 明确哪些能力是新增工具，哪些只是给现有工具补能力。
- [ ] Step 3: 在 proposal 里写清楚所有写操作仍走二次确认，只有低风险动作才允许受偏好控制。
- [ ] Step 4: 运行 `openspec validate <change-id> --strict`，保证 proposal 可用后再进入实现。

---

## Task 2: Add Wardrobe Asset Tools

**Files:**
- Modify: `server/agent/tools/registry/catalog.js`
- Modify: `server/agent/tools/runtime/resultPresenterResolver.js`
- Modify: `server/agent/tools/runtime/confirmationDescriptorResolver.js`
- Modify: `server/controllers/confirmationService.js`
- Modify: `server/controllers/legacyTaskFallbackService.js`

- [ ] Step 1: 新增 `export_closet_data` 读工具，返回导出结果摘要与可下载附件元数据。
- [ ] Step 2: 新增 `import_closet_data` 写工具，接收 JSON 数据并走确认后导入。
- [ ] Step 3: 为 `update_cloth_fields` 扩展图片更新能力，或新增 `update_cloth_image` 专用工具。
- [ ] Step 4: 明确导入、图片更新的确认文案、payload 裁剪和结果摘要格式。
- [ ] Step 5: 保证导出不把超大 base64 直接灌进聊天消息正文。

**Decision Note:** 更推荐新增 `update_cloth_image`，而不是让 `update_cloth_fields` 同时承担文本字段与图片变更。这样职责更清晰，确认卡也更容易解释。

---

## Task 3: Implement Wardrobe Asset Handlers

**Files:**
- Modify: `server/routes/clothes.js`
- Create or Modify: `server/agent/tools/handlers/wardrobe/writeTools.js`
- Modify: `server/controllers/unifiedAgentAttachments.js`
- Modify: `server/controllers/unifiedAgentRuntime.js`

- [ ] Step 1: 复用 `/clothes/export` 与 `/clothes/import` 的现有校验逻辑，不复制第二套规则。
- [ ] Step 2: 复用 Update 页已有图片压缩/大小限制语义，确保 Agent 更新图片时和页面一致。
- [ ] Step 3: 导出结果支持在聊天中生成“已准备好下载”的任务结果，而不是返回一大段 JSON。
- [ ] Step 4: 导入结果支持返回 `inserted/total` 摘要，并刷新衣橱相关上下文。
- [ ] Step 5: 图片更新完成后让 `latestTask`、附件和返回导航都能定位到更新后的衣物。

---

## Task 4: Add Profile and Model Tools

**Files:**
- Modify: `server/agent/tools/registry/catalog.js`
- Create or Modify: `server/agent/tools/handlers/profile/writeTools.js`
- Modify: `server/controllers/confirmationService.js`
- Modify: `server/controllers/legacyTaskFallbackService.js`

- [ ] Step 1: 新增 `update_user_name` 写工具。
- [ ] Step 2: 新增 `upload_user_avatar` 写工具。
- [ ] Step 3: 新增 `upload_character_model` 与 `delete_character_model` 写工具。
- [ ] Step 4: 保持 `update_user_sex`、`update_confirmation_preferences` 与新工具的确认策略一致。
- [ ] Step 5: 单独定义 `update_password` 工具契约，要求必须显式提供旧密码和新密码，不允许模型自行补全。

**Decision Note:** `update_password` 需要单独 change 或至少单独任务验收，因为它的输入、确认提示和失败语义与一般资料修改不同。

---

## Task 5: Wire Profile Page Contexts

**Files:**
- Modify: `client/src/pages/Person/index.jsx`
- Modify: `client/src/utils/agentContext.js`
- Modify: `client/src/pages/AiChat/viewModels.js`

- [ ] Step 1: 从 Person 页把“昵称/头像/人物模特/性别/偏好”的当前状态打包进 `agentContext`。
- [ ] Step 2: 为上传头像、上传人物模特这类动作设计带图片附件的进入方式。
- [ ] Step 3: 确认卡要能展示即将替换的资料类型，而不是只显示模糊的“用户信息更新”。
- [ ] Step 4: 对密码修改保持显式澄清，不通过页面快捷入口预填敏感值。

---

## Task 6: Add Outfit Log Editing

**Files:**
- Modify: `server/agent/tools/registry/catalog.js`
- Create or Modify: `server/agent/tools/handlers/outfitLogs/writeTools.js`
- Modify: `server/controllers/confirmationService.js`
- Modify: `client/src/pages/OutfitLogs/index.jsx`

- [ ] Step 1: 新增 `update_outfit_log` 写工具，支持日期、场景、天气、满意度、备注、单品列表更新。
- [ ] Step 2: 复用现有 `/outfit-logs/:id` 更新接口的真实字段约束。
- [ ] Step 3: 从 OutfitLogs 页把某条记录 focus 送入 Agent，支持“帮我把这条记录改成通勤/补充备注/换成这两件”。
- [ ] Step 4: 更新后回写 `latestTask` 和返回导航，保证用户能回到刚编辑的记录。

---

## Task 7: Test Expansion

**Files:**
- Modify: `server/tests/unifiedAgent.integration.test.js`
- Modify: `server/tests/agentWorkflow.integration.test.js`
- Modify: `server/tests/confirmationService.test.js`
- Modify: `server/tests/toolRegistry.catalog.test.js`

- [ ] Step 1: 为衣物图片更新补集成测试，验证确认前后 payload 与结果摘要。
- [ ] Step 2: 为衣橱导入/导出补测试，验证大 payload 不会污染消息内容。
- [ ] Step 3: 为头像/人物模特操作补测试，验证图片缺失、格式错误、超限时的失败语义。
- [ ] Step 4: 为穿搭记录编辑补测试，验证部分字段 patch 与单品替换。
- [ ] Step 5: 为密码修改补测试，验证必须显式提供旧密码且失败时不泄漏敏感信息。

---

## Task 8: Manual Verification Checklist

- [ ] Step 1: 从衣橱详情进入 Agent，发送“把这张新图替换成这件衣服的图片”，确认后成功更新。
- [ ] Step 2: 在 unified-agent 中请求“帮我导出衣橱”，得到可用下载结果。
- [ ] Step 3: 在 unified-agent 中上传或粘贴导入 JSON，确认后正确写入衣橱。
- [ ] Step 4: 在 Person 页进入 Agent，请求“把这个人物模特设为我的默认模特”，确认后成功更新。
- [ ] Step 5: 在 Person 页进入 Agent，请求“帮我改昵称为 xxx”，确认后成功更新。
- [ ] Step 6: 在 OutfitLogs 页进入 Agent，请求“把这条记录改成通勤并补一句备注”，确认后成功更新。
- [ ] Step 7: 验证所有新增写操作都有正确的取消、确认和失败回退。

---

## Acceptance Criteria

1. 用户当前能手动完成的高价值资料/资产操作，Agent 至少覆盖 80%。
2. 所有新增写操作默认二次确认。
3. 图片类写操作遵守现有大小与格式限制。
4. 聊天消息中不直接泄漏超大 base64 或敏感字段。
5. 至少一组后端集成测试覆盖每个新增工具族。

---

## Suggested Execution Sequence

1. `add-agent-wardrobe-backup-and-image-update`
2. `add-agent-profile-and-model-ops`
3. `add-agent-outfit-log-editing`
4. `update-password` 视风险单独收尾

---

## Notes for This Session

- 当前 `openspec list --specs` 为空，说明仓库仍未把已建能力归档进 spec 真值层；实现前不要盲信历史 change 的任务勾选状态。
- 这份计划优先服务“补覆盖面”，不是继续扩展自由自治能力。
- 如果要进一步追求“全站任意页面都可 Agent 接管”，下一阶段应补“统一资产附件协议 + 下载型任务结果协议”。
