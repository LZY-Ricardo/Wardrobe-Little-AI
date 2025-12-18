# Change: 精简底部导航并提升搭配合集页视觉

## Why
当前底部导航包含 6 个入口（首页/衣橱/搭配中心/场景推荐/搭配合集/我的），在移动端可点按区域偏小且信息密度过高；同时“搭配合集”页当前呈现更偏“数据罗列”，缺少更强的杂志感与图片主导的视觉层级。

## What Changes
- 精简底部 Tab：将“场景推荐”“搭配合集”从底部一级 Tab 移入“搭配中心”二级 Tab，底部保持 4 个主入口（首页/衣橱/搭配中心/我的）。
- 搭配中心新增二级 Tab：`搭配预览`（原 Match）、`场景推荐`（原 Recommend）、`搭配合集`（原 Suits）。
- 兼容旧路由：保留 `/recommend` 与 `/suits` 作为别名（重定向到搭配中心二级 Tab），避免历史链接失效。
- 搭配合集页卡片重构：以封面图为主，信息精简（名称/场景/单品缩略图），把详细描述下沉到后续详情页（本次不实现详情页）。
- 创建页体验：在创建套装页隐藏 AI 入口，避免遮挡与留白异常；底部按钮贴近导航栏。

## Impact
- Affected specs: `navigation-ui`
- Affected code:
  - Frontend: `client/src/components/BottomNavigation/*`, `client/src/router/index.jsx`
  - Frontend: 新增 `client/src/pages/MatchHub/*`，更新 `client/src/pages/Suits/*`，更新 `client/src/pages/SuitCreate/*`

## Non-Goals
- 底部 Tab 视觉皮肤大改（例如完全重写 TabBar 主题）
- 搭配合集详情页与编辑套装（仅做列表卡片优化）

