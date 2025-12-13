# 个人中心（`/person`）三种优化/演进方案

> 适用范围：`client/src/pages/Person/index.jsx`（个人中心/我的页）  
> 目标：把“我的”页从“设置页”升级为“用户资产入口 + 个性化画像输入 + 安全与系统设置中心”，服务智能穿搭的闭环（衣橱 → 搭配 → 预览 → 推荐 → 反馈）。

## 0. 背景与现状

### 0.1 已有能力（当前实现）

- 用户信息：`GET /user/getUserInfo`（`client/src/pages/Person/index.jsx:29`）
- 修改头像：选择图片 → base64 → `POST /user/uploadAvatar`（`client/src/pages/Person/index.jsx:75`）
- 修改昵称：`PUT /user/updateUserName`（`client/src/pages/Person/index.jsx:154`）
- 修改性别：`PUT /user/updateSex`（`client/src/pages/Person/index.jsx:316`）
- 修改密码：`PUT /user/updatePassword`（`client/src/pages/Person/index.jsx:342`）
- 上传“人物模特/全身照”：base64 → `POST /user/uploadPhoto`（`client/src/pages/Person/index.jsx:203`）
- 退出登录：清 token + 跳转 `/login`（`client/src/pages/Person/index.jsx:66`）

### 0.2 与业务链路的关系（为什么个人页重要）

- `/match` 生成搭配预览图依赖：`sex` + `characterModel`（人物模特）  
  - 前端校验：`client/src/pages/Match/index.jsx:78`、`client/src/pages/Match/index.jsx:119`
  - `/match` 会对 `characterModel` 执行 `fetch(characterModel)` 再转成 File 传给后端（`client/src/pages/Match/index.jsx:135`）
- 后端提示也明确了依赖关系：`server/utils/aichatPrompt.js:1`

换句话说：个人页是搭配中心可用性的“前置门槛”，也是推荐质量提升的“输入口”。

### 0.3 现存主要问题（可落地的工程&体验缺口）

**体验/一致性**
- 缺少清晰的加载/错误态：`getUserInfo()` 失败主要 `console.error`，用户无感知（`client/src/pages/Person/index.jsx:29`）。
- 组件库混用：`react-vant`（Dialog/Popup） + `antd-mobile`（Toast），视觉与交互不一致且增加依赖复杂度（`client/src/pages/Person/index.jsx:4`）。

**稳定性/资源**
- 全身照预览使用 `URL.createObjectURL(file)`，未在移除/卸载时 `URL.revokeObjectURL()`，存在内存泄漏风险（`client/src/pages/Person/index.jsx:243` + `client/src/pages/Person/index.jsx:191`）。
- 性别修改采用“先 setSex 再请求”，失败未回滚，可能出现 UI 与后端不一致（`client/src/pages/Person/index.jsx:316`）。

**数据/架构**
- userInfo 持久化逻辑在多个页面重复（Login/Match/Person），并且与 `zustand` 的 `auth-store` 并行存在，容易出现数据源不一致（`client/src/store/index.js:1`）。
- `characterModel`（人物模特/全身照）当前是“base64 字符串写进 DB”（`server/controllers/user.js:94`），会导致：
  - 用户表膨胀（MySQL 行过大/查询慢/备份慢）
  - 每次 `getUserInfo` 把大字段带出来，移动端网络/渲染压力大
  - 上传/预览/刷新策略不清晰（Person 页上传成功后未 `getUserInfo()` 刷新）

---

## 1. 三种方案对比（选型建议）

| 方案 | 核心目标 | 主要收益 | 后端改动 | 数据库改动 | 风险 | 适合阶段 |
|---|---|---|---|---|---|---|
| 方案 A（P0）体验/稳定性/工程收敛 | 修“现在就会踩”的坑，保证功能可靠 | 明显减少线上问题、体验更顺滑、代码可维护 | 可选（很少） | 无 | 低 | 立即做（1~3 天） |
| 方案 B（P1）资产概览 + 穿搭档案 | 让用户“输入画像”，让推荐“解释得通” | 推荐质量与留存提升；我的页成为入口 | 需要（新增接口） | 可能（新增 profile/字段） | 中 | 业务增长期（3~7 天） |
| 方案 C（P2）虚拟形象闭环（落盘 + 管理） | 解决人物模特存 DB 的根问题，形成闭环管理 | 性能/成本大幅改善；/match 更稳定；可扩展多模特 | 需要（上传/删除/迁移） | 建议（新增 URL 字段/表） | 中高 | 技术债治理/规模化（5~10 天） |

选型策略建议：
- 团队资源有限：先做方案 A（P0），立刻把“可用性”做稳。
- 希望提升推荐效果：方案 A + 方案 B 的最小版（先收集档案，不做复杂算法）。
- 需要支撑更多用户/更高频调用 `/match`：尽早上方案 C（P2），否则 DB 会成为瓶颈。

---

## 2. 方案 A（P0）：体验/稳定性/工程收敛（不改变业务形态）

### 2.1 目标（Goals）

- 用户能“看得懂发生了什么”：加载中、成功、失败、下一步提示明确。
- 用户不会“点了没反应”：交互禁用、按钮态、重复提交保护。
- 代码维护成本下降：减少重复逻辑、统一数据源、减少隐性 bug。

### 2.2 非目标（Non-Goals）

- 不新增复杂业务功能（如画像字段、统计面板、虚拟形象管理）。
- 不做大规模 UI 重构（只做必要的一致性与可用性提升）。

### 2.3 具体改动点（建议落地清单）

#### A. 统一“用户信息来源”

现状：Person/Login/Match 都在写 `localStorage.userInfo`（重复且可能不一致）。  
建议：以 `useAuthStore` 为唯一可信源（source of truth），页面只读 store；必要时再持久化一次。

- 新增通用方法：
  - `authStore.refreshUserInfo()`：调用 `GET /user/getUserInfo`，写入 store & localStorage（一次）
  - `authStore.logout()`：清 token、清 userInfo、跳转（或统一由 axios 401 处理）
- Person 页只调用 `refreshUserInfo()`，避免自己写 localStorage。

参考文件：
- `client/src/pages/Person/index.jsx:29`
- `client/src/pages/Match/index.jsx:35`
- `client/src/pages/Login/index.jsx:57`
- `client/src/store/index.js:1`

#### B. 补齐加载/错误态与交互禁用

- `getUserInfo` 拉取期间显示 skeleton 或占位；隐藏/禁用编辑入口（昵称/性别/密码/上传）。
- 所有提交按钮在请求中禁用，避免重复提交。
- 失败提示给出动作建议：重试/去登录。

#### C. 修复资源泄漏与刷新一致性

- `uploadedImage` 是对象 URL：在以下时机 `URL.revokeObjectURL(url)`：
  - 移除预览（`handleRemoveImage`）
  - 组件卸载（`useEffect(() => () => revoke...)`）
- 上传人物模特成功后：调用 `getUserInfo()` 或 `refreshUserInfo()` 同步 `characterModel`，并在页面上展示“已上传/未上传”。

#### D. 输入校验与可用性细节

- 昵称输入：支持 Enter 保存、Esc 取消；保存时 trim，失败保持输入不丢失。
- 修改密码：弱密码提示（长度/复杂度）；提交中禁用；成功后强制重新登录（可选安全策略）。
- 性别选择：失败回滚 UI（先记 oldSex，失败 set 回去）。

#### E. UI 组件库一致性（建议二选一）

现状：Dialog/Popup 来自 `react-vant`，Toast 来自 `antd-mobile`。  
建议：优先统一到 `antd-mobile`（因为底部导航 TabBar 已在用），或全部统一到 `react-vant`（取决于现有页面使用比例）。

### 2.4 验收标准（Acceptance Criteria）

- [ ] 进入个人页：能看到明确的加载占位；接口失败有 Toast + 可重试/引导登录。
- [ ] 头像/模特上传：校验类型/大小；上传中不可重复点击；成功后页面状态立即更新。
- [ ] 性别/昵称/密码修改：失败不会造成 UI 与后端不一致；提交中按钮禁用；成功提示明确。
- [ ] 不出现对象 URL 内存泄漏（有 revoke）。

### 2.5 工作拆解（可直接转迭代任务）

- [ ] 抽离 `refreshUserInfo` 到 `useAuthStore`（或 `client/src/utils` + store）
- [ ] Person 页：接入 store；补齐 loading/error
- [ ] Person 页：修复 `URL.createObjectURL` 生命周期
- [ ] 提交类动作：增加 pending/disabled；性别失败回滚
- [ ] 统一 UI 库（最小改动）

---

## 3. 方案 B（P1）：资产概览 + 穿搭档案（让推荐更“懂你”）

### 3.1 目标（Goals）

- 我的页变成“资产入口”：用户知道自己有什么、能去哪里、最近做了什么。
- 收集“可解释的画像输入”：推荐/搭配能基于用户档案做更准确、更可解释的建议。

### 3.2 典型用户故事（User Stories）

- 作为用户，我想在“我的”里看到：衣物总数/收藏数/最近新增，快速去衣橱/新增衣物。
- 作为用户，我想设置：身高体重/尺码/风格偏好/常用场景，推荐更贴合我。
- 作为用户，我希望系统能解释：为什么给我这套推荐（因为你偏好通勤/你常穿黑白/你身高…）。

### 3.3 UI/信息架构（建议）

个人中心拆成 4 个区块（从上到下）：

1) **身份卡片**：头像、昵称、账号、性别、模特状态（已上传/未上传）  
2) **资产概览**：衣物总数、收藏数、搭配生成次数（可选）  
3) **穿搭档案**：基础信息（身高/体重/尺码）+ 偏好（风格/颜色/场景）  
4) **设置与安全**：改密码、主题、清理缓存、退出登录、反馈

### 3.4 后端与数据模型（建议两条路）

#### 路线 1：在 `user` 表加字段（快速但会变胖）

字段建议（示例）：
- `height_cm` INT
- `weight_kg` INT
- `top_size` VARCHAR(16)
- `bottom_size` VARCHAR(16)
- `shoe_size` VARCHAR(16)
- `style_preferences` JSON 或 TEXT（存数组：`["通勤","休闲"]`）
- `color_preferences` JSON 或 TEXT
- `scene_preferences` JSON 或 TEXT

优点：改动少，上线快。  
缺点：表越来越胖，后续扩展困难。

#### 路线 2：新增 `user_profile` 表（推荐，结构更清晰）

示例：
- `user_profile(user_id PK, height_cm, weight_kg, top_size, bottom_size, shoe_size, preferences_json, updated_at)`

优点：扩展更好、避免 user 表过大。  
缺点：需要多一次 join/查询封装。

> 重要：任何数据库结构变更属于高风险操作，需要评估线上数据与迁移方案；本方案仅提出设计，不直接执行。

### 3.5 API 契约（建议）

- `GET /user/stats`
  - 返回：`{ clothesCount, favoriteCount, lastUploadAt, ... }`
- `GET /user/profile`
  - 返回：档案字段（含 preferences）
- `PUT /user/profile`
  - 入参：档案字段（后端需校验范围/类型）
- （可选）`GET /user/activity`
  - 返回最近行为：新增衣物/生成搭配/收藏变化（先不做也行）

### 3.6 验收标准（Acceptance Criteria）

- [ ] 个人页展示资产概览卡片，点击能跳转到对应页面（`/outfit`、`/add`、`/match` 等）。
- [ ] 档案可编辑、可保存、可回显；异常时不丢数据。
- [ ] 推荐/搭配页面能读取档案（先只读不强依赖），为未来算法升级留接口。

### 3.7 工作拆解（可直接转迭代任务）

- [ ] 明确数据模型：user 表字段 vs 新表 user_profile
- [ ] 后端新增 stats/profile 接口 + 参数校验
- [ ] 前端个人页新增资产概览/档案编辑区块
- [ ] 在推荐/搭配链路中接入档案（只读）

---

## 4. 方案 C（P2）：虚拟形象闭环（人物模特落盘 + 管理）

### 4.1 现状问题（根因）

- 当前“全身照/人物模特”上传接口把 base64 直接写入 `user.characterModel`：
  - `server/controllers/user.js:94`
  - `server/routes/user.js:151`
- 结果是：DB 存大字段，`getUserInfo` 每次都带出大数据；移动端体验与服务器成本都会持续恶化。

### 4.2 目标（Goals）

- 人物模特像头像一样：**落盘存文件 + DB 存相对路径**（与头像实现一致，参考 `server/routes/user.js:235`）。
- 提供“管理能力”：查看当前模特、重新上传、删除/清理、上传状态提示。
- 保持 `/match` 兼容：`characterModel` 仍是可 fetch 的 URL（data URL 或 http URL 都可）。

### 4.3 改造方向（推荐实现）

#### A. 存储结构（建议）

- 目录：`server/public/uploads/models/<userId>/model-<timestamp>.<ext>`
- DB：新增字段 `characterModelUrl`（或沿用 `characterModel` 但改存 URL）
  - 推荐：新增 `characterModelUrl`，并逐步迁移老数据，风险更可控。

#### B. API 设计（建议）

- `POST /user/uploadCharacterModel`
  - 方式 1：与头像一致（base64 data url）
  - 方式 2：multipart（更省内存，推荐）
- `DELETE /user/characterModel`
  - 删除当前模特文件 + 清空 DB 字段
- `GET /user/getUserInfo`
  - 返回 `characterModel`（兼容字段）以及 `hasCharacterModel`

#### C. 安全与限制

- 类型：仅允许 `jpeg/jpg/png/webp`
- 大小：建议 <= 5MB（与当前限制一致）
- 清理：替换时删除旧文件（参考头像上传对旧头像做清理的逻辑）
- 审计：记录更新时间、来源（可选）

### 4.4 前端改造点（Person 页）

- 显示“人物模特”状态：
  - 未上传：提示“上传用于搭配预览”
  - 已上传：展示缩略图 + “重新上传/删除”
- 上传完成后刷新 userInfo（避免 Match 仍拿到旧数据）
- 为上传提供更明确的引导文案：解释用途（搭配预览生成）

### 4.5 对 `/match` 的影响（兼容策略）

`client/src/pages/Match/index.jsx:135` 会 `fetch(characterModel)` 并转 Blob。  
兼容策略：
- 如果仍返回 data URL：仍可 fetch（浏览器支持 data URL fetch）
- 如果返回静态资源 URL：同样可 fetch，且更快

建议逐步过渡：
1) 后端新增 `characterModelUrl` 并优先返回 URL  
2) 老数据（base64）逐步迁移/清理（可选后台脚本或用户重新上传触发）

### 4.6 验收标准（Acceptance Criteria）

- [ ] 上传人物模特后，DB 不再存 base64（或至少支持 URL 方案）。
- [ ] 个人页可查看/替换/删除人物模特，状态清晰。
- [ ] `/match` 生成预览流程不受影响，且加载更快、更稳定。

### 4.7 风险与回滚

- 数据库字段变更（高风险）：需要迁移方案、灰度、回滚策略。
- 文件存储清理：避免磁盘无限增长；需要“替换删除旧文件”策略。
- 回滚策略：保留旧接口/旧字段一段时间；前端优先使用新字段但兼容旧字段。

---

## 5. 推荐落地路线（按投入产出）

### 路线 R1（最稳）：先 P0，再 P1

- 第 1 迭代：方案 A（P0）把个人页做“稳定可用”（1~3 天）
- 第 2 迭代：方案 B（P1）上“资产概览 + 档案”（3~7 天）

### 路线 R2（技术债优先）：P0 + P2 并行

- 先解决 DB 存 base64 的根问题（方案 C），避免后续越拖越难
- 适合：已经出现接口慢/DB 压力/移动端卡顿

---

## 6. 附录：关键文件索引

- 前端个人页：`client/src/pages/Person/index.jsx`
- 个人页样式：`client/src/pages/Person/index.module.less`
- 搭配中心依赖：`client/src/pages/Match/index.jsx`
- 头像上传（落盘参考实现）：`server/routes/user.js:235`
- 人物模特上传（当前 base64 入库）：`server/routes/user.js:151`、`server/controllers/user.js:94`
- 全局 store：`client/src/store/index.js`
