## 1. 路由与鉴权
- [ ] 1.1 实现 ProtectedRoute/HOC，未登录跳 `/login` 并带 redirect，已登录访问 `/login` 跳 `/home`。
- [ ] 1.2 将受保护路由接入守卫，验证页面跳转链路。

## 2. Axios 封装
- [ ] 2.1 配置 baseURL、超时、错误码→文案映射，封装实例。
- [ ] 2.2 实现刷新 token Promise 队列，401 失败清理状态并跳登录，接入全局 loading/错误提示钩子。

## 3. Recommend 打通
- [ ] 3.1 接入 `/scene/generateSceneSuits`，渲染列表与卡片映射。
- [ ] 3.2 增加 loading/错误/空态，无服务时灰化或提示。

## 4. Add/Update 异常与降级
- [ ] 4.1 补充文件校验与上传/压缩失败提示；分析失败时提示并允许重试。
- [ ] 4.2 Coze 不可用时开放手动填写入口，展示不可用原因。

## 5. Icon/编码修复
- [ ] 5.1 修正 icon className 组合与字体引入路径，确保样式正常。
- [ ] 5.2 统一文件/注释编码为 UTF-8，清理乱码文案。

## 6. 验证
- [ ] 6.1 前端运行 `npm run lint`。
- [ ] 6.2 手动冒烟：登录/跳转、token 过期刷新、Recommend 成功/失败/空态、上传失败提示、Icon/文案检查。
