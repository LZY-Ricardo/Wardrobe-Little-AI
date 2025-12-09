# Change: Home 天气获取与降级能力

## Why
- Home 天气缺少稳定数据源与降级策略，接口不可用或弱网时易空白或报错，影响核心信息展示。
- 当前无城市偏好与缓存机制，重复请求浪费资源，用户刷新后数据丢失。

## What Changes
- 数据源与安全：前端调用后端天气代理 `/api/weather?city=...`，避免暴露第三方 key；接口缺席时使用本地配置兜底。
- 缓存与降级：store+localStorage 缓存天气数据，TTL 30-60 分钟；拉取顺序 live→cache→config，失败不白屏并标记来源。
- 城市偏好：使用用户选择城市，持久化；可选后端 IP 定位；城市切换去抖触发刷新。
- UI 状态：Skeleton/Loading、ErrorBanner+重试、缓存标签、手动刷新按钮，保证可用反馈。

## Impact
- 受影响 specs：frontend。
- 受影响代码：Home 页天气组件/卡片、weather store 与缓存、配置兜底文件、天气 API 调用封装。
- 依赖/约束：推荐后端提供 `/api/weather` 代理；如缺失需提前放置本地配置数据；弱网需设置请求超时与重试间隔。