# Change: 前端 P1 体验与效率增强

## Why
- 缺少全局状态与持久化，token/主题/偏好分散存储，易出现状态不一致与闪屏。
- UI 基础组件缺失，列表搜索/分页、空态/错误体验不统一，加载反馈不足。
- 上传、AiChat 等长链路缺少可靠性保障与降级策略，易在弱网或断流下白屏或重复请求。

## What Changes
- 全局状态：统一使用 zustand 作为轻量 store，集中管理用户/主题/偏好/衣物列表，启动 hydrate，更新时持久化。
- UI 基建：封装 Loading/Empty/ErrorBanner/ConfirmDialog/Skeleton 组件；路由懒加载 fallback 使用骨架屏。
- AiChat 入口：提供全局悬浮入口（聊天页自动隐藏），便于从任意页面快速进入 AI 助手。
- Outfit/Home：搜索输入去抖；分页/无限滚动；空态/错误提示与重试；天气/标签接口或配置驱动、失败降级。
- 深色模式：主题写入 store + localStorage，并同步 html data-theme，刷新后恢复。
- 上传可靠性：文件大小/类型前置校验，压缩参数可配置，上传支持超时/重试/取消，错误有文案。
- AiChat：SSE 断线指数退避重连，提供“停止生成”，错误占位/重试，防重复请求。

## Impact
- 受影响 specs：frontend。
- 受影响代码：前端 store（auth/ui/closet）、路由懒加载与全局 UI 组件、Home/Outfit 列表与搜索、上传工具链、AiChat SSE hook。
- 依赖/约束：SSE 需保持兼容；弱网与移动端性能需关注压缩与重试策略；需确认天气/标签接口或提供配置兜底。
