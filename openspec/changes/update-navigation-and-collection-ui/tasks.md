## 1. Spec & Proposal
- [ ] 1.1 明确底部 Tab 收敛后的信息架构
- [ ] 1.2 运行 `openspec validate update-navigation-and-collection-ui --strict`

## 2. Frontend Navigation
- [ ] 2.1 底部 Tab 精简为 4 项，并修正 activeKey 映射（子路由也能高亮）
- [ ] 2.2 新增搭配中心二级 Tab（预览/推荐/合集）并接入现有页面
- [ ] 2.3 保留旧路由别名重定向

## 3. Collection UI
- [ ] 3.1 搭配合集卡片重构：封面为主 + 缩略图条
- [ ] 3.2 创建套装页隐藏 AI 入口并消除多余留白

## 4. Verification
- [ ] 4.1 手工冒烟：底部 Tab 点击区域正常、二级 Tab 切换正常
- [ ] 4.2 手工冒烟：推荐收藏→合集可见→删除正常；自建→合集可见→删除正常

