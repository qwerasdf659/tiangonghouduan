# 数据库迁移管理 V2.0.0

## ✅ 已拍板决策（2026-01-04）

**迁移治理策略**: 建立权威 baseline（基线）

**执行方案**:
- ✅ 以当前数据库 schema 为基准，生成权威 baseline 迁移
- ✅ 未来只认 baseline + 后续增量迁移
- ✅ 缺失的 89 条历史迁移：**不补齐**，仅作存档记录
- ✅ baseline 之前的 197 条迁移：不再用于新环境重放，转为审计存档

**决策理由**:
- 最稳健：适合"DB 已演进很久但仓库迁移不齐"的现状
- 新环境部署清晰：只需执行 baseline + 增量迁移
- 避免历史包袱：不需要追溯和补齐已缺失的迁移文件
- 审计可追溯：历史迁移存档，需要时可查阅

---

## 📌 基准版本

- **版本**: V2.0.0
- **创建时间**: 2026年01月04日
- **基准迁移**: `20260104000000-baseline-v2.0.0-from-production.js`
- **表数量**: 44个业务表
- **数据来源**: restaurant_points_dev 生产数据库 schema

---

## 🚀 迁移执行策略

### 现有环境（已有 197 条迁移记录）
- 执行策略：跳过 baseline，只执行增量迁移
- 命令：`npm run db:migrate`

### 新环境（全新数据库）
- 执行策略：执行 baseline + 增量迁移
- 命令：
  1. `npx sequelize-cli db:migrate --to 20260104000000-baseline-v2.0.0-from-production.js`
  2. `npm run db:migrate`

---

## 📋 目录说明

```
migrations/
├── README.md                                          # 本文件 - 迁移策略文档
├── 20260104000000-baseline-v2.0.0-from-production.js  # 权威基线迁移（44张表）
├── *.js                                               # 当前可执行的增量迁移（91个）
└── legacy/                                            # 历史迁移存档（仅供审计）
    ├── HISTORICAL_MIGRATIONS.md                       # 历史迁移清单（197条）
    ├── TIMESTAMP_CONFLICTS.md                         # 时间戳冲突记录（3组）
    ├── NAMING_ISSUES.md                               # 命名不规范记录（1个）
    └── archived/                                      # 已归档迁移文件（18个，DB仍有记录）
```

---

## ⚠️ 迁移创建规范（强制执行 - 2026-01-04拍板）

### ✅ 唯一允许方式
- 使用 `npm run migration:create` 创建迁移
- 使用 queryInterface API 编写迁移逻辑
- 提供完整的 up 和 down 方法
- 通过 `npm run db:migrate` 执行

### ❌ 严格禁止（违者回滚代码）
- ~~创建 migrations/manual/ 目录~~（已删除，已加入 .gitignore）
- ~~编写 .sql 脚本文件放在任何位置~~
- ~~手动执行 SQL 而不记录到 sequelizemeta~~
- ~~绕过迁移系统直接修改数据库结构~~

### 紧急修复流程（无例外）
1. **所有数据库变更必须走标准迁移**（包括紧急修复）
2. 如果紧急需要修复，创建标准迁移并立即执行
3. 不允许"先手动修复，事后补迁移"的流程
4. 违反规范的代码不予合并

---

## 🛠️ 快速命令

### 创建新迁移
```bash
npm run migration:create
```

### 执行迁移
```bash
npm run migration:up
# 或
npm run db:migrate
```

### 回滚迁移
```bash
npm run migration:down
# 或
npm run db:migrate:undo
```

### 查看状态
```bash
npm run migration:status
```

### 验证规范
```bash
npm run migration:verify
```

---

## 📋 迁移文件命名规范

### 文件命名格式
```
{YYYYMMDD}{HHMMSS}-{action}-{target}.js

示例:
✅ 20260105120530-create-table-promotions.js
✅ 20260105153245-add-column-users-vip-level.js
✅ 20260105094512-alter-index-lottery-draws-status.js

❌ 20260105_add_column_xxx.js  # 使用下划线而非连字符
```

### 允许的Action类型（15种）

**表操作**:
- `create-table` - 创建新表
- `alter-table` - 修改表结构
- `drop-table` - 删除表
- `rename-table` - 重命名表

**列操作**:
- `add-column` - 添加列
- `alter-column` - 修改列
- `drop-column` - 删除列
- `rename-column` - 重命名列

**索引操作**:
- `create-index` - 创建索引
- `alter-index` - 修改索引
- `drop-index` - 删除索引

**约束操作**:
- `add-constraint` - 添加约束
- `drop-constraint` - 删除约束

**数据操作**:
- `migrate-data` - 数据迁移
- `seed-data` - 初始数据

### ❌ 禁止使用
- `fix` - 不应该有修复迁移（设计应该避免）
- `temp` - 不应该有临时迁移
- `test` - 不应该提交测试迁移
- `update/change/modify` - 太模糊，使用明确的action

---

## 🔍 迁移记录

- 数据库表：`sequelizemeta`
- 当前记录数：197（历史存档）
- 基线版本：V2.0.0（2026-01-04）
- 顶层迁移文件：91 个
- 缺失迁移：89 条（不补齐，已知悉）

---

## 💡 最佳实践

### ✅ 推荐做法
1. 始终使用 `npm run migration:create` 创建迁移
2. 先在开发环境测试
3. 编写完整的up和down方法
4. 添加清晰的注释说明
5. 执行前备份数据

### ❌ 避免做法
1. 不要手动创建迁移文件
2. 不要修改已执行的迁移
3. 不要跳过验证步骤
4. 不要使用fix/temp/test命名
5. 不要在生产环境直接测试
6. 不要创建manual/目录或.sql文件

---

**版本**: V2.0.0
**最后更新**: 2026年01月04日
**决策时间**: 2026年01月04日
**维护者**: Database Team
