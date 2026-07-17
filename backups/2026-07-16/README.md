# 数据库完整备份 - 2026-07-16（北京时间）

## 备份信息
- 备份日期（北京时间）: 2026-07-16
- 数据库: restaurant_points_dev
- 主机: test-db-12-mysql.ns-br0za7uc.svc:3306
- 数据库版本: MySQL 8.0.30
- 字符集: utf8mb4 / utf8mb4_unicode_ci

## 备份内容
- 完整的表结构（CREATE TABLE 语句，含索引与外键约束）
- 所有表的数据（包括 53 张空表，空表导出为 `[]`）
- 存储过程 / 事件 / 触发器（--routines --events --triggers）
- 索引、外键、约束、列、行数等元数据

## 目录结构
```
2026-07-16/
├── sql/
│   ├── full_database_backup.sql   # 全库备份（结构+数据+routines/events/triggers）
│   ├── schema_only_backup.sql     # 仅结构备份（135 张 CREATE TABLE）
│   └── tables/                    # 逐表 SQL（135 个）
├── json/                          # 逐表 JSON 数据（135 个，北京墙钟时间）
└── meta/
    ├── all_columns.txt            # 全部列定义
    ├── all_indexes.txt            # 全部索引
    ├── all_foreign_keys.txt       # 全部外键（223 个）
    ├── all_constraints.txt        # 全部约束
    ├── table_statistics.txt       # 表统计
    ├── exact_row_counts.txt       # 精确行数（逐表 COUNT）
    ├── database_variables.txt     # 版本/字符集/排序规则
    ├── CHECKSUMS_MD5.txt          # 279 个文件的 MD5 校验和
    └── verification_report.json   # 完整性验证报告
```

## 备份统计
- 表数量: 135
- 总行数: 61529
- 空表数: 53
- 外键约束: 223
- 校验文件数: 279（md5sum -c 零失败）

## 恢复方法

### SQL 恢复（全库）
```bash
mysql -h主机 -P3306 -u用户名 -p 数据库名 < sql/full_database_backup.sql
```

### 单表恢复
```bash
mysql -h主机 -P3306 -u用户名 -p 数据库名 < sql/tables/表名.sql
```

## 验证备份
```bash
cd backups/2026-07-16/meta
md5sum -c CHECKSUMS_MD5.txt
```

---
本备份完全反映备份时刻的真实数据库（表数量、结构、数据、字段、索引、外键约束、版本兼容性均一致）。
