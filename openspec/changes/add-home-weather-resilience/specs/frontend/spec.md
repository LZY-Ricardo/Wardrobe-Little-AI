## ADDED Requirements

### Requirement: Home 天气数据获取与降级
Home 页 MUST 通过后端天气接口 `/api/weather?city=...` 获取数据，接口不可用/超时 MUST 依次回退到缓存与本地配置兜底，避免白屏。
#### Scenario: 接口可用
- **WHEN** 后端接口按城市返回天气数据
- **THEN** 更新 weather store，source=live，写入 localStorage 并记录 lastUpdated
#### Scenario: 接口失败或超时
- **WHEN** 请求返回错误或超时
- **THEN** 若存在未过期缓存则展示缓存并标记 source=cache，否则使用配置兜底数据并标记 source=config，同时暴露错误状态供 UI 提示

### Requirement: 天气缓存与 TTL
天气数据 MUST 缓存到 localStorage 并设置可配置 TTL（默认 30-60 分钟），刷新时优先渲染可用缓存，再异步请求最新数据。
#### Scenario: 启动使用缓存
- **WHEN** 应用启动且缓存未过期
- **THEN** 直接渲染缓存数据，后台并行请求最新数据，成功后覆盖并刷新 lastUpdated
#### Scenario: 缓存过期
- **WHEN** 缓存过期或缺失
- **THEN** 直接发起实时请求，失败时回退配置兜底，缓存不再被视为可用

### Requirement: 城市偏好与刷新控制
Home 页 MUST 使用用户选择的城市作为天气查询参数，并持久化；城市切换或手动刷新 SHOULD 去抖以避免过多请求。
#### Scenario: 城市持久化
- **WHEN** 用户选择或更新城市
- **THEN** 写入 store 与 localStorage，后续请求使用该城市作为默认参数
#### Scenario: 城市切换去抖刷新
- **WHEN** 用户快速切换城市
- **THEN** 去抖后仅发起一次天气请求，保持最新一次选择

### Requirement: UI 状态与重试
Home 页 MUST 为天气模块提供 Skeleton/Loading、ErrorBanner+重试、缓存来源标识，并允许手动刷新。
#### Scenario: 加载与骨架
- **WHEN** 初始加载或刷新天气
- **THEN** 展示骨架/Loading，占位不为空白
#### Scenario: 错误与兜底提示
- **WHEN** 天气接口失败且使用缓存或配置兜底
- **THEN** 展示错误提示与重试按钮，并标记当前数据来源（live/cache/config）
#### Scenario: 手动刷新
- **WHEN** 用户点击刷新
- **THEN** 立即发起新请求，状态回到 loading，成功后更新数据，失败遵循降级与提示规则