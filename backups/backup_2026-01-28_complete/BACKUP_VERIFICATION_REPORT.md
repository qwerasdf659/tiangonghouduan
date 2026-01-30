# 数据库备份完整性验证报告

## 验证信息
- **验证时间（北京时间）**: 2026/01/28 19:29:03
- **备份日期**: 2026-01-28
- **数据库**: restaurant_points_dev

## 📊 完整性检查结果

### 表结构完整性 ✅
| 检查项 | 状态 | 详情 |
|--------|------|------|
| 表数量 | ✅ 通过 | 共 69 个表已备份 |
| 表结构 | ✅ 通过 | 所有表包含完整的CREATE TABLE语句 |
| 列定义 | ✅ 通过 | 所有表包含完整的列定义信息 |
| 空表备份 | ✅ 通过 | 8 个空表结构已完整备份 |

### 数据完整性 ✅
| 检查项 | 状态 | 详情 |
|--------|------|------|
| 总数据行数 | ✅ 通过 | 92,169 行数据 |
| 数据格式 | ✅ 通过 | JSON和SQL双格式备份 |
| 数据编码 | ✅ 通过 | UTF-8编码 |

### 索引完整性 ✅
| 检查项 | 状态 | 详情 |
|--------|------|------|
| 索引信息 | ✅ 通过 | 所有表的索引信息已记录 |
| 主键 | ✅ 通过 | 所有主键定义已备份 |
| 唯一索引 | ✅ 通过 | 所有唯一索引已备份 |

### 外键约束完整性 ✅
| 检查项 | 状态 | 详情 |
|--------|------|------|
| 外键数量 | ✅ 通过 | 98 个外键约束 |
| 涉及表数 | ✅ 通过 | 48 个表有外键 |
| ON DELETE规则 | ✅ 通过 | 已记录所有删除规则 |
| ON UPDATE规则 | ✅ 通过 | 已记录所有更新规则 |

## 📁 备份文件验证

| 文件 | 大小 | MD5校验 | 状态 |
|------|------|---------|------|
| complete_backup_2026-01-28_2026-01-28_19-29-03.json | 60.52 MB | 842738750ae07fa966b045ca231d8bd4 | ✅ 完整 |
| complete_backup_2026-01-28_2026-01-28_19-29-03.sql | 22.69 MB | c14efc5899276fc83fb8dc4c44ee004a | ✅ 完整 |
| BACKUP_MD5.txt | - | - | ✅ 已生成 |
| BACKUP_SUMMARY.txt | - | - | ✅ 已生成 |
| README.md | - | - | ✅ 已生成 |

## 📋 所有表备份状态

1. ✅ account_asset_balances: 32 行, 9 列
2. ✅ accounts: 27 行, 7 列
3. ✅ admin_operation_logs: 5096 行, 15 列
4. ✅ administrative_regions: 44703 行, 12 列
5. ✅ api_idempotency_requests: 6258 行, 14 列
6. ✅ asset_group_defs: 8 行, 10 列
7. ✅ asset_transactions: 12193 行, 13 列
8. ✅ authentication_sessions: 1261 行, 10 列
9. ✅ category_defs: 8 行, 8 列
10. ✅ chat_messages: 325 行, 13 列
11. ✅ consumption_records: 10 行, 21 列
12. ✅ content_review_records: 338 行, 12 列
13. ✅ customer_service_sessions: 5 行, 14 列
14. ✅ exchange_items: 34 行, 14 列
15. ✅ exchange_records: 0 行, 19 列（空表已备份结构）
16. ✅ feature_flags: 7 行, 18 列
17. ✅ feedbacks: 26 行, 16 列
18. ✅ image_resources: 0 行, 15 列（空表已备份结构）
19. ✅ item_instance_events: 3406 行, 13 列
20. ✅ item_instances: 4484 行, 9 列
21. ✅ item_templates: 16 行, 15 列
22. ✅ lottery_campaign_pricing_config: 11 行, 11 列
23. ✅ lottery_campaign_quota_grants: 0 行, 11 列（空表已备份结构）
24. ✅ lottery_campaign_user_quota: 0 行, 11 列（空表已备份结构）
25. ✅ lottery_campaigns: 4 行, 41 列
26. ✅ lottery_clear_setting_records: 603 行, 9 列
27. ✅ lottery_daily_metrics: 0 行, 27 列（空表已备份结构）
28. ✅ lottery_draw_decisions: 3407 行, 37 列
29. ✅ lottery_draw_quota_rules: 7 行, 15 列
30. ✅ lottery_draws: 3409 行, 44 列
31. ✅ lottery_hourly_metrics: 9 行, 28 列
32. ✅ lottery_management_settings: 2679 行, 9 列
33. ✅ lottery_presets: 2 行, 15 列
34. ✅ lottery_prizes: 30 行, 27 列
35. ✅ lottery_strategy_config: 17 行, 14 列
36. ✅ lottery_tier_matrix_config: 12 行, 11 列
37. ✅ lottery_tier_rules: 9 行, 10 列
38. ✅ lottery_user_daily_draw_quota: 2 行, 11 列
39. ✅ lottery_user_experience_state: 1 行, 13 列
40. ✅ lottery_user_global_state: 1 行, 15 列
41. ✅ market_listings: 151 行, 21 列
42. ✅ material_asset_types: 4 行, 13 列
43. ✅ material_conversion_rules: 1 行, 22 列
44. ✅ merchant_operation_logs: 95 行, 16 列
45. ✅ popup_banners: 4 行, 13 列
46. ✅ preset_budget_debt: 0 行, 15 列（空表已备份结构）
47. ✅ preset_debt_limits: 1 行, 11 列
48. ✅ preset_inventory_debt: 0 行, 15 列（空表已备份结构）
49. ✅ products: 52 行, 28 列
50. ✅ rarity_defs: 6 行, 9 列
51. ✅ redemption_orders: 1088 行, 9 列
52. ✅ risk_alerts: 9 行, 17 列
53. ✅ roles: 11 行, 9 列
54. ✅ sequelizemeta: 287 行, 1 列
55. ✅ store_staff: 3 行, 14 列
56. ✅ stores: 5 行, 20 列
57. ✅ system_announcements: 8 行, 13 列
58. ✅ system_dictionaries: 244 行, 12 列
59. ✅ system_dictionary_history: 0 行, 10 列（空表已备份结构）
60. ✅ system_settings: 39 行, 11 列
61. ✅ trade_orders: 76 行, 16 列
62. ✅ user_hierarchy: 9 行, 12 列
63. ✅ user_premium_status: 1 行, 9 列
64. ✅ user_risk_profiles: 3 行, 12 列
65. ✅ user_role_change_records: 219 行, 9 列
66. ✅ user_roles: 24 行, 8 列
67. ✅ user_status_change_records: 220 行, 9 列
68. ✅ users: 31 行, 13 列
69. ✅ websocket_startup_logs: 1138 行, 13 列

## 🔑 外键约束详情

### account_asset_balances
- account_asset_balances_ibfk_1: account_id → accounts(account_id) [ON DELETE RESTRICT, ON UPDATE CASCADE]

### accounts
- accounts_ibfk_1: user_id → users(user_id) [ON DELETE RESTRICT, ON UPDATE CASCADE]

### admin_operation_logs
- admin_operation_logs_ibfk_1: operator_id → users(user_id) [ON DELETE RESTRICT, ON UPDATE CASCADE]

### asset_transactions
- asset_transactions_account_id_foreign_idx: account_id → accounts(account_id) [ON DELETE RESTRICT, ON UPDATE CASCADE]

### authentication_sessions
- authentication_sessions_ibfk_1: user_id → users(user_id) [ON DELETE CASCADE, ON UPDATE CASCADE]

### chat_messages
- fk_chat_messages_sender_id: sender_id → users(user_id) [ON DELETE SET NULL, ON UPDATE CASCADE]
- fk_chat_messages_session_id: session_id → customer_service_sessions(session_id) [ON DELETE CASCADE, ON UPDATE CASCADE]

### consumption_records
- fk_consumption_records_merchant_id: merchant_id → users(user_id) [ON DELETE SET NULL, ON UPDATE CASCADE]
- fk_consumption_records_reviewed_by: reviewed_by → users(user_id) [ON DELETE SET NULL, ON UPDATE CASCADE]
- fk_consumption_records_user_id: user_id → users(user_id) [ON DELETE CASCADE, ON UPDATE CASCADE]
- fk_consumption_store: store_id → stores(store_id) [ON DELETE RESTRICT, ON UPDATE CASCADE]

### content_review_records
- content_review_records_ibfk_1: auditor_id → users(user_id) [ON DELETE SET NULL, ON UPDATE CASCADE]

### customer_service_sessions
- fk_customer_sessions_admin_id: admin_id → users(user_id) [ON DELETE SET NULL, ON UPDATE CASCADE]
- fk_customer_sessions_closed_by: closed_by → users(user_id) [ON DELETE RESTRICT, ON UPDATE CASCADE]
- fk_customer_sessions_user_id: user_id → users(user_id) [ON DELETE SET NULL, ON UPDATE CASCADE]

### exchange_items
- fk_exchange_items_primary_image: primary_image_id → image_resources(image_id) [ON DELETE SET NULL, ON UPDATE CASCADE]

### exchange_records
- exchange_records_ibfk_1: user_id → users(user_id) [ON DELETE RESTRICT, ON UPDATE NO ACTION]
- exchange_records_ibfk_2: item_id → exchange_items(item_id) [ON DELETE RESTRICT, ON UPDATE NO ACTION]

### feedbacks
- feedbacks_ibfk_1: user_id → users(user_id) [ON DELETE SET NULL, ON UPDATE CASCADE]
- feedbacks_ibfk_2: admin_id → users(user_id) [ON DELETE SET NULL, ON UPDATE CASCADE]

### image_resources
- fk_image_resources_user_id: user_id → users(user_id) [ON DELETE SET NULL, ON UPDATE CASCADE]

### item_instance_events
- item_instance_events_ibfk_1: item_instance_id → item_instances(item_instance_id) [ON DELETE RESTRICT, ON UPDATE CASCADE]

### item_instances
- fk_item_instances_owner_user_id: owner_user_id → users(user_id) [ON DELETE RESTRICT, ON UPDATE CASCADE]

### item_templates
- item_templates_ibfk_1: category_code → category_defs(category_code) [ON DELETE SET NULL, ON UPDATE CASCADE]
- item_templates_ibfk_2: rarity_code → rarity_defs(rarity_code) [ON DELETE SET NULL, ON UPDATE CASCADE]

### lottery_campaign_pricing_config
- fk_pricing_config_campaign: campaign_id → lottery_campaigns(campaign_id) [ON DELETE CASCADE, ON UPDATE CASCADE]
- fk_pricing_config_creator: created_by → users(user_id) [ON DELETE RESTRICT, ON UPDATE CASCADE]
- fk_pricing_config_updater: updated_by → users(user_id) [ON DELETE SET NULL, ON UPDATE CASCADE]

### lottery_campaign_user_quota
- fk_user_quota_campaign_id: campaign_id → lottery_campaigns(campaign_id) [ON DELETE CASCADE, ON UPDATE CASCADE]
- fk_user_quota_user_id: user_id → users(user_id) [ON DELETE CASCADE, ON UPDATE CASCADE]

### lottery_clear_setting_records
- lottery_clear_setting_records_ibfk_1: user_id → users(user_id) [ON DELETE RESTRICT, ON UPDATE CASCADE]
- lottery_clear_setting_records_ibfk_2: admin_id → users(user_id) [ON DELETE RESTRICT, ON UPDATE CASCADE]

### lottery_daily_metrics
- fk_daily_metrics_campaign_id: campaign_id → lottery_campaigns(campaign_id) [ON DELETE CASCADE, ON UPDATE CASCADE]

### lottery_draw_decisions
- fk_decisions_draw: draw_id → lottery_draws(draw_id) [ON DELETE CASCADE, ON UPDATE CASCADE]

### lottery_draws
- fk_lottery_draws_user_id: user_id → users(user_id) [ON DELETE CASCADE, ON UPDATE CASCADE]
- fk_lottery_records_campaign: campaign_id → lottery_campaigns(campaign_id) [ON DELETE RESTRICT, ON UPDATE CASCADE]
- lottery_draws_ibfk_4: prize_id → lottery_prizes(prize_id) [ON DELETE SET NULL, ON UPDATE CASCADE]

### lottery_hourly_metrics
- fk_hourly_metrics_campaign_id: campaign_id → lottery_campaigns(campaign_id) [ON DELETE CASCADE, ON UPDATE CASCADE]

### lottery_management_settings
- lottery_management_settings_ibfk_1: user_id → users(user_id) [ON DELETE CASCADE, ON UPDATE CASCADE]
- lottery_management_settings_ibfk_2: created_by → users(user_id) [ON DELETE CASCADE, ON UPDATE CASCADE]

### lottery_presets
- fk_lottery_presets_created_by: created_by → users(user_id) [ON DELETE SET NULL, ON UPDATE CASCADE]
- fk_lottery_presets_prize_id: prize_id → lottery_prizes(prize_id) [ON DELETE CASCADE, ON UPDATE CASCADE]
- fk_lottery_presets_user_id: user_id → users(user_id) [ON DELETE CASCADE, ON UPDATE CASCADE]

### lottery_prizes
- fk_lottery_prizes_campaign: campaign_id → lottery_campaigns(campaign_id) [ON DELETE RESTRICT, ON UPDATE CASCADE]
- fk_lottery_prizes_image: image_id → image_resources(image_id) [ON DELETE SET NULL, ON UPDATE CASCADE]

### lottery_tier_rules
- fk_tier_rules_campaign_id: campaign_id → lottery_campaigns(campaign_id) [ON DELETE CASCADE, ON UPDATE CASCADE]

### lottery_user_experience_state
- fk_experience_state_campaign_id: campaign_id → lottery_campaigns(campaign_id) [ON DELETE CASCADE, ON UPDATE CASCADE]
- fk_experience_state_user_id: user_id → users(user_id) [ON DELETE CASCADE, ON UPDATE CASCADE]

### lottery_user_global_state
- fk_global_state_user_id: user_id → users(user_id) [ON DELETE CASCADE, ON UPDATE CASCADE]

### market_listings
- fk_market_listings_offer_item_instance_id: offer_item_instance_id → item_instances(item_instance_id) [ON DELETE RESTRICT, ON UPDATE CASCADE]
- market_listings_ibfk_1: seller_user_id → users(user_id) [ON DELETE RESTRICT, ON UPDATE CASCADE]
- market_listings_offer_asset_group_code_foreign_idx: offer_asset_group_code → asset_group_defs(group_code) [ON DELETE SET NULL, ON UPDATE CASCADE]
- market_listings_offer_item_category_code_foreign_idx: offer_item_category_code → category_defs(category_code) [ON DELETE SET NULL, ON UPDATE CASCADE]
- market_listings_offer_item_rarity_foreign_idx: offer_item_rarity → rarity_defs(rarity_code) [ON DELETE SET NULL, ON UPDATE CASCADE]
- market_listings_offer_item_template_id_foreign_idx: offer_item_template_id → item_templates(item_template_id) [ON DELETE SET NULL, ON UPDATE CASCADE]

### material_asset_types
- fk_mat_group_code: group_code → asset_group_defs(group_code) [ON DELETE RESTRICT, ON UPDATE CASCADE]
- fk_material_asset_types_group_code: group_code → asset_group_defs(group_code) [ON DELETE RESTRICT, ON UPDATE CASCADE]

### merchant_operation_logs
- merchant_operation_logs_ibfk_1: operator_id → users(user_id) [ON DELETE RESTRICT, ON UPDATE CASCADE]
- merchant_operation_logs_ibfk_2: store_id → stores(store_id) [ON DELETE RESTRICT, ON UPDATE CASCADE]
- merchant_operation_logs_ibfk_3: target_user_id → users(user_id) [ON DELETE SET NULL, ON UPDATE CASCADE]
- merchant_operation_logs_ibfk_4: related_record_id → consumption_records(record_id) [ON DELETE SET NULL, ON UPDATE CASCADE]
- merchant_operation_logs_ibfk_5: store_id → stores(store_id) [ON DELETE RESTRICT, ON UPDATE CASCADE]

### popup_banners
- popup_banners_ibfk_1: created_by → users(user_id) [ON DELETE SET NULL, ON UPDATE CASCADE]

### preset_budget_debt
- fk_budget_debt_preset_id: preset_id → lottery_presets(preset_id) [ON DELETE RESTRICT, ON UPDATE CASCADE]
- fk_budget_debt_user_id: user_id → users(user_id) [ON DELETE RESTRICT, ON UPDATE CASCADE]

### preset_inventory_debt
- fk_inv_debt_preset_id: preset_id → lottery_presets(preset_id) [ON DELETE RESTRICT, ON UPDATE CASCADE]
- fk_inv_debt_prize_id: prize_id → lottery_prizes(prize_id) [ON DELETE RESTRICT, ON UPDATE CASCADE]
- fk_inv_debt_user_id: user_id → users(user_id) [ON DELETE RESTRICT, ON UPDATE CASCADE]

### redemption_orders
- redemption_orders_ibfk_1: item_instance_id → item_instances(item_instance_id) [ON DELETE RESTRICT, ON UPDATE CASCADE]
- redemption_orders_ibfk_2: redeemer_user_id → users(user_id) [ON DELETE SET NULL, ON UPDATE CASCADE]

### risk_alerts
- risk_alerts_ibfk_1: operator_id → users(user_id) [ON DELETE SET NULL, ON UPDATE CASCADE]
- risk_alerts_ibfk_2: store_id → stores(store_id) [ON DELETE SET NULL, ON UPDATE CASCADE]
- risk_alerts_ibfk_3: target_user_id → users(user_id) [ON DELETE SET NULL, ON UPDATE CASCADE]
- risk_alerts_ibfk_4: reviewed_by → users(user_id) [ON DELETE SET NULL, ON UPDATE CASCADE]

### store_staff
- store_staff_ibfk_1: user_id → users(user_id) [ON DELETE RESTRICT, ON UPDATE CASCADE]
- store_staff_ibfk_2: store_id → stores(store_id) [ON DELETE RESTRICT, ON UPDATE CASCADE]
- store_staff_ibfk_3: operator_id → users(user_id) [ON DELETE SET NULL, ON UPDATE CASCADE]

### stores
- fk_store_assigned_to: assigned_to → users(user_id) [ON DELETE SET NULL, ON UPDATE CASCADE]
- fk_store_merchant: merchant_id → users(user_id) [ON DELETE SET NULL, ON UPDATE CASCADE]

### system_announcements
- system_announcements_ibfk_1: admin_id → users(user_id) [ON DELETE RESTRICT, ON UPDATE CASCADE]

### system_dictionary_history
- fk_dict_history_dict_id: dict_id → system_dictionaries(dict_id) [ON DELETE CASCADE, ON UPDATE CASCADE]

### trade_orders
- trade_orders_ibfk_1: listing_id → market_listings(listing_id) [ON DELETE RESTRICT, ON UPDATE CASCADE]
- trade_orders_ibfk_2: buyer_user_id → users(user_id) [ON DELETE RESTRICT, ON UPDATE CASCADE]
- trade_orders_ibfk_3: seller_user_id → users(user_id) [ON DELETE RESTRICT, ON UPDATE CASCADE]

### user_hierarchy
- fk_user_hierarchy_deactivator: deactivated_by → users(user_id) [ON DELETE SET NULL, ON UPDATE CASCADE]
- fk_user_hierarchy_role: role_id → roles(role_id) [ON DELETE CASCADE, ON UPDATE CASCADE]
- fk_user_hierarchy_store: store_id → stores(store_id) [ON DELETE SET NULL, ON UPDATE CASCADE]
- fk_user_hierarchy_superior: superior_user_id → users(user_id) [ON DELETE SET NULL, ON UPDATE CASCADE]
- fk_user_hierarchy_user: user_id → users(user_id) [ON DELETE CASCADE, ON UPDATE CASCADE]

### user_premium_status
- fk_ups_user_id: user_id → users(user_id) [ON DELETE CASCADE, ON UPDATE CASCADE]

### user_risk_profiles
- user_risk_profiles_ibfk_1: user_id → users(user_id) [ON DELETE CASCADE, ON UPDATE CASCADE]
- user_risk_profiles_ibfk_2: frozen_by → users(user_id) [ON DELETE SET NULL, ON UPDATE CASCADE]

### user_role_change_records
- user_role_change_records_ibfk_1: user_id → users(user_id) [ON DELETE RESTRICT, ON UPDATE CASCADE]
- user_role_change_records_ibfk_2: operator_id → users(user_id) [ON DELETE RESTRICT, ON UPDATE CASCADE]

### user_roles
- fk_user_roles_role_id: role_id → roles(role_id) [ON DELETE RESTRICT, ON UPDATE CASCADE]
- fk_user_roles_user_id: user_id → users(user_id) [ON DELETE CASCADE, ON UPDATE CASCADE]

### user_status_change_records
- user_status_change_records_ibfk_1: user_id → users(user_id) [ON DELETE RESTRICT, ON UPDATE CASCADE]
- user_status_change_records_ibfk_2: operator_id → users(user_id) [ON DELETE RESTRICT, ON UPDATE CASCADE]

## 📊 与上一次备份（2026-01-26）对比

| 对比项 | 2026-01-26 | 2026-01-28 | 变化 |
|--------|-----------|-----------|------|
| 表数量 | 69 | 69 | 无变化 |
| 总行数 | 66,797 | 92,169 | +25,372 (+38.0%) |
| 空表数 | 10 | 8 | -2 (有2个空表有新数据) |
| 外键数 | 98 | 98 | 无变化 |
| JSON大小 | 34.26 MB | 60.52 MB | +26.26 MB (+76.7%) |
| SQL大小 | 12.32 MB | 22.69 MB | +10.37 MB (+84.2%) |

### 数据增长详情
主要增长表：
- admin_operation_logs: 4,527 → 5,096 (+569)
- api_idempotency_requests: 1,434 → 6,258 (+4,824)
- asset_transactions: 5,680 → 12,193 (+6,513)
- authentication_sessions: 70 → 1,261 (+1,191)
- chat_messages: 8 → 325 (+317)
- item_instance_events: 1,141 → 3,406 (+2,265)
- item_instances: 2,190 → 4,484 (+2,294)
- lottery_draw_decisions: 0 → 3,407 (+3,407)
- lottery_draws: 17 → 3,409 (+3,392)
- market_listings: 48 → 151 (+103)
- trade_orders: 4 → 76 (+72)

## ✅ 验证结论

**备份完整性验证结果：全部通过 ✅**

- 表数量：69 个（包括8个空表）
- 数据行数：92,169 行
- 外键约束：98 个
- 备份格式：SQL + JSON双格式
- 版本兼容性：complete_backup_v2.0

**此备份可用于完整恢复数据库结构和数据。**

---
*验证时间: 2026/01/28 19:29:03（北京时间）*








