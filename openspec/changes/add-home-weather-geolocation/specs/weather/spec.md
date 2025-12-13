## ADDED Requirements

### Requirement: Home 登录态首次定位
用户在登录态首次进入 Home 页时，客户端 SHOULD 请求浏览器定位权限；成功后 MUST 使用获取到的经纬度用于天气查询；失败/拒绝时 MUST 自动降级为默认天气，且不得阻断页面主流程。

#### Scenario: 首次进入且允许定位
- **WHEN** 用户处于登录态，首次进入 Home 且浏览器允许定位
- **THEN** 客户端获取经纬度并在本次会话缓存，随后调用 `/weather/today` 携带 `lat`/`lon` 更新 UI

#### Scenario: 拒绝定位或不可用
- **WHEN** 用户拒绝定位、定位超时、或浏览器不支持/处于非安全上下文
- **THEN** 客户端不应抛出未处理异常，继续使用默认天气展示，并避免重复触发定位弹窗

### Requirement: 天气接口坐标参数
后端 `/weather/today` MUST 支持可选查询参数 `lat` 与 `lon`；当参数合法时 MUST 按坐标查询天气；当参数非法时 MUST 忽略坐标并使用默认配置；任意情况下 MUST 返回 `code=1` 且提供兜底数据以保证前端稳定。

#### Scenario: 坐标合法
- **WHEN** 请求携带合法 `lat`/`lon`（范围：lat ∈ [-90, 90]，lon ∈ [-180, 180]）
- **THEN** 后端按坐标查询并返回对应天气数据，`source` 标记为真实数据源

#### Scenario: 坐标非法
- **WHEN** 请求携带非法或缺失的 `lat`/`lon`
- **THEN** 后端忽略坐标并返回默认天气数据，不应返回 4xx 导致前端误报网络异常

### Requirement: 隐私与缓存
客户端定位结果 MUST 仅用于天气查询；MUST 不写入服务端数据库；客户端 SHOULD 以会话级缓存（sessionStorage）减少重复授权弹窗；后端缓存 MUST 按坐标分桶避免数据串用。

#### Scenario: 会话级缓存
- **WHEN** 本次会话已获取定位坐标
- **THEN** 后续进入 Home 不应再次触发浏览器授权弹窗，直接复用缓存坐标刷新天气
