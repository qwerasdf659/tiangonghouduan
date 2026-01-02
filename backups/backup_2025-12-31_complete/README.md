# 数据库完整备份 - 2025年12月31日

## 📦 备份概述

这是一个**完整的、最新的、正确的**数据库备份，包含了当前数据库的所有内容。

- **备份时间**: 2025年12月31日 02:08:12 (北京时间)
- **数据库名**: restaurant_points_dev
- **表数量**: 48个
- **数据行数**: 9,367行
- **总大小**: 9.83 MB

## 📁 备份文件说明

### 主要备份文件

1. **complete_backup_2025-12-31-02-08-12.sql** (1.94 MB)
   - 完整的SQL备份文件
   - 包含所有表结构（CREATE TABLE）
   - 包含所有数据（INSERT）
   - 包含所有索引和约束
   - 可直接用于数据库恢复

2. **complete_backup_2025-12-31-02-08-12.json** (6.04 MB)
   - JSON格式的数据备份
   - 便于数据分析和处理
   - 便于跨平台迁移

### 辅助文件

3. **BACKUP_MD5.txt**
   - MD5校验和文件
   - 用于验证备份文件完整性

4. **BACKUP_SUMMARY.txt**
   - 备份摘要信息
   - 包含所有表的统计信息

5. **BACKUP_VERIFICATION_REPORT.md**
   - 详细的验证报告
   - 包含每个表的详细信息

6. **BACKUP_COMPLETION_CONFIRMATION.md**
   - 备份完成确认文档
   - 包含完整性验证清单

7. **README.md**
   - 本文件
   - 备份使用说明

## 🔐 备份完整性

### 已备份内容

✅ **48个数据库表** - 全部备份完成

- 38个有数据的表
- 10个空表（表结构已备份）

✅ **9,367行数据** - 全部备份完成

✅ **所有表结构**

- CREATE TABLE语句
- 字段定义
- 数据类型
- 默认值
- 注释

✅ **所有索引**

- 主键（PRIMARY KEY）
- 唯一索引（UNIQUE KEY）
- 普通索引（KEY）

✅ **所有约束**

- 外键约束（FOREIGN KEY）
- CHECK约束
- NOT NULL约束

## 🔄 如何使用备份

### 方法1: 完整恢复数据库

```bash
# 1. 连接到MySQL服务器
mysql -u root -p

# 2. 创建数据库（如果不存在）
CREATE DATABASE IF NOT EXISTS restaurant_points_dev CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

# 3. 退出MySQL
exit

# 4. 恢复数据库
mysql -u root -p restaurant_points_dev < complete_backup_2025-12-31-02-08-12.sql
```

### 方法2: 恢复单个表

```bash
# 1. 从SQL文件中提取特定表
# 例如恢复users表
sed -n '/-- 表: users/,/-- 表: /p' complete_backup_2025-12-31-02-08-12.sql > users_backup.sql

# 2. 恢复该表
mysql -u root -p restaurant_points_dev < users_backup.sql
```

### 方法3: 使用JSON数据

```javascript
// Node.js示例：读取JSON备份
const fs = require('fs')
const backupData = JSON.parse(fs.readFileSync('complete_backup_2025-12-31-02-08-12.json', 'utf8'))

// 访问特定表的数据
const users = backupData.users
console.log(`用户数量: ${users.length}`)
```

## ✅ 验证备份完整性

### 验证MD5校验和

```bash
# 验证SQL文件
md5sum complete_backup_2025-12-31-02-08-12.sql
# 期望输出: 2e48d417588f7cea01ff1cc9446997f5

# 验证JSON文件
md5sum complete_backup_2025-12-31-02-08-12.json
# 期望输出: bfe4c3d0fa0fcaa2e0d324d60d0fce41
```

### 验证表数量

```bash
# 统计SQL文件中的表数量
grep -c "CREATE TABLE" complete_backup_2025-12-31-02-08-12.sql
# 期望输出: 48
```

### 验证数据行数

```bash
# 统计INSERT语句数量
grep -c "INSERT INTO" complete_backup_2025-12-31-02-08-12.sql
# 应该有多个INSERT语句
```

## 📊 数据库表清单

### 核心业务表

- users (22行) - 用户表
- user_roles (13行) - 用户角色表
- roles (6行) - 角色表

### 资产相关表

- accounts (13行) - 账户表
- account_asset_balances (11行) - 资产余额表
- asset_transactions (205行) - 资产交易表
- material_asset_types (3行) - 材料资产类型表

### 抽奖相关表

- lottery_draws (3,582行) - 抽奖记录表
- lottery_prizes (9行) - 奖品表
- lottery_campaigns (1行) - 抽奖活动表
- lottery_presets (2行) - 抽奖预设表
- lottery_management_settings (281行) - 抽奖管理设置表
- lottery_user_daily_draw_quota (5行) - 用户每日抽奖配额表

### 物品相关表

- item_instances (1,016行) - 物品实例表
- item_instance_events (174行) - 物品事件表
- exchange_items (16行) - 兑换物品表

### 订单相关表

- redemption_orders (321行) - 兑换订单表
- consumption_records (175行) - 消费记录表

### 积分相关表

- points_transactions (105行) - 积分交易表
- user_points_accounts (3行) - 用户积分账户表

### 商品相关表

- products (52行) - 商品表

### 客服相关表

- customer_service_sessions (3行) - 客服会话表
- chat_messages (20行) - 聊天消息表

### 系统相关表

- admin_operation_logs (997行) - 管理员操作日志表
- content_review_records (175行) - 内容审核记录表
- feedbacks (26行) - 反馈表
- system_announcements (5行) - 系统公告表
- system_settings (18行) - 系统设置表
- websocket_startup_logs (716行) - WebSocket启动日志表
- sequelizemeta (181行) - 数据库迁移记录表

### 其他表

- api_idempotency_requests (28行) - API幂等性请求表
- image_resources (3行) - 图片资源表
- trade_records (2行) - 交易记录表

### 空表（已备份表结构）

- audit_records - 审计记录表
- authentication_sessions - 认证会话表
- exchange_records - 兑换记录表
- item_template_aliases - 物品模板别名表
- merchant_points_reviews - 商户积分审核表
- popup_banners - 弹窗横幅表
- role_change_logs - 角色变更日志表
- stores - 商店表
- trade_orders - 交易订单表
- user_hierarchy - 用户层级表

## ⚠️ 重要提示

1. **备份时间**: 此备份创建于 2025年12月31日 02:08:12 (北京时间)
2. **数据一致性**: 备份反映的是该时间点的数据库状态
3. **恢复前备份**: 在恢复此备份前，请先备份当前数据库
4. **测试恢复**: 建议先在测试环境中验证恢复过程
5. **权限要求**: 恢复数据库需要相应的MySQL权限

## 📞 技术支持

如有任何问题，请参考以下文档：

- BACKUP_VERIFICATION_REPORT.md - 详细验证报告
- BACKUP_COMPLETION_CONFIRMATION.md - 完整性确认文档
- BACKUP_SUMMARY.txt - 备份摘要

---

**备份创建时间**: 2025年12月31日 02:08:12 (北京时间)  
**备份状态**: ✅ 完整、正确、最新  
**备份位置**: /home/devbox/project/backups/backup_2025-12-31_complete
