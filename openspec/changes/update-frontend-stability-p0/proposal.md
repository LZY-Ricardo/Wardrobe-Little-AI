# Change: 前端 P0 稳定性与必需功能完善

## Why
- 登录态缺少守卫，token 失效仅靠拦截器，未登录可访问业务页，存在安全与体验风险。
- 推荐/上传等关键链路缺少打通与降级，错误处理与文案不统一，导致不可用或反馈缺失。
- Icon/编码问题导致样式与文案异常，影响可用性与品牌感知。

## What Changes
- 路由守卫：为受保护路由校验 access/refresh token，未登录重定向 `/login`，已登录访问 `/login` 跳 `/home`，支持 redirect 回跳。
- axios 封装：统一超时与错误码→文案映射；刷新 token 使用队列防重入；401 失败清理状态并跳登录；提供全局 loading/错误提示钩子。
- Recommend 打通：调用 `/scene/generateSceneSuits` 渲染列表，补充 loading/错误/空态，无服务时提示或灰化。
- Add/Update 异常与降级：补充上传/压缩/分析失败提示；Coze 不可用时允许手填并提示原因。
- Icon/乱码修复：修正 icon className 组合与字体引入；统一文件/注释编码为 UTF-8，清理乱码文案。

## Impact
- 受影响 specs：frontend 能力。
- 受影响代码：前端路由（守卫/HOC）、axios 实例封装、Recommend 页面、Add/Update 表单与上传工具、全局 Icon/样式资源。
- 依赖：确认 `/scene/generateSceneSuits`、鉴权与刷新 token 接口；如未就绪需灰化或降级提示。
