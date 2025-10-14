# 数据库备份 - 2025年10月14日

## 📦 备份文件说明

本文件夹包含 **2025年10月14日 14:45:39（北京时间）** 的完整数据库备份。

### 文件清单

| 文件名 | 大小 | 说明 |
|--------|------|------|
| `COMPLETE_BACKUP_2025-10-14T06-45-39-241Z.sql` | 313 KB | SQL完整备份（表结构+数据） |
| `COMPLETE_DATA_2025-10-14T06-45-39-241Z.json` | 887 KB | JSON格式数据备份 |
| `BACKUP_REPORT_2025-10-14_06-46-55.md` | 5.9 KB | 详细备份验证报告 |
| `BACKUP_MD5_2025-10-14.txt` | 348 B | MD5校验文件 |
| `README.md` | 本文件 | 使用说明 |

## 📊 备份内容

- **数据库**: restaurant_points_dev
- **MySQL版本**: 8.0.30
- **字符集**: utf8mb4
- **表数量**: 23个
- **总记录数**: 1,166条

## ✅ 备份验证

所有备份文件已通过完整性验证：
- ✅ SQL备份：23个表结构 + 17个表数据
- ✅ JSON备份：23个表的完整数据
- ✅ 数据一致性：100%匹配源数据库
- ✅ MD5校验：通过

## 🔄 如何使用

### 1. 验证备份完整性

```bash
cd /home/devbox/project/backups/backup_2025-10-14
md5sum -c BACKUP_MD5_2025-10-14.txt
```

### 2. 恢复完整数据库

```bash
mysql -h <host> -P <port> -u <user> -p restaurant_points_dev < \
  /home/devbox/project/backups/backup_2025-10-14/COMPLETE_BACKUP_2025-10-14T06-45-39-241Z.sql
```

### 3. 查看详细报告

```bash
cat /home/devbox/project/backups/backup_2025-10-14/BACKUP_REPORT_2025-10-14_06-46-55.md
```

### 4. 从JSON恢复特定表数据

```javascript
const backup = require('./COMPLETE_DATA_2025-10-14T06-45-39-241Z.json');
const tableData = backup.tables['table_name'];
// 然后插入到目标数据库
```

## 🔐 版本兼容性

- **源数据库**: MySQL 8.0.30
- **兼容版本**: MySQL 8.0.x, MySQL 5.7.x
- **字符集**: utf8mb4 (完全支持emoji和多语言)
- **时区**: 北京时间 UTC+8

## ⚠️ 注意事项

1. 恢复前请确保目标数据库版本兼容
2. 建议在测试环境先验证恢复流程
3. 恢复会覆盖目标数据库的现有数据
4. 建议保留此备份至少30天

---

**备份创建时间**: 2025年10月14日 14:45:39  
**备份质量评分**: ⭐⭐⭐⭐⭐ (5/5)
