# 数据库备份 - 2025年11月04日

## 📦 备份文件说明

本文件夹包含 restaurant_points_dev 数据库的完整备份。

### 文件列表

1. **full_backup_2025-11-04_22-43-35.sql** (1060.67 KB)
   - 完整的SQL格式备份
   - 包含所有表结构、数据、索引、外键约束
   - 可直接使用mysql命令恢复

2. **full_backup_2025-11-04_22-43-35.json** (1462.72 KB)
   - JSON格式的完整数据备份
   - 便于程序化处理和分析
   - 包含表结构和数据的详细信息

3. **BACKUP_MD5_2025-11-04.txt**
   - 备份文件的MD5校验值
   - 用于验证文件完整性

4. **BACKUP_REPORT_2025-11-04.md**
   - 详细的备份报告
   - 包含统计信息和表清单

5. **BACKUP_VERIFICATION_REPORT.md**
   - 备份验证报告
   - 确认备份的完整性和正确性

## 📊 备份概况

- **备份时间**: 2025年11月04日 22:43:35 (北京时间GMT+8)
- **数据库**: restaurant_points_dev
- **总表数**: 26个
- **总记录数**: 1919条
- **备份类型**: 完整备份（结构+数据）

## 🔄 快速恢复

### 使用SQL文件恢复
```bash
mysql -h dbconn.sealosbja.site -P 42569 -u root -p restaurant_points_dev < full_backup_2025-11-04_22-43-35.sql
```

### 验证备份文件完整性
```bash
md5sum -c BACKUP_MD5_2025-11-04.txt
```

## 📋 数据库表清单

### 有数据的表（19个）
- chat_messages (326条)
- consumption_records (12条)
- content_review_records (12条)
- customer_service_sessions (40条)
- image_resources (3条)
- lottery_campaigns (1条)
- lottery_draws (1308条)
- lottery_presets (1条)
- lottery_prizes (9条)
- points_transactions (73条)
- products (4条)
- roles (3条)
- sequelizemeta (87条)
- system_announcements (1条)
- user_points_accounts (1条)
- user_premium_status (1条)
- user_roles (11条)
- user_roles_backup_20251009 (16条)
- users (10条)

### 空表（已备份表结构，7个）
- admin_operation_logs
- audit_records
- authentication_sessions
- exchange_records
- feedbacks
- trade_records
- user_inventory

## ⚠️ 重要提示

1. 备份文件包含敏感数据，请妥善保管
2. 恢复前请先备份当前数据库
3. 确认MySQL版本兼容性 (需要5.7+)
4. 字符集: utf8mb4
5. 时区: Asia/Shanghai (GMT+8)

## 📞 技术支持

如遇到恢复问题，请参考 BACKUP_REPORT_2025-11-04.md 中的详细说明。
