# Change: 为 unified-agent 增加天气预报工具

## Why
- 当前项目已有天气服务，但仅供 Home 页面按坐标读取当天天气，unified-agent 无法复用该能力。
- 用户在 Agent 中提出“某城市某天的天气如何”“根据明天天气给穿搭建议”时，模型当前只能口头兜底，不能读取真实天气数据。

## What Changes
- 后端天气能力从“当前天气”扩展为“按城市/坐标 + 日期查询天气预报”，保留 `/weather/today` 兼容行为，并新增 `/weather/forecast`。
- unified-agent 新增只读天气工具 `get_weather_forecast`，支持 `city`、`date`、`lat`、`lon` 参数，由 LLM 自主决定是否调用。
- 天气工具结果统一返回城市、日期、天气现象、温度范围、体感范围、数据源与更新时间，供 Agent 后续组织自然语言回答。

## Impact
- 受影响 specs：`weather`、`unified-agent`
- 受影响代码：
  - 后端天气：`server/controllers/weather.js`、`server/routes/weather.js`
  - Agent 工具：`server/agent/tools/registry/catalog.js`、`server/agent/tools/registry/handlerResolver.js`
  - Agent handler：`server/agent/tools/handlers/weather/readTools.js`
  - 测试：天气 controller、tool catalog/handler、unified-agent integration
