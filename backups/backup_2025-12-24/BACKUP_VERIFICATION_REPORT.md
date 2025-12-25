# 数据库备份验证报告

## 备份信息

- 备份日期: 2025-12-24
- 备份时间: 2025-12-23T23:23:45.451Z
- SQL文件: full_backup_2025-12-24_2025-12-23T23-22-14.sql
- JSON文件: full_backup_2025-12-24_2025-12-23T23-22-14.json

## 验证结果

### 表数据验证

| 表名                          | 当前行数 | 备份行数 | 状态    | 大小(MB) |
| ----------------------------- | -------- | -------- | ------- | -------- |
| account_asset_balances        | 14       | 14       | ✅ 一致 | 0.06     |
| accounts                      | 12       | 12       | ✅ 一致 | 0.06     |
| admin_operation_logs          | 932      | 932      | ✅ 一致 | 0.64     |
| asset_transactions            | 857      | 857      | ✅ 一致 | 0.42     |
| audit_records                 | 0        | 0        | ✅ 一致 | 0.08     |
| authentication_sessions       | 0        | 0        | ✅ 一致 | 0.19     |
| chat_messages                 | 0        | 0        | ✅ 一致 | 0.11     |
| consumption_records           | 127      | 127      | ✅ 一致 | 0.19     |
| content_review_records        | 127      | 127      | ✅ 一致 | 0.09     |
| customer_service_sessions     | 1        | 1        | ✅ 一致 | 0.11     |
| exchange_items                | 16       | 16       | ✅ 一致 | 0.05     |
| exchange_records              | 0        | 0        | ✅ 一致 | 0.13     |
| feedbacks                     | 26       | 26       | ✅ 一致 | 0.05     |
| image_resources               | 3        | 3        | ✅ 一致 | 0.13     |
| item_instances                | 580      | 580      | ✅ 一致 | 0.16     |
| lottery_campaigns             | 1        | 1        | ✅ 一致 | 0.16     |
| lottery_draw_quota_rules      | 1        | 1        | ✅ 一致 | 0.02     |
| lottery_draws                 | 2907     | 2907     | ✅ 一致 | 3.80     |
| lottery_management_settings   | 153      | 153      | ✅ 一致 | 0.13     |
| lottery_presets               | 2        | 2        | ✅ 一致 | 0.09     |
| lottery_prizes                | 9        | 9        | ✅ 一致 | 0.17     |
| lottery_user_daily_draw_quota | 0        | 0        | ✅ 一致 | 0.02     |
| market_listings               | 1        | 1        | ✅ 一致 | 0.16     |
| material_asset_types          | 3        | 3        | ✅ 一致 | 0.08     |
| material_conversion_rules     | 1        | 1        | ✅ 一致 | 0.02     |
| points_transactions           | 25       | 25       | ✅ 一致 | 0.11     |
| popup_banners                 | 0        | 0        | ✅ 一致 | 0.03     |
| products                      | 52       | 52       | ✅ 一致 | 0.22     |
| redemption_orders             | 253      | 253      | ✅ 一致 | 0.17     |
| role_change_logs              | 0        | 0        | ✅ 一致 | 0.11     |
| roles                         | 6        | 6        | ✅ 一致 | 0.17     |
| sequelizemeta                 | 178      | 178      | ✅ 一致 | 0.03     |
| stores                        | 0        | 0        | ✅ 一致 | 0.09     |
| system_announcements          | 5        | 5        | ✅ 一致 | 0.08     |
| system_settings               | 16       | 16       | ✅ 一致 | 0.09     |
| trade_orders                  | 0        | 0        | ✅ 一致 | 0.08     |
| trade_records                 | 2        | 2        | ✅ 一致 | 0.19     |
| user_hierarchy                | 0        | 0        | ✅ 一致 | 0.11     |
| user_points_accounts          | 3        | 3        | ✅ 一致 | 0.08     |
| user_premium_status           | 1        | 1        | ✅ 一致 | 0.08     |
| user_roles                    | 13       | 13       | ✅ 一致 | 0.08     |
| users                         | 22       | 22       | ✅ 一致 | 0.09     |
| websocket_startup_logs        | 691      | 691      | ✅ 一致 | 0.16     |

### 总计

- 当前数据库总行数: 7,040
- 备份文件总行数: 7,040
- 数据一致性: ✅ 完全一致

### 表结构验证

- account_asset_balances: ✅ 包含建表语句
- accounts: ✅ 包含建表语句
- admin_operation_logs: ✅ 包含建表语句
- asset_transactions: ✅ 包含建表语句
- audit_records: ✅ 包含建表语句
- authentication_sessions: ✅ 包含建表语句
- chat_messages: ✅ 包含建表语句
- consumption_records: ✅ 包含建表语句
- content_review_records: ✅ 包含建表语句
- customer_service_sessions: ✅ 包含建表语句
- exchange_items: ✅ 包含建表语句
- exchange_records: ✅ 包含建表语句
- feedbacks: ✅ 包含建表语句
- image_resources: ✅ 包含建表语句
- item_instances: ✅ 包含建表语句
- lottery_campaigns: ✅ 包含建表语句
- lottery_draw_quota_rules: ✅ 包含建表语句
- lottery_draws: ✅ 包含建表语句
- lottery_management_settings: ✅ 包含建表语句
- lottery_presets: ✅ 包含建表语句
- lottery_prizes: ✅ 包含建表语句
- lottery_user_daily_draw_quota: ✅ 包含建表语句
- market_listings: ✅ 包含建表语句
- material_asset_types: ✅ 包含建表语句
- material_conversion_rules: ✅ 包含建表语句
- points_transactions: ✅ 包含建表语句
- popup_banners: ✅ 包含建表语句
- products: ✅ 包含建表语句
- redemption_orders: ✅ 包含建表语句
- role_change_logs: ✅ 包含建表语句
- roles: ✅ 包含建表语句
- sequelizemeta: ✅ 包含建表语句
- stores: ✅ 包含建表语句
- system_announcements: ✅ 包含建表语句
- system_settings: ✅ 包含建表语句
- trade_orders: ✅ 包含建表语句
- trade_records: ✅ 包含建表语句
- user_hierarchy: ✅ 包含建表语句
- user_points_accounts: ✅ 包含建表语句
- user_premium_status: ✅ 包含建表语句
- user_roles: ✅ 包含建表语句
- users: ✅ 包含建表语句
- websocket_startup_logs: ✅ 包含建表语句

### 索引和约束验证

- 主键约束: ✅ 已包含
- 索引定义: ✅ 已包含
- 外键约束: ✅ 已包含

### 文件完整性

- SQL文件大小: 1.48 MB
- JSON文件大小: 4.39 MB
- 文件可读性: ✅ 正常

## 验证总结

✅ **备份完整且准确**

- ✅ 所有 43 个表都已备份
- ✅ 数据行数完全一致 (共 7,040 行)
- ✅ 表结构完整 (包含所有建表语句)
- ✅ 索引和约束完整 (主键、外键、索引)
- ✅ 空表结构也已完整备份
- ✅ 备份文件可用于完整恢复

### 备份质量评级: A+ (优秀)
