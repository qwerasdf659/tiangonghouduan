# 2025年12月19日数据库完整备份

## 备份信息

- **备份时间**: 2025/12/19 23:43:47
- **数据库**: restaurant_points_dev
- **MySQL版本**: 8.0.30
- **总表数**: 44
- **成功备份**: 44个表
- **总记录数**: 4864行
- **耗时**: 0.44秒

## 备份文件

### SQL备份

- **文件**: `full_backup_2025-12-19_2025-12-19_15-43-47-055+.sql`
- **大小**: 2.86 MB
- **MD5**: `db9ae296d89876d4b248dc453209208c`
- **格式**: 标准SQL，包含表结构、索引、外键约束和数据

### JSON备份

- **文件**: `full_backup_2025-12-19_2025-12-19_15-43-47-055+.json`
- **大小**: 4.49 MB
- **MD5**: `b8d44af6daf36b0ba299ec384d60104a`
- **格式**: JSON，包含完整的元数据和结构化数据

## 表统计

| #   | 表名                                 | 记录数 | 数据大小 | 索引大小 | 引擎   |
| --- | ------------------------------------ | ------ | -------- | -------- | ------ |
| 1   | \_deprecated_user_inventory_20251217 | 15     | 0.02MB   | 0.28MB   | InnoDB |
| 2   | account_asset_balances               | 3      | 0.02MB   | 0.05MB   | InnoDB |
| 3   | accounts                             | 10     | 0.02MB   | 0.05MB   | InnoDB |
| 4   | admin_operation_logs                 | 886    | 0.23MB   | 0.22MB   | InnoDB |
| 5   | asset_transactions                   | 41     | 0.02MB   | 0.08MB   | InnoDB |
| 6   | audit_records                        | 0      | 0.02MB   | 0.06MB   | InnoDB |
| 7   | authentication_sessions              | 0      | 0.02MB   | 0.17MB   | InnoDB |
| 8   | chat_messages                        | 120    | 0.06MB   | 0.09MB   | InnoDB |
| 9   | consumption_records                  | 64     | 0.02MB   | 0.11MB   | InnoDB |
| 10  | content_review_records               | 64     | 0.02MB   | 0.08MB   | InnoDB |
| 11  | customer_service_sessions            | 8      | 0.02MB   | 0.09MB   | InnoDB |
| 12  | exchange_items                       | 16     | 0.02MB   | 0.03MB   | InnoDB |
| 13  | exchange_market_records              | 0      | 0.02MB   | 0.11MB   | InnoDB |
| 14  | exchange_records                     | 15     | 0.02MB   | 0.23MB   | InnoDB |
| 15  | feedbacks                            | 25     | 0.02MB   | 0.03MB   | InnoDB |
| 16  | image_resources                      | 3      | 0.02MB   | 0.11MB   | InnoDB |
| 17  | item_instances                       | 75     | 0.05MB   | 0.06MB   | InnoDB |
| 18  | lottery_campaigns                    | 1      | 0.02MB   | 0.14MB   | InnoDB |
| 19  | lottery_draws                        | 2277   | 0.31MB   | 2.20MB   | InnoDB |
| 20  | lottery_management_settings          | 85     | 0.02MB   | 0.08MB   | InnoDB |
| 21  | lottery_presets                      | 2      | 0.02MB   | 0.08MB   | InnoDB |
| 22  | lottery_prizes                       | 9      | 0.02MB   | 0.17MB   | InnoDB |
| 23  | market_listings                      | 1      | 0.02MB   | 0.14MB   | InnoDB |
| 24  | material_asset_types                 | 1      | 0.02MB   | 0.06MB   | InnoDB |
| 25  | material_conversion_rules            | 1      | 0.02MB   | 0.00MB   | InnoDB |
| 26  | points_transactions                  | 311    | 0.08MB   | 0.39MB   | InnoDB |
| 27  | products                             | 52     | 0.02MB   | 0.20MB   | InnoDB |
| 28  | redemption_orders                    | 49     | 0.02MB   | 0.06MB   | InnoDB |
| 29  | role_change_logs                     | 0      | 0.02MB   | 0.09MB   | InnoDB |
| 30  | roles                                | 6      | 0.02MB   | 0.16MB   | InnoDB |
| 31  | sequelizemeta                        | 159    | 0.02MB   | 0.02MB   | InnoDB |
| 32  | stores                               | 0      | 0.02MB   | 0.08MB   | InnoDB |
| 33  | system_announcements                 | 5      | 0.02MB   | 0.06MB   | InnoDB |
| 34  | system_settings                      | 16     | 0.02MB   | 0.08MB   | InnoDB |
| 35  | trade_orders                         | 0      | 0.02MB   | 0.06MB   | InnoDB |
| 36  | trade_records                        | 2      | 0.02MB   | 0.17MB   | InnoDB |
| 37  | user_asset_accounts                  | 1      | 0.02MB   | 0.02MB   | InnoDB |
| 38  | user_hierarchy                       | 0      | 0.02MB   | 0.09MB   | InnoDB |
| 39  | user_points_accounts                 | 3      | 0.02MB   | 0.13MB   | InnoDB |
| 40  | user_premium_status                  | 1      | 0.02MB   | 0.06MB   | InnoDB |
| 41  | user_roles                           | 13     | 0.02MB   | 0.06MB   | InnoDB |
| 42  | user_roles_backup_20251009           | 16     | 0.02MB   | 0.00MB   | InnoDB |
| 43  | users                                | 22     | 0.02MB   | 0.08MB   | InnoDB |
| 44  | websocket_startup_logs               | 486    | 0.06MB   | 0.06MB   | InnoDB |

## 备份完整性

✅ **所有表备份成功，备份完整**

## 使用说明

### 恢复SQL备份

```bash
mysql -hdbconn.sealosbja.site -P42569 -uroot -p restaurant_points_dev < full_backup_2025-12-19_2025-12-19_15-43-47-055+.sql
```

### 恢复JSON备份

```bash
node scripts/database/backup-toolkit.js --action=restore --file=backups/backup_2025-12-19/full_backup_2025-12-19_2025-12-19_15-43-47-055+.json
```

## 校验完整性

备份完成后请验证MD5：

```bash
md5sum full_backup_2025-12-19_2025-12-19_15-43-47-055+.sql
md5sum full_backup_2025-12-19_2025-12-19_15-43-47-055+.json
```

## 备份特点

1. ✅ **完整性**: 包含所有44个表（包括空表）
2. ✅ **结构完整**: 包含表结构、索引、外键约束
3. ✅ **数据完整**: 包含所有4864行数据记录
4. ✅ **双格式**: SQL和JSON双格式，方便不同场景使用
5. ✅ **校验和**: MD5校验确保数据完整性
6. ✅ **版本兼容**: 记录MySQL版本和字符集信息

---

**生成工具**: create-full-backup-20251219.js  
**生成时间**: 2025/12/19 23:43:47  
**备份质量**: ✅ 完整备份
