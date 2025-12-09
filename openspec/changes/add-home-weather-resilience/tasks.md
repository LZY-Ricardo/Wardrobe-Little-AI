## 1. Weather store 与缓存
- [ ] 1.1 在 store 中新增 weather slice，包含 city、data、status、source、lastUpdated，支持 localStorage hydrate。
- [ ] 1.2 实现 TTL 校验（30-60 分钟可配置），提供更新、清理、持久化 API。

## 2. 数据拉取与降级
- [ ] 2.1 封装天气请求调用 `/api/weather?city=...`，设置超时与错误映射。
- [ ] 2.2 实现 live→cache→config 的降级链路；失败时不清空已有数据，标记 source 并提供错误状态。
- [ ] 2.3 城市切换去抖请求；支持手动刷新与重试。

## 3. Home UI 集成
- [ ] 3.1 接入 Skeleton/Loading、ErrorBanner+重试、缓存数据标记、手动刷新按钮。
- [ ] 3.2 展示字段：城市、温度、描述（可选 AQI/湿度）；接口缺失时展示配置兜底文案。

## 4. 验证
- [ ] 4.1 `npm run lint`
- [ ] 4.2 手工冒烟：接口可用/超时/失败、缓存命中、配置兜底、城市切换与重试。