## Context
本项目现有“衣物（clothes）”为核心实体；“套装”目前仅在推荐流程中临时生成并展示，缺少可复用的持久化能力。需求要求“推荐页爱心收藏”改为将套装加入用户套装库，并补齐用户自定义套装创建。

## Goals / Non-Goals
- Goals:
  - 套装可持久化到用户维度（同账号跨设备可见）
  - 推荐套装可一键加入套装库（幂等）
  - 用户可自定义创建套装
  - 套装库可列表/详情/删除
- Non-Goals:
  - 套装编辑/分享/评论等复杂社交能力

## Decisions
- Decision: 采用 MySQL 两张表建模（`suits` + `suit_items`），并在 `suits` 中保存组合 `signature` 做幂等收藏。
  - Why: 组合关系天然是多对多（套装包含多个单品），且需要按用户隔离、可扩展；signature 可避免重复收藏造成数据膨胀。

### Data Model（SQL 草案）
> 说明：SQL 作为文档/手工迁移脚本提供，不在服务端启动时自动执行。

```sql
CREATE TABLE IF NOT EXISTS suits (
  suit_id BIGINT PRIMARY KEY AUTO_INCREMENT,
  user_id BIGINT NOT NULL,
  name VARCHAR(64) NOT NULL,
  scene VARCHAR(64) DEFAULT '',
  description VARCHAR(255) DEFAULT '',
  cover MEDIUMTEXT NULL,
  source VARCHAR(16) NOT NULL DEFAULT 'manual', -- manual|recommend
  signature VARCHAR(255) NOT NULL,
  create_time BIGINT NOT NULL,
  update_time BIGINT NOT NULL,
  UNIQUE KEY uniq_user_signature (user_id, signature),
  KEY idx_user_time (user_id, create_time)
);

CREATE TABLE IF NOT EXISTS suit_items (
  id BIGINT PRIMARY KEY AUTO_INCREMENT,
  suit_id BIGINT NOT NULL,
  cloth_id BIGINT NOT NULL,
  sort_order INT NOT NULL DEFAULT 0,
  KEY idx_suit (suit_id),
  KEY idx_cloth (cloth_id)
);
```

### Signature 计算
- 规则：取套装内 `cloth_id` 去重后排序，使用 `-` 连接（例如 `12-88-103`）。
- 后端在创建时复算并覆盖前端传入的 signature，避免作弊/脏数据。

## Risks / Trade-offs
- `cover` 存储为 `MEDIUMTEXT`（可能是 dataURL/png）：优点是前端生成简单；缺点是占用 DB 空间。
  - Mitigation: MVP 允许为空；后续可改为对象存储/静态文件并存 URL。

## Migration Plan
1. 由开发者手工执行 SQL 创建表（或在已有迁移体系后接入）。
2. 发布后端接口与前端页面。

## Open Questions
1. 套装库入口放在底部 Tab 还是个人页快捷入口？（默认先加路由与个人页入口）
2. 是否需要套装编辑（更新 name/scene/items）？MVP 暂不做。

