# Migration Status

## Batch 4.1 基础读工具
- 已迁移：
  - `get_user_profile`
  - `get_profile_insight`
  - `get_wardrobe_analytics`
  - `list_clothes`
  - `get_cloth_detail`
- 对应测试：
  - `server/tests/toolRegistry.catalog.test.js`
  - `server/tests/unifiedAgent.integration.test.js`

## Batch 4.2 衣物写工具
- 已迁移：
  - `create_cloth`
  - `create_clothes_batch`
  - `update_cloth_fields`
  - `set_cloth_favorite`
  - `delete_cloth`
- 对应测试：
  - `server/tests/agent.integration.test.js`
  - `server/tests/unifiedAgent.integration.test.js`

## Batch 4.3 推荐 / 套装 / 穿搭
- 已迁移：
  - `generate_scene_suits`
  - `save_suit`
  - `create_outfit_log`
  - `delete_suit`
  - `delete_outfit_log`
- 对应测试：
  - `server/tests/agent.integration.test.js`
  - `server/tests/unifiedAgent.integration.test.js`

## Batch 4.4 画像与偏好
- 已迁移：
  - `update_user_sex`
  - `update_confirmation_preferences`
- 对应测试：
  - `server/tests/agent.integration.test.js`
  - `server/tests/unifiedAgent.integration.test.js`

## Batch 4.5 多模态工具
- 已迁移：
  - `analyze_image`
  - 图片驱动 `create_cloth`
  - 图片驱动 `create_clothes_batch`
- 对应测试：
  - `server/tests/unifiedAgent.integration.test.js`
  - `server/tests/toolRegistry.catalog.test.js`

## Remaining
- 无功能性未迁移工具。
- 兼容层仍保留：
  - `server/utils/toolRegistry.js`
  - `server/controllers/agent.js`
  - `server/controllers/unifiedAgentRuntime.js`
- 这些文件当前仅保留兼容入口与高层编排职责。
