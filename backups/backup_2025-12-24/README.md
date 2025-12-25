# 数据库完整备份 - 2025年12月24日

## 📋 备份概述

本备份包含了 `restaurant_points_dev` 数据库在 **2025年12月24日** 的完整快照，包括所有表结构、数据、索引和外键约束。

## 📁 备份文件清单

### 1. SQL备份文件

- **文件名**: `full_backup_2025-12-24_2025-12-23T23-22-14.sql`
- **大小**: 1.48 MB
- **格式**: MySQL SQL语句
- **内容**:
  - 完整的 CREATE TABLE 语句（包含所有字段定义）
  - 所有表的 INSERT 数据语句
  - 主键、索引和外键约束定义
  - 字符集和引擎配置

### 2. JSON备份文件

- **文件名**: `full_backup_2025-12-24_2025-12-23T23-22-14.json`
- **大小**: 4.39 MB
- **格式**: JSON格式
- **内容**:
  - 所有表的完整数据
  - 便于程序读取和处理
  - 可用于数据分析和迁移

### 3. 验证文件

- **BACKUP_MD5_2025-12-24.txt**: 备份文件的MD5校验和
- **BACKUP_VERIFICATION_REPORT.md**: 详细的验证报告
- **BACKUP_SUMMARY.txt**: 备份汇总信息

## 📊 备份数据统计

### 数据库信息

- **数据库名称**: restaurant_points_dev
- **数据库主机**: dbconn.sealosbja.site:42569
- **备份时间**: 2025-12-23T23:22:14Z
- **环境**: development

### 数据量统计

- **总表数**: 43 个
- **总数据行数**: 7,040 行
- **数据库大小**: ~6 MB

### 主要数据表

| 表名                        | 行数  | 说明              |
| --------------------------- | ----- | ----------------- |
| lottery_draws               | 2,907 | 抽奖记录          |
| admin_operation_logs        | 932   | 管理员操作日志    |
| asset_transactions          | 857   | 资产交易记录      |
| websocket_startup_logs      | 691   | WebSocket启动日志 |
| item_instances              | 580   | 物品实例          |
| redemption_orders           | 253   | 兑换订单          |
| sequelizemeta               | 178   | 数据库迁移记录    |
| lottery_management_settings | 153   | 抽奖管理设置      |
| consumption_records         | 127   | 消费记录          |
| content_review_records      | 127   | 内容审核记录      |

### 空表（已备份表结构）

- audit_records
- authentication_sessions
- chat_messages
- exchange_records
- lottery_user_daily_draw_quota
- popup_banners
- role_change_logs
- stores
- trade_orders
- user_hierarchy

## ✅ 备份完整性验证

### 验证结果

- ✅ 所有 43 个表都已完整备份
- ✅ 数据行数与当前数据库完全一致
- ✅ 所有表结构（包含空表）都已备份
- ✅ 主键、索引和外键约束完整
- ✅ 字段定义和数据类型完整
- ✅ 备份文件完整性已通过MD5验证

### 备份质量评级

**A+ (优秀)** - 备份完整、准确、可用于生产恢复

## 🔄 如何使用备份

### 方法1: 使用SQL文件恢复（推荐）

```bash
# 完整恢复到新数据库
mysql -h dbconn.sealosbja.site -P 42569 -u your_user -p new_database < full_backup_2025-12-24_2025-12-23T23-22-14.sql

# 恢复到现有数据库（会删除现有数据）
mysql -h dbconn.sealosbja.site -P 42569 -u your_user -p restaurant_points_dev < full_backup_2025-12-24_2025-12-23T23-22-14.sql
```

### 方法2: 使用JSON文件（程序化恢复）

```javascript
const fs = require('fs')
const backupData = JSON.parse(
  fs.readFileSync('full_backup_2025-12-24_2025-12-23T23-22-14.json', 'utf8')
)

// 逐表恢复数据
for (const [tableName, rows] of Object.entries(backupData)) {
  if (rows.length > 0) {
    await Model[tableName].bulkCreate(rows, {
      ignoreDuplicates: true,
      validate: false
    })
  }
}
```

### 方法3: 选择性恢复单个表

```bash
# 从SQL文件中提取单个表的数据
sed -n '/-- 表: users/,/-- 表: /p' full_backup_2025-12-24_2025-12-23T23-22-14.sql > users_only.sql

# 恢复单个表
mysql -h dbconn.sealosbja.site -P 42569 -u your_user -p restaurant_points_dev < users_only.sql
```

## 🔐 安全注意事项

1. **敏感数据保护**
   - 备份包含用户数据、密码哈希等敏感信息
   - 请妥善保管，不要上传到公共仓库
   - 建议加密存储

2. **访问控制**
   - 仅授权人员可访问备份文件
   - 定期审计备份文件访问记录

3. **版本兼容性**
   - MySQL版本: 5.7+ 或 8.0+
   - Sequelize版本: 6.x
   - Node.js版本: 14.x+

## 📝 备份文件完整性验证

### 验证MD5校验和

```bash
# 验证SQL文件
md5sum -c BACKUP_MD5_2025-12-24.txt

# 预期输出:
# full_backup_2025-12-24_2025-12-23T23-22-14.sql: OK
# full_backup_2025-12-24_2025-12-23T23-22-14.json: OK
```

### 验证SQL文件语法

```bash
# 检查SQL语法
mysql -h dbconn.sealosbja.site -P 42569 -u your_user -p --execute="source full_backup_2025-12-24_2025-12-23T23-22-14.sql" --dry-run
```

## 📞 支持信息

如果在使用备份过程中遇到问题，请检查：

1. **BACKUP_VERIFICATION_REPORT.md** - 详细的验证报告
2. **BACKUP_SUMMARY.txt** - 备份汇总信息
3. 数据库连接配置是否正确
4. MySQL版本是否兼容

## 📅 备份历史

本备份是 2025年12月24日 的完整快照，与以下备份相关：

- 上一次备份: 2025-12-19
- 下一次备份: 建议 2025-12-31

## ⚠️ 重要提醒

1. **恢复前备份**: 在恢复备份前，请先备份当前数据库
2. **测试恢复**: 建议先在测试环境验证恢复过程
3. **停止服务**: 恢复数据时建议停止应用服务
4. **验证数据**: 恢复后请验证数据完整性和应用功能

---

**备份创建时间**: 2025-12-23T23:22:14Z  
**备份创建者**: 自动备份系统  
**备份版本**: V1.0  
**备份状态**: ✅ 已验证完整
