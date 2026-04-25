## 1. Spec
- [x] 1.1 为 `weather` 补充“按城市或坐标读取指定日期天气预报”的 spec delta
- [x] 1.2 为 `unified-agent` 补充“Agent 可调用天气只读工具”的 spec delta
- [x] 1.3 运行 `openspec validate add-agent-weather-forecast-tool --strict`

## 2. Backend Weather
- [x] 2.1 扩展天气 controller，支持城市正向地理编码与指定日期 forecast 查询
- [x] 2.2 新增 `/weather/forecast` 路由，并保持 `/weather/today` 兼容
- [x] 2.3 补充天气 controller 单测，覆盖“城市 + 日期”和“默认日期”场景

## 3. Unified Agent Tooling
- [x] 3.1 新增天气 read tool handler 并注册到工具目录
- [x] 3.2 补充 tool catalog / handler 测试，覆盖天气工具元数据与解析
- [x] 3.3 补充 unified-agent integration test，验证 LLM 可调用天气工具后继续回复

## 4. Verification
- [x] 4.1 运行 `node --test server/tests/weather.controller.test.js server/tests/toolRegistry.catalog.test.js server/tests/toolHandlerResolver.test.js`
- [x] 4.2 运行 `node --test server/tests/unifiedAgent.integration.test.js`
