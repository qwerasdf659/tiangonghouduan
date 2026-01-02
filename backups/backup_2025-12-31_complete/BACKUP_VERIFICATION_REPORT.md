# 数据库备份验证报告

## 备份信息

- **备份时间**: 2025/12/31 02:08:12
- **数据库**: restaurant_points_dev
- **备份目录**: /home/devbox/project/backups/backup_2025-12-31_complete

## 备份文件

| 文件类型 | 文件名                                   | 大小    | MD5校验                          |
| -------- | ---------------------------------------- | ------- | -------------------------------- |
| SQL      | complete_backup_2025-12-31-02-08-12.sql  | 1.94 MB | 2e48d417588f7cea01ff1cc9446997f5 |
| JSON     | complete_backup_2025-12-31-02-08-12.json | 6.04 MB | bfe4c3d0fa0fcaa2e0d324d60d0fce41 |

## 数据统计

- **表数量**: 48
- **总行数**: 9,367
- **总大小**: 9.83 MB

## 表详情

| 表名                                | 行数 | 数据大小 | 索引大小  | 最后更新                                                |
| ----------------------------------- | ---- | -------- | --------- | ------------------------------------------------------- |
| account_asset_balances              | 11   | 16.00KB  | 48.00KB   | Wed Dec 31 2025 00:59:38 GMT+0800 (China Standard Time) |
| accounts                            | 13   | 16.00KB  | 48.00KB   | Tue Dec 30 2025 21:41:40 GMT+0800 (China Standard Time) |
| admin_operation_logs                | 997  | 288.00KB | 368.00KB  | Tue Dec 30 2025 21:54:18 GMT+0800 (China Standard Time) |
| api_idempotency_requests            | 28   | 64.00KB  | 64.00KB   | Wed Dec 31 2025 00:59:38 GMT+0800 (China Standard Time) |
| asset_transactions                  | 205  | 96.00KB  | 80.00KB   | Wed Dec 31 2025 00:59:38 GMT+0800 (China Standard Time) |
| asset_transactions_archive_20251226 | 1174 | 320.00KB | 0.00KB    | Sat Dec 27 2025 00:33:28 GMT+0800 (China Standard Time) |
| audit_records                       | 0    | 16.00KB  | 64.00KB   | N/A                                                     |
| authentication_sessions             | 0    | 16.00KB  | 176.00KB  | N/A                                                     |
| chat_messages                       | 20   | 16.00KB  | 96.00KB   | Tue Dec 30 2025 21:54:13 GMT+0800 (China Standard Time) |
| consumption_records                 | 175  | 64.00KB  | 128.00KB  | Tue Dec 30 2025 21:54:18 GMT+0800 (China Standard Time) |
| content_review_records              | 175  | 48.00KB  | 80.00KB   | Tue Dec 30 2025 21:55:16 GMT+0800 (China Standard Time) |
| customer_service_sessions           | 3    | 16.00KB  | 96.00KB   | Tue Dec 30 2025 21:54:13 GMT+0800 (China Standard Time) |
| exchange_items                      | 16   | 16.00KB  | 32.00KB   | Tue Dec 30 2025 05:12:49 GMT+0800 (China Standard Time) |
| exchange_records                    | 0    | 16.00KB  | 112.00KB  | Tue Dec 30 2025 05:12:49 GMT+0800 (China Standard Time) |
| feedbacks                           | 26   | 16.00KB  | 32.00KB   | Mon Dec 22 2025 08:53:27 GMT+0800 (China Standard Time) |
| image_resources                     | 3    | 16.00KB  | 112.00KB  | N/A                                                     |
| item_instance_events                | 174  | 96.00KB  | 80.00KB   | Tue Dec 30 2025 21:54:09 GMT+0800 (China Standard Time) |
| item_instances                      | 1016 | 160.00KB | 160.00KB  | Tue Dec 30 2025 21:54:29 GMT+0800 (China Standard Time) |
| item_template_aliases               | 0    | 16.00KB  | 32.00KB   | N/A                                                     |
| lottery_campaigns                   | 1    | 16.00KB  | 144.00KB  | Sun Dec 21 2025 05:47:14 GMT+0800 (China Standard Time) |
| lottery_draw_quota_rules            | 1    | 16.00KB  | 0.00KB    | Wed Dec 24 2025 04:36:24 GMT+0800 (China Standard Time) |
| lottery_draws                       | 3582 | 512.00KB | 3376.00KB | Wed Dec 31 2025 00:59:38 GMT+0800 (China Standard Time) |
| lottery_management_settings         | 281  | 64.00KB  | 80.00KB   | Tue Dec 30 2025 21:55:16 GMT+0800 (China Standard Time) |
| lottery_presets                     | 2    | 16.00KB  | 80.00KB   | Tue Dec 30 2025 21:54:17 GMT+0800 (China Standard Time) |
| lottery_prizes                      | 9    | 16.00KB  | 144.00KB  | Wed Dec 31 2025 00:59:38 GMT+0800 (China Standard Time) |
| lottery_user_daily_draw_quota       | 5    | 16.00KB  | 48.00KB   | Tue Dec 30 2025 21:41:36 GMT+0800 (China Standard Time) |
| market_listings                     | 1    | 16.00KB  | 144.00KB  | N/A                                                     |
| material_asset_types                | 3    | 16.00KB  | 64.00KB   | Tue Dec 30 2025 21:54:19 GMT+0800 (China Standard Time) |
| material_conversion_rules           | 1    | 16.00KB  | 0.00KB    | Tue Dec 16 2025 04:53:24 GMT+0800 (China Standard Time) |
| merchant_points_reviews             | 0    | 16.00KB  | 48.00KB   | N/A                                                     |
| points_transactions                 | 105  | 48.00KB  | 96.00KB   | Wed Dec 31 2025 01:21:35 GMT+0800 (China Standard Time) |
| popup_banners                       | 0    | 16.00KB  | 16.00KB   | N/A                                                     |
| products                            | 52   | 16.00KB  | 208.00KB  | Fri Dec 12 2025 04:42:35 GMT+0800 (China Standard Time) |
| redemption_orders                   | 321  | 80.00KB  | 144.00KB  | Tue Dec 30 2025 21:54:10 GMT+0800 (China Standard Time) |
| role_change_logs                    | 0    | 16.00KB  | 96.00KB   | N/A                                                     |
| roles                               | 6    | 16.00KB  | 160.00KB  | Sat Nov 08 2025 06:28:17 GMT+0800 (China Standard Time) |
| sequelizemeta                       | 181  | 16.00KB  | 16.00KB   | Mon Dec 29 2025 07:57:03 GMT+0800 (China Standard Time) |
| stores                              | 0    | 16.00KB  | 80.00KB   | N/A                                                     |
| system_announcements                | 5    | 16.00KB  | 64.00KB   | Mon Nov 24 2025 05:48:04 GMT+0800 (China Standard Time) |
| system_settings                     | 18   | 16.00KB  | 80.00KB   | Tue Dec 30 2025 21:33:59 GMT+0800 (China Standard Time) |
| trade_orders                        | 0    | 16.00KB  | 64.00KB   | N/A                                                     |
| trade_records                       | 2    | 16.00KB  | 176.00KB  | N/A                                                     |
| user_hierarchy                      | 0    | 16.00KB  | 96.00KB   | N/A                                                     |
| user_points_accounts                | 3    | 16.00KB  | 64.00KB   | Tue Dec 30 2025 21:54:48 GMT+0800 (China Standard Time) |
| user_premium_status                 | 1    | 16.00KB  | 64.00KB   | Wed Nov 12 2025 03:00:00 GMT+0800 (China Standard Time) |
| user_roles                          | 13   | 16.00KB  | 64.00KB   | Tue Dec 30 2025 21:54:11 GMT+0800 (China Standard Time) |
| users                               | 22   | 16.00KB  | 80.00KB   | Wed Dec 31 2025 00:59:38 GMT+0800 (China Standard Time) |
| websocket_startup_logs              | 716  | 96.00KB  | 64.00KB   | Wed Dec 31 2025 01:28:49 GMT+0800 (China Standard Time) |

## 备份完整性验证

- ✅ 所有表结构已备份（包括CREATE TABLE语句）
- ✅ 所有表数据已备份（包括空表）
- ✅ 所有索引和外键约束已备份
- ✅ SQL和JSON两种格式均已生成
- ✅ MD5校验文件已生成
- ✅ 备份摘要已生成

## 备份状态

**✅ 备份完整、正确、最新**

备份包含当前数据库的所有表、所有数据、所有结构、所有约束，与当前实际数据库完全一致。
