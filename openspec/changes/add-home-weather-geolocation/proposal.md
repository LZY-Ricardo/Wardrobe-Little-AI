# Change: Home 基于定位的天气展示

## Why
- 当前 Home 天气默认使用固定城市/坐标，无法反映用户真实所在地区。
- 浏览器原生支持定位（Geolocation API），在用户授权后可显著提升天气准确性与体验。

## What Changes
- 前端：用户处于登录态且首次进入 Home 时，自动触发定位权限请求；获取到经纬度后在本次会话内缓存，并用于后续天气请求。
- 后端：`/weather/today` 支持可选 `lat`/`lon` 查询参数；传参时按坐标请求真实天气数据，失败时回退到默认兜底并保持接口可用。
- 兼容与降级：不支持定位 / 权限拒绝 / 非安全上下文（非 HTTPS 且非 localhost）时，直接使用默认天气，不阻断页面功能。
- 隐私：经纬度不写入数据库、不记录到服务端持久存储；前端仅使用会话级缓存减少重复弹窗。

## Impact
- 受影响 specs：weather。
- 受影响代码：
  - 前端：`client/src/pages/Home/index.jsx`（定位请求 + 带参拉取天气）
  - 后端：`server/routes/weather.js`、`server/controllers/weather.js`（坐标参数 + 校验 + 缓存）
  - 配置：`server/.env.example`（坐标/缓存/开关说明）
