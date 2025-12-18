## 1. Spec & Proposal
- [ ] 1.1 完善并确认需求边界（持久化、入口、字段）
- [ ] 1.2 补齐 spec delta（含场景用例）
- [ ] 1.3 运行 `openspec validate add-suit-library --strict`

## 2. Backend（Koa + MySQL）
- [ ] 2.1 增加 `suits` / `suit_items` 数据表 SQL（不在服务端自动迁移）
- [ ] 2.2 增加套装库接口：列表、详情、创建、删除（鉴权）
- [ ] 2.3 创建接口支持“幂等收藏”：同一用户相同 cloth_id 组合不重复入库（按 signature）

## 3. Frontend（Vite + React）
- [ ] 3.1 新增套装库列表页 `/suits`（展示 cover、名称、场景、单品数）
- [ ] 3.2 新增自定义套装创建页 `/suits/create`（从衣橱选单品、填写名称/场景）
- [ ] 3.3 推荐页爱心改造：点击将该套装加入套装库；提示“已加入/已存在”

## 4. Verification
- [ ] 4.1 手工冒烟：推荐页收藏套装→套装库可见→查看详情→删除
- [ ] 4.2 手工冒烟：自定义创建→套装库可见→查看详情

