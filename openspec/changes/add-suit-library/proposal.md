# Change: 新增套装库（收藏/自定义）与展示页

## Why
当前系统缺少“套装”的持久化收集与展示能力：推荐页生成的套装只能临时展示，爱心收藏实际是批量收藏单品，无法沉淀为用户可复用的“套装库”；同时也缺少用户自定义套装的入口与页面。

## What Changes
- 新增“套装库”能力：用户可将推荐套装一键加入套装库，并在套装库列表中查看与删除。
- 新增“自定义套装”能力：用户可从衣橱单品中选择若干件创建套装（名称/场景/备注可选）。
- 推荐页爱心按钮语义调整：从“收藏单品”改为“收藏套装到套装库”（单品收藏仍保留在衣橱/单品维度，不与套装收藏混用）。
- 后端新增套装库 API；前端新增套装库列表页与创建页，并在推荐页接入收藏套装逻辑。

## Impact
- Affected specs: `suit-library`
- Affected code:
  - Frontend: `client/src/pages/Recommend/*`, 新增 `client/src/pages/Suits/*`, 新增 `client/src/pages/SuitCreate/*`, 路由 `client/src/router/index.jsx`
  - Backend: 新增 `server/routes/suits.js`, 新增 `server/controllers/suits.js`, `server/app.js`
  - Database: 需要新增 `suits` 与 `suit_items` 表（见 design.md）

## Non-Goals
- 套装分享/公开广场、套装评分、自动穿搭评分
- 套装内单品的自动替换/相似推荐
- 套装编辑（MVP 先做创建/列表/删除；后续如需再加更新接口）

