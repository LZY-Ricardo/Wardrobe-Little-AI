<!-- OPENSPEC:START -->
# OpenSpec Instructions

These instructions are for AI assistants working in this project.

Always open `@/openspec/AGENTS.md` when the request:
- Mentions planning or proposals (words like proposal, spec, change, plan)
- Introduces new capabilities, breaking changes, architecture shifts, or big performance/security work
- Sounds ambiguous and you need the authoritative spec before coding

Use `@/openspec/AGENTS.md` to learn:
- How to create and apply change proposals
- Spec format and conventions
- Project structure and guidelines

Keep this managed block so 'openspec update' can refresh the instructions.

<!-- OPENSPEC:END -->

﻿# Repository Guidelines / 仓库贡献指南

## Project Structure & Module Organization / 项目结构与模块
- Frontend: `client` (Vite + React SPA); assets `client/src/assets`, pages `client/src/pages`, shared UI `client/src/components`, routing `client/src/router`, state `client/src/store`, utilities `client/src/utils`. 前端：同路径存放资源、页面、组件、路由、状态与工具函数。
- Backend: `server` (Koa); entry `server/app.js`, routes `server/routes`, controllers `server/controllers`, data access `server/models`, helpers `server/utils`, config `server/config`, static `server/public`. 后端：保持路由-控制器-模型分层。
- Group new features by domain (page + API + util) and exclude `node_modules`, `dist`, `.vite` 等构建产物。

## Build, Test, and Development Commands / 构建与开发命令
- Frontend: `cd client && npm install`（首次），`npm run dev`（开发），`npm run build`（生产构建），`npm run preview`（预览构建），`npm run lint`（ESLint）。
- Backend: `cd server && npm install`，`npm run dev`（nodemon + Koa）。启动前准备 `.env`（DB、JWT、第三方键）。
- Run FE/BE dev servers in parallel; align API base URL with frontend env 配置。

## Coding Style & Naming Conventions / 代码风格与命名
- JavaScript/JSX + ESLint recommended + React Hooks/Refresh；`no-unused-vars` 允许 `^[A-Z_]` 常量。保持 ES Modules。
- React 组件优先函数式；组件/页面用 PascalCase，变量与函数用 camelCase，配置常量与环境变量用 UPPER_SNAKE_CASE。
- 样式用 `.less`，可在 `client/src/index.less` 或组件同目录；勿在 `dist`/`public` 里直接改代码。

## Testing Guidelines / 测试规范
- 目前无自动化测试；合并前至少跑 `npm run lint`（前端）并手工冒烟核心流程。
- 新增测试时与源码同域放置 `*.test.js|jsx`，尽量 mock 外部 API，覆盖错误分支并记录新增命令。

## Commit & Pull Request Guidelines / 提交与 PR 规范
- 提交信息保持简洁祈使语；若无团队规定，推荐 Conventional Commits（如 `feat: ...`）。每次提交聚焦单一变更。
- PR 需总结改动范围、关联 Issue、列出执行的命令与结果；UI 变更附截图/录屏，API 变更同步更新前后端使用方。

## Security & Configuration Tips / 安全与配置
- 机密放置 `server/.env`，勿提交；新增键时提供 `.env.example`。
- 控制器应校验输入，数据库操作用 `mysql2` 参数化，`@koa/multer` 上传需检查类型/大小并做清理。
