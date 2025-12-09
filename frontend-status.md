# 前端现状（client）

## 技术栈与基础
- Vite + React 18，react-router-dom v7，antd-mobile + react-vant。
- axios 全局拦截：baseURL http://localhost:3000，401 时自动尝试 refresh_token，失败跳转 /login。
- 目录：src/pages（业务页）、src/components、src/api/index.js、src/utils/imageUtils.js、src/router/index.jsx；src/store 为空。

## 路由与页面功能
- /login：表单校验简单；调用 /user/login，存储 access/refresh token 与 userInfo。
- /register：静态长度/一致性校验，调用 /user/register，成功后携带账号回填登录页。
- /home：调用 /clothes/all，随机展示 3 件衣物；天气/标签文案为静态；标签色随机。
- /outfit（虚拟衣柜）：获取 /clothes/all；前端筛选类型/颜色/季节/风格/搜索；详情弹窗可删除 (/clothes/:id) 或跳转 /update；新增跳转 /add。
- /add：上传图片后本地压缩→/clothes/analyze(CoZ​e) 自动填表；/clothes/uploadCloth 提交；表单校验依赖 Toast，无异步错误分支。
- /update：路由 state 带入选中衣物；支持重新压缩/分析；PUT /clothes/:id 更新。
- /match：加载 /clothes/TopClothes、/clothes/BotClothes；需先在 /person 设置 sex 与 characterModel；POST /clothes/genPreview 上传 top/bottom/model 生成预览，失败用占位图。
- /recommend：输入场景→POST /scene/generateSceneSuits，但结果未渲染；页面展示 3 张静态示例卡片，历史标签静态；AI 助手入口跳 /aichat。
- /person：/user/getUserInfo 拉取；更新昵称 /user/updateUserName、性别 /user/updateSex、密码 /user/updatePassword；上传全身照 /user/uploadPhoto（base64）；退出清空本地存储。
- /aichat：fetch http://localhost:3000/chat（SSE），携带 access_token 但后端未鉴权；无加载/错误回退。

## 静态或未完成功能
- 场景推荐列表完全静态，/scene/generateSceneSuits 的结果未展示。
- 搭配预览、衣物分析、场景推荐依赖 Coze 工作流；未配置环境变量则不可用。
- 未实现全局状态/路由守卫，登录态仅依赖 localStorage；src/store 为空。
- 多处中文显示乱码（编码问题）。
- Icon 组件 className 组合异常（iconfont icon-iconfont icon-xxx），需结合字体文件确认。

## 依赖与风险
- 所有业务接口依赖 JWT，401 会重定向登录。
- 上传/压缩仅前端校验，缺少超时与失败重试；文件体积可能较大。
- /match 生成预览依赖用户先设置 sex 和 characterModel，否则引导回 /person。
- 外部服务：Coze 工作流、Ollama 聊天服务未就绪时相关功能失败。
