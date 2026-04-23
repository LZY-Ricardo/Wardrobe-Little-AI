# Clothora

Clothora 是一个面向移动端的智能穿搭系统，提供衣橱管理、衣物 AI 分析、场景推荐、套装库、搭配预览和对话式 AI 助手等能力。

项目采用前后端分离架构：

- 前端：`Vite + React 18 + antd-mobile + react-vant + Zustand`
- 后端：`Koa + mysql2 + JWT`
- AI / 外部能力：`DeepSeek`、`Coze Workflow`、天气服务

## 核心功能

- 用户注册、登录、双 token 刷新
- 虚拟衣橱管理：新增、编辑、删除、收藏、筛选、搜索
- 衣物图片 AI 分析并自动回填表单
- 场景推荐与套装收藏/新建
- 搭配预览生成
- 个人中心资料维护与人物模特上传
- AI 对话助手，支持 SSE 流式输出与工具调用
- 首页天气与推荐信息展示

## 项目结构

```text
.
├─ client/                 # React 前端
│  ├─ src/pages/           # 页面
│  ├─ src/components/      # 组件
│  ├─ src/router/          # 路由
│  ├─ src/store/           # Zustand 状态
│  └─ src/api/             # 请求封装
├─ server/                 # Koa 后端
│  ├─ routes/              # 路由层
│  ├─ controllers/         # 控制器 / 数据访问
│  ├─ middleware/          # 中间件
│  ├─ utils/               # 工具函数
│  ├─ config/              # 配置
│  └─ schema.example.sql   # 示例建表脚本
├─ docs/                   # 归档后的项目文档
├─ openspec/               # OpenSpec 规范与变更提案
└─ bishe/                  # 毕设相关材料
```

## 页面与路由

- `/login`：登录
- `/register`：注册
- `/home`：首页
- `/outfit`：虚拟衣橱
- `/add`：新增衣物
- `/update`：编辑衣物
- `/match`：搭配中心，包含场景推荐与套装合集入口
- `/suits/create`：新建套装
- `/person`：个人中心
- `/aichat`：AI 对话

## 快速开始

### 1. 安装依赖

```bash
cd server
npm install

cd ../client
npm install
```

### 2. 准备数据库

项目默认使用 MySQL。可先执行示例脚本初始化核心表：

```bash
# 使用你自己的 MySQL 客户端执行
server/schema.example.sql
```

### 3. 配置环境变量

后端配置文件默认从 `server/.env` 读取环境变量。至少需要补齐数据库和 AI 服务配置。

可参考下面的最小配置：

```env
# server/.env
PORT=3000

DB_HOST=localhost
DB_PORT=3306
DB_USER=root
DB_PASSWORD=your_password
DB_NAME=aiclothes_db

JWT_SECRET=replace_me

DEEPSEEK_API_KEY=your_deepseek_api_key
DEEPSEEK_BASE_URL=https://api.deepseek.com
DEEPSEEK_CHAT_MODEL=deepseek-chat

COZE_PAT_TOKEN=your_coze_pat
COZE_WORKFLOW_ID=your_workflow_id
COZE_WORKFLOW2_ID=your_workflow2_id
```

前端可选配置：

```env
# client/.env
VITE_API_BASE_URL=http://localhost:3000
```

### 4. 启动项目

先启动后端：

```bash
cd server
npm run dev
```

再启动前端：

```bash
cd client
npm run dev
```

默认情况下：

- 后端运行在 `http://localhost:3000`
- 前端运行在 Vite 默认地址，例如 `http://localhost:5173`

## 常用命令

前端：

```bash
cd client
npm run dev
npm run build
npm run preview
npm run lint
```

后端：

```bash
cd server
npm run dev
```

## 外部依赖说明

- `Coze Workflow`：用于衣物分析和搭配预览，未配置时相关能力不可用。
- `DeepSeek`：用于场景推荐和 AI 对话，未配置时推荐/聊天能力不可用或会降级。
- `天气服务`：用于首页天气展示。
- `MySQL`：为核心业务数据存储。

## 当前实现边界

- 用户头像和人物模特当前仍以 Base64 形式存储在数据库中。
- 后端已提供限流、日志、统一错误处理等基础稳定性能力，但目前仍以开发环境为主。
- 项目暂无完整自动化测试，当前以 `client` 侧 `npm run lint` 和手工冒烟为主。

## 文档索引

- `docs/status/`：前后端现状快照
- `docs/plans/`：产品和页面演进方案
- `docs/architecture/`：关键实现说明
- `docs/frontend/`：前端局部说明
- `openspec/`：规范化变更提案与规格

## 开发说明

- 前端请求基地址由 `VITE_API_BASE_URL` 控制，默认回落到 `http://localhost:3000`
- 后端监听端口由 `PORT` 控制，默认 `3000`
- 若需要补充数据库表结构，可从 `server/schema.example.sql` 开始扩展
- 若你要调整大功能或架构，先阅读 `openspec/AGENTS.md`
