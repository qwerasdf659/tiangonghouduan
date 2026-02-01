# 数据库备份验证报告

## 备份信息
- **备份日期**: 2026年02月01日（北京时间）
- **备份时间**: 2026/02/01 03:29:27
- **数据库**: restaurant_points_dev
- **主机**: dbconn.sealosbja.site:42569

## 验证结果摘要

| 验证项 | 结果 | 说明 |
|--------|------|------|
| 数据库连接 | ✅ 通过 | 成功连接到数据库 |
| 表数量一致性 | ✅ 通过 | 77个表全部备份 |
| 数据完整性 | ✅ 通过 | 243,554行数据 |
| 结构完整性 | ✅ 通过 | 77/77表结构完整 |
| 索引完整性 | ✅ 通过 | 77/77表索引完整 |
| 外键约束 | ✅ 通过 | 108个外键约束 |
| 空表处理 | ✅ 通过 | 11个空表结构已备份 |
| MD5校验 | ✅ 通过 | SQL和JSON文件校验通过 |
| 文件生成 | ✅ 通过 | 所有备份文件已生成 |

## 全部77个表验证详情

| 序号 | 表名 | 行数 | 列数 | 状态 |
|------|------|------|------|------|
| 1 | account_asset_balances | 40 | 9 | ✅ |
| 2 | accounts | 48 | 7 | ✅ |
| 3 | admin_operation_logs | 5356 | 23 | ✅ |
| 4 | administrative_regions | 44703 | 12 | ✅ |
| 5 | api_idempotency_requests | 157836 | 14 | ✅ |
| 6 | asset_group_defs | 8 | 10 | ✅ |
| 7 | asset_transactions | 16470 | 13 | ✅ |
| 8 | authentication_sessions | 0 | 10 | ✅ 空表 |
| 9 | batch_operation_logs | 2 | 13 | ✅ |
| 10 | category_defs | 8 | 8 | ✅ |
| 11 | chat_messages | 405 | 13 | ✅ |
| 12 | consumption_records | 10 | 23 | ✅ |
| 13 | content_review_records | 350 | 12 | ✅ |
| 14 | customer_service_sessions | 11 | 14 | ✅ |
| 15 | deadlock_test_1769781752856 | 5 | 5 | ✅ |
| 16 | exchange_items | 35 | 14 | ✅ |
| 17 | exchange_records | 0 | 19 | ✅ 空表 |
| 18 | feature_flags | 7 | 18 | ✅ |
| 19 | feedbacks | 64 | 16 | ✅ |
| 20 | image_resources | 0 | 15 | ✅ 空表 |
| 21 | item_instance_events | 4100 | 13 | ✅ |
| 22 | item_instances | 5170 | 9 | ✅ |
| 23 | item_templates | 16 | 15 | ✅ |
| 24 | lottery_alerts | 0 | 14 | ✅ 空表 |
| 25 | lottery_campaign_pricing_config | 11 | 11 | ✅ |
| 26 | lottery_campaign_quota_grants | 0 | 11 | ✅ 空表 |
| 27 | lottery_campaign_user_quota | 0 | 11 | ✅ 空表 |
| 28 | lottery_campaigns | 4 | 42 | ✅ |
| 29 | lottery_clear_setting_records | 615 | 9 | ✅ |
| 30 | lottery_daily_metrics | 5 | 27 | ✅ |
| 31 | lottery_draw_decisions | 712 | 37 | ✅ |
| 32 | lottery_draw_quota_rules | 7 | 15 | ✅ |
| 33 | lottery_draws | 712 | 44 | ✅ |
| 34 | lottery_hourly_metrics | 19 | 28 | ✅ |
| 35 | lottery_management_settings | 2735 | 9 | ✅ |
| 36 | lottery_presets | 2 | 15 | ✅ |
| 37 | lottery_prizes | 30 | 27 | ✅ |
| 38 | lottery_strategy_config | 17 | 14 | ✅ |
| 39 | lottery_tier_matrix_config | 12 | 15 | ✅ |
| 40 | lottery_tier_rules | 9 | 10 | ✅ |
| 41 | lottery_user_daily_draw_quota | 5 | 11 | ✅ |
| 42 | lottery_user_experience_state | 1 | 13 | ✅ |
| 43 | lottery_user_global_state | 1 | 15 | ✅ |
| 44 | market_listings | 210 | 21 | ✅ |
| 45 | material_asset_types | 4 | 14 | ✅ |
| 46 | material_conversion_rules | 1 | 22 | ✅ |
| 47 | merchant_operation_logs | 97 | 16 | ✅ |
| 48 | popup_banners | 4 | 13 | ✅ |
| 49 | preset_budget_debt | 0 | 15 | ✅ 空表 |
| 50 | preset_debt_limits | 1 | 11 | ✅ |
| 51 | preset_inventory_debt | 0 | 15 | ✅ 空表 |
| 52 | products | 52 | 28 | ✅ |
| 53 | rarity_defs | 6 | 9 | ✅ |
| 54 | redemption_orders | 1128 | 9 | ✅ |
| 55 | reminder_history | 0 | 13 | ✅ 空表 |
| 56 | reminder_rules | 3 | 18 | ✅ |
| 57 | report_templates | 2 | 21 | ✅ |
| 58 | risk_alerts | 9 | 17 | ✅ |
| 59 | roles | 11 | 9 | ✅ |
| 60 | sequelizemeta | 298 | 1 | ✅ |
| 61 | store_staff | 3 | 14 | ✅ |
| 62 | stores | 5 | 20 | ✅ |
| 63 | system_announcements | 12 | 13 | ✅ |
| 64 | system_configs | 6 | 8 | ✅ |
| 65 | system_dictionaries | 244 | 12 | ✅ |
| 66 | system_dictionary_history | 0 | 10 | ✅ 空表 |
| 67 | system_settings | 39 | 11 | ✅ |
| 68 | trade_orders | 106 | 16 | ✅ |
| 69 | user_behavior_tracks | 0 | 13 | ✅ 空表 |
| 70 | user_hierarchy | 9 | 12 | ✅ |
| 71 | user_premium_status | 1 | 9 | ✅ |
| 72 | user_risk_profiles | 3 | 12 | ✅ |
| 73 | user_role_change_records | 227 | 9 | ✅ |
| 74 | user_roles | 45 | 8 | ✅ |
| 75 | user_status_change_records | 228 | 9 | ✅ |
| 76 | users | 52 | 14 | ✅ |
| 77 | websocket_startup_logs | 1207 | 13 | ✅ |

## 外键约束统计

- 总外键数: 108
- 涉及表数: 54
- 所有外键的 ON DELETE/ON UPDATE 规则已完整备份

## 文件校验

| 文件 | MD5 | 大小 |
|------|-----|------|
| JSON备份 | 0e4dbcd12e0e873f74b269355b9d9512 | 165.85 MB |
| SQL备份 | 7392c86e84ee8f542dc8d782bae1d9cd | 68.55 MB |

## 结论

✅ **备份验证通过**

本次备份完整包含：
- 77个表的完整结构（CREATE TABLE语句）
- 所有表的列定义、类型、默认值、注释
- 243,554行数据
- 77个表的索引信息
- 108个外键约束及其规则
- 11个空表的完整结构
- SQL和JSON两种格式的备份文件
- MD5校验和文件

备份可用于完整恢复数据库到2026年02月01日（北京时间）的状态。

---
验证时间: 2026年02月01日 03:29:27（北京时间）

