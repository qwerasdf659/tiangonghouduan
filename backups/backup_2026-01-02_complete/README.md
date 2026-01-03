# 数据库完整备份 - 2026年01月02日

## 📦 备份概述

本目录包含2026年01月02日23:24:05（北京时间）的完整数据库备份。

- **数据库名称**: restaurant_points_dev
- **备份时间**: 2026/01/02 23:24:05（北京时间）
- **总表数**: 45个
- **总数据行数**: 7,686行
- **备份格式**: SQL + JSON 双格式

## 📁 文件清单

| 文件名                                   | 大小   | 说明             | MD5校验                          |
| ---------------------------------------- | ------ | ---------------- | -------------------------------- |
| complete_backup_2026-01-02_23-24-05.sql  | 4.0 MB | SQL格式完整备份  | c7b37ad30c5b4ebe9d58e56fdfdadd74 |
| complete_backup_2026-01-02_23-24-05.json | 5.9 MB | JSON格式完整备份 | 98da96243cf91cd15cd5dd7e047a120c |
| BACKUP_MD5.txt                           | 163 B  | MD5校验文件      | -                                |
| BACKUP_SUMMARY.txt                       | 3.5 KB | 备份摘要         | -                                |
| BACKUP_VERIFICATION_REPORT.md            | 9.5 KB | 验证报告         | -                                |
| README.md                                | 本文件 | 说明文档         | -                                |

## ✅ 备份内容

### 表结构

- ✅ 所有45个表的完整CREATE TABLE语句
- ✅ 所有列定义（类型、长度、约束、默认值）
- ✅ 所有索引（PRIMARY KEY, UNIQUE, INDEX）
- ✅ 所有外键约束（FOREIGN KEY）

### 表数据

- ✅ 35个有数据的表，共7,686行数据
- ✅ 10个空表的完整结构

### 数据库设置

- ✅ 字符集: utf8mb4
- ✅ 时区: +08:00（北京时间）
- ✅ 外键约束控制
- ✅ SQL_MODE设置

## 🔄 恢复方法

### 方法1: 使用MySQL命令行恢复

```bash
# 完整恢复（会删除现有数据）
mysql -hdbconn.sealosbja.site -P42569 -uroot -p restaurant_points_dev < complete_backup_2026-01-02_23-24-05.sql

# 恢复到新数据库
mysql -hdbconn.sealosbja.site -P42569 -uroot -p -e "CREATE DATABASE IF NOT EXISTS restaurant_points_dev_restore CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;"
mysql -hdbconn.sealosbja.site -P42569 -uroot -p restaurant_points_dev_restore < complete_backup_2026-01-02_23-24-05.sql
```

### 方法2: 使用Node.js恢复（如果有恢复脚本）

```bash
node scripts/restore_backup.js complete_backup_2026-01-02_23-24-05.sql
```

## 🔍 验证恢复结果

### 1. 验证表数量

```sql
USE restaurant_points_dev;
SHOW TABLES;
-- 应该返回45个表
```

### 2. 验证数据行数

```sql
-- 验证关键表的数据行数
SELECT COUNT(*) FROM users;              -- 应该是 22
SELECT COUNT(*) FROM lottery_draws;      -- 应该是 2840
SELECT COUNT(*) FROM item_instances;     -- 应该是 1150
SELECT COUNT(*) FROM admin_operation_logs; -- 应该是 1002
```

### 3. 验证表结构

```sql
-- 查看表结构（包含索引和外键）
SHOW CREATE TABLE users;
SHOW CREATE TABLE item_instances;
```

### 4. 验证字符集和时区

```sql
SHOW VARIABLES LIKE 'character_set%';
SHOW VARIABLES LIKE 'time_zone';
```

## 📊 备份统计

### 表分类统计

- **用户相关**: 6个表（users, user_roles, accounts等）
- **抽奖系统**: 7个表（lottery_campaigns, lottery_draws等）
- **物品系统**: 3个表（item_instances, item_instance_events等）
- **资产系统**: 4个表（account_asset_balances, asset_transactions等）
- **交易系统**: 4个表（market_listings, trade_records等）
- **商品系统**: 3个表（products, exchange_items等）
- **客服系统**: 3个表（customer_service_sessions, chat_messages等）
- **系统管理**: 6个表（roles, admin_operation_logs等）
- **技术表**: 9个表（sequelizemeta, api_idempotency_requests等）

### 数据量统计

- **最大表**: lottery_draws (2,840行)
- **次大表**: item_instances (1,150行)
- **第三大**: admin_operation_logs (1,002行)
- **空表数量**: 10个

## ⚠️ 重要提示

### 恢复前注意事项

1. **数据备份**: 恢复前请先备份当前数据库
2. **停止服务**: 建议停止应用服务后再恢复
3. **权限检查**: 确保MySQL用户有足够的权限
4. **空间检查**: 确保有足够的磁盘空间

### 恢复后检查

1. 验证表数量和数据行数
2. 检查外键约束是否正常
3. 验证应用程序连接是否正常
4. 测试关键功能是否正常

## 🔐 安全建议

1. **访问控制**: 限制备份文件的访问权限
2. **加密传输**: 传输备份文件时使用加密通道
3. **定期验证**: 定期验证备份文件的完整性
4. **异地备份**: 将备份文件复制到异地存储

## 📞 支持信息

如果在恢复过程中遇到问题，请：

1. 查看 BACKUP_VERIFICATION_REPORT.md 了解详细信息
2. 检查 BACKUP_MD5.txt 验证文件完整性
3. 查看 BACKUP_SUMMARY.txt 了解备份统计

---

**备份创建时间**: 2026年01月02日 23:24:05（北京时间）  
**备份工具版本**: backup-2025-12-31.js  
**数据库版本**: MySQL 5.7/8.0 兼容  
**字符集**: utf8mb4  
**时区**: Asia/Shanghai (+08:00)
