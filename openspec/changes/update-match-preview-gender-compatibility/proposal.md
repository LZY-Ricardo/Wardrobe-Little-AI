# Change: update match preview gender compatibility

## Why
当前搭配预览流程只校验素材是否齐全，不校验模特性别与衣物类型是否兼容，导致男模特仍可进入女性裙装预览生成链路。产品方向已经明确为严格禁止，因此需要把这条规则落实到前端展示、生成入口、后端接口和 unified-agent。

## What Changes
- 为搭配页增加男模特场景下的女性裙装下衣过滤
- 为搭配页生成动作增加兼容性拦截，阻止旧状态或异常状态继续发起请求
- 为 `/clothes/genPreview` 增加兼容性兜底校验，拒绝不兼容请求
- 为 unified-agent 的 `generate_outfit_preview` 增加相同兼容性规则
- 抽取集中化的兼容性判断逻辑，并补齐前后端回归测试

## Impact
- Affected specs: match-preview-compatibility
- Affected code: `client/src/pages/Match/index.jsx`, `server/controllers/clothesApi.js`, `server/agent/tools/handlers/media/readTools.js`, related test files, and new compatibility helpers
