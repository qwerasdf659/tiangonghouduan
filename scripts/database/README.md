# 数据库迁移管理工具使用指南

## 📚 目录

- [工具简介](#工具简介)
- [快速开始](#快速开始)
- [工具详解](#工具详解)
- [使用示例](#使用示例)
- [常见问题](#常见问题)
- [规范说明](#规范说明)

---

## 工具简介

本目录以 **`migration_toolkit.js`** 为统一入口（合并了历史上的 `create-migration.js` / `verify-migrations.js` 能力），与 `package.json` 中脚本一致。基线压测（Baseline Squash）之后，历史迁移脚本不再放在已废弃的 `migrations/legacy/`，而统一归档在 **`migrations/archived/`**（按日期分子目录）；日常开发与校验仅针对 **`migrations/`** 根目录下的活跃迁移文件。

### 1️⃣ `migration_toolkit.js` — 创建 + 验证 + 可选同步/状态

**用途**: 强制迁移命名与结构规范；`npm run migration:create` / `migration:verify` / `migration:up` 均依赖此文件。

**创建迁移**（`npm run migration:create` 或 `node scripts/database/migration_toolkit.js create`）:
- ✅ 规范文件名（时间戳-action-target）
- ✅ 15 种操作类型模板
- ✅ 交互式引导

**验证**（`npm run migration:verify` 或 `… verify`）:
- ✅ 文件名、action、禁止 fix/temp/test 等弱命名
- ✅ 与 `migrations/` 目录一致性检查

**其他本目录脚本**（按需直接调用）:
- `database_toolkit.js` — `npm run db:check` 等
- `validation_toolkit.js` — `npm run db:validate`
- `complete_backup.js` — 备份流程（非日常迁移前置）

---

## 快速开始

### 创建一个新的迁移文件

```bash
# 方式1: 使用npm脚本（推荐）
npm run migration:create

# 方式2: 直接执行
node scripts/database/migration_toolkit.js create
```

### 验证所有迁移文件

```bash
# 方式1: 使用npm脚本
npm run migration:verify

# 方式2: 直接调用工具包
node scripts/database/migration_toolkit.js verify

# 方式3: 自动验证（每次 npm start 前）
npm start  # 自动执行 prestart hook
```

### 执行迁移

```bash
# 执行迁移（会先自动验证）
npm run migration:up

# 回滚最后一次迁移
npm run migration:down

# 查看迁移状态
npm run migration:status
```

---

## 工具详解

### migration_toolkit.js（create 子命令）详细说明

#### 交互式创建流程

1. **选择操作类型**（15种）:
   ```
   表操作:
     1.  创建新表         (create-table)
     2.  修改表结构       (alter-table)
     3.  删除表          (drop-table)
     4.  重命名表        (rename-table)
   
   列操作:
     5.  添加列          (add-column)
     6.  修改列          (alter-column)
     7.  删除列          (drop-column)
     8.  重命名列        (rename-column)
   
   索引操作:
     9.  创建索引        (create-index)
     10. 修改索引        (alter-index)
     11. 删除索引        (drop-index)
   
   约束操作:
     12. 添加约束        (add-constraint)
     13. 删除约束        (drop-constraint)
   
   数据操作:
     14. 数据迁移        (migrate-data)
     15. 初始化数据      (seed-data)
   ```

2. **输入目标名称**:
   - 命名规则: 小写字母开头，只能包含小写字母、数字、连字符
   - 示例: `users`, `user-vip-level`, `lottery-campaigns`

3. **说明创建原因**:
   - 至少5个字符
   - 说明为什么需要这个迁移

4. **自动生成文件**:
   - 文件名格式: `{YYYYMMDD}{HHMMSS}-{action}-{target}.js`
   - 示例: `20251012120000-add-column-users-vip-level.js`

5. **自动更新 VERSION.js**:
   - 更新 `lastMigration`
   - 更新 `lastUpdated`

#### 生成的模板示例

##### 1. 创建表模板

```javascript
/**
 * 创建表: users
 * 
 * 创建时间: 2025-10-12T12:00:00.000Z
 * 创建原因: 创建用户基础表
 * 作者: developer
 */

module.exports = {
  up: async (queryInterface, Sequelize) => {
    await queryInterface.createTable('users', {
      id: {
        type: Sequelize.INTEGER,
        primaryKey: true,
        autoIncrement: true,
        comment: '主键ID'
      },
      // TODO: 添加其他字段
      
      created_at: {
        type: Sequelize.DATE,
        allowNull: false,
        defaultValue: Sequelize.literal('CURRENT_TIMESTAMP'),
        comment: '创建时间'
      },
      updated_at: {
        type: Sequelize.DATE,
        allowNull: false,
        defaultValue: Sequelize.literal('CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP'),
        comment: '更新时间'
      }
    })
    
    console.log('✅ 表 users 创建成功')
  },
  
  down: async (queryInterface, Sequelize) => {
    await queryInterface.dropTable('users')
    console.log('✅ 表 users 已删除')
  }
}
```

##### 2. 添加列模板

```javascript
module.exports = {
  up: async (queryInterface, Sequelize) => {
    await queryInterface.addColumn('users', 'vip_level', {
      type: Sequelize.STRING(100),
      allowNull: true,
      defaultValue: null,
      comment: 'VIP等级'
    })
    
    console.log('✅ 列 vip_level 已添加到表 users')
  },
  
  down: async (queryInterface, Sequelize) => {
    await queryInterface.removeColumn('users', 'vip_level')
    console.log('✅ 列 vip_level 已删除')
  }
}
```

---

### migration_toolkit.js（verify 子命令）详细说明

#### 验证规则

1. **文件名格式验证**:
   ```javascript
   // ✅ 正确格式
   20251012120000-create-table-users.js
   20251012130000-add-column-users-vip-level.js
   
   // ❌ 错误格式
   2025_10_12-create-table-users.js  // 时间戳格式错误
   20251012-create-users.js          // 缺少秒数
   20251012120000_create_table_users.js  // 使用下划线而非连字符
   ```

2. **Action类型验证**:
   ```javascript
   // ✅ 允许的Action
   create-table, alter-table, drop-table, rename-table
   add-column, alter-column, drop-column, rename-column
   create-index, alter-index, drop-index
   add-constraint, drop-constraint
   migrate-data, seed-data
   baseline  // 仅用于V1.0.0
   
   // ❌ 禁止的Action（会导致验证失败）
   fix       // 说明设计有问题
   temp      // 不应该提交临时迁移
   test      // 不应该提交测试迁移
   update    // 太模糊
   change    // 太模糊
   modify    // 太模糊
   ```

3. **时间戳合理性验证**:
   - 年份范围: 2025-2030
   - 月份范围: 1-12
   - 日期范围: 1-31
   - 小时范围: 0-23
   - 分钟范围: 0-59
   - 秒数范围: 0-59

4. **VERSION.js一致性验证**:
   - lastMigration 文件是否存在
   - lastMigration 是否真的是最后一个文件
   - 文件数量是否与记录一致

#### 验证输出示例

##### 验证通过

```bash
============================================================
🔍 数据库迁移文件验证工具
============================================================

📁 找到 3 个迁移文件

✅ [1/3] 20251013100000-baseline-v1.0.0.js
✅ [2/3] 20251014120000-add-column-users-vip-level.js
✅ [3/3] 20251015150000-create-table-promotions.js

📌 VERSION.js 信息:
   当前版本: V1.0.0-clean-start
   最后更新: 2025-10-12 12:00:00
   表数量: 18
   最后迁移: 20251015150000-create-table-promotions.js

============================================================
✅ 验证通过
============================================================

✨ 所有 3 个迁移文件符合规范
```

##### 验证失败

```bash
============================================================
🔍 数据库迁移文件验证工具
============================================================

📁 找到 3 个迁移文件

✅ [1/3] 20251013100000-baseline-v1.0.0.js

[文件 2/3] 20251012_fix_users.js:
  ❌ 文件名必须符合格式: {YYYYMMDD}{HHMMSS}-{action}-{target}.js

[文件 3/3] 20251012120000-fix-users-table.js:
  ❌ 禁止使用的action: fix
  ❌   原因: 说明之前的设计有问题，应该在设计阶段就避免
  ❌   建议: 重新设计迁移，使用正确的action类型

============================================================
❌ 验证失败
============================================================

发现以下错误:

[文件 2/3] 20251012_fix_users.js:
  ❌ 文件名必须符合格式: {YYYYMMDD}{HHMMSS}-{action}-{target}.js

[文件 3/3] 20251012120000-fix-users-table.js:
  ❌ 禁止使用的action: fix
  ❌   原因: 说明之前的设计有问题，应该在设计阶段就避免
  ❌   建议: 重新设计迁移，使用正确的action类型

============================================================
🚫 迁移文件存在问题，服务拒绝启动！
============================================================

💡 解决方法:

   1. 使用工具创建迁移: npm run migration:create
   2. 修复上述错误中的问题
   3. 或删除不符合规范的迁移文件
   4. 重新验证: npm run migration:verify
```

---

## 使用示例

### 示例1: 创建一个新表

```bash
$ npm run migration:create

============================================================
🎯 数据库迁移文件创建工具
============================================================

📋 本工具将引导你创建规范的迁移文件

📌 步骤1: 选择操作类型

   表操作:
     1.  创建新表         (create-table)
     ...

👉 请选择 (1-15): 1

✅ 已选择: 创建新表 (create-table)

📌 步骤2: 输入目标名称

   命名规则:
     • 小写字母开头
     • 只能包含: 小写字母、数字、连字符
     • 示例: users, user-vip-level, lottery-campaigns

👉 目标名称: promotions

✅ 目标名称: promotions

📌 步骤3: 说明创建原因

👉 创建原因 (至少5个字符): 添加促销活动功能，需要新的促销表

✅ 创建原因: 添加促销活动功能，需要新的促销表

📌 步骤4: 生成迁移文件

============================================================
✅ 迁移文件创建成功！
============================================================

📄 文件名: 20251015150000-create-table-promotions.js
📂 路径: /home/devbox/project/migrations/20251015150000-create-table-promotions.js

✅ VERSION.js 已自动更新

📋 下一步操作:

   1️⃣  编辑文件: 20251015150000-create-table-promotions.js
   2️⃣  完善迁移逻辑（标记为TODO的部分）
   3️⃣  执行迁移: npm run migration:up
   4️⃣  验证结果: 检查数据库变更
   5️⃣  测试回滚: npm run migration:down

💡 提示: 迁移文件已经包含基础模板，请根据实际需求修改
```

### 示例2: 添加一个列

```bash
$ npm run migration:create

👉 请选择 (1-15): 5  # 添加列

👉 目标名称: users-vip-level

⚠️ 建议格式: tablename-columnname (如: users-vip-level)

✅ 目标名称: users-vip-level

👉 创建原因: 添加用户VIP等级字段，用于区分用户权益

✅ 迁移文件创建成功！
📄 文件名: 20251014120000-add-column-users-vip-level.js
```

### 示例3: 创建索引

```bash
$ npm run migration:create

👉 请选择 (1-15): 9  # 创建索引

👉 目标名称: users-mobile

👉 创建原因: 优化手机号查询性能，添加mobile字段索引

✅ 迁移文件创建成功！
📄 文件名: 20251014130000-create-index-users-mobile.js
```

---

## 常见问题

### Q1: 我可以手动创建迁移文件吗？

**A**: ❌ 不建议！手动创建容易出错：

```bash
# ❌ 错误做法
touch migrations/fix_users.js  # 命名不规范
touch migrations/20251012-add-users.js  # 时间戳格式错误

# ✅ 正确做法
npm run migration:create  # 使用工具创建
```

**原因**:
- 手动创建无法保证命名规范
- 时间戳容易写错
- VERSION.js不会自动更新
- 启动验证会失败

### Q2: 如果验证失败，服务会启动吗？

**A**: ❌ 不会！`prestart` hook会阻止服务启动：

```bash
$ npm start

> prestart
> npm run migration:verify

❌ 验证失败
🚫 迁移文件存在问题，服务拒绝启动！

# 服务不会启动，必须先修复问题
```

### Q3: 旧迁移文件如何处理？

本项目已执行 **Baseline Squash**（D1 方案 B）：
- 旧迁移已归档至 `migrations/archived/2026-03-22/`
- 当前活跃迁移仅含基线 + 增量（`migrations/` 根目录）
- 新增迁移使用 `npm run migration:create` 创建

### Q4: VERSION.js 有什么用？

**A**: VERSION.js 是数据库版本的"身份证"：

1. **记录版本信息**:
   ```javascript
   current: 'V1.0.0-clean-start',
   lastUpdated: '2025-10-12 12:00:00',
   tableCount: 18
   ```

2. **追踪最后一次迁移**:
   ```javascript
   lastMigration: '20251015150000-create-table-promotions.js'
   ```

3. **记录历史变更**:
   ```javascript
   history: {
     'V1.0.0': {
       createdAt: '2025-10-12',
       description: '完全重构',
       migrations: 1,
       tables: 18
     }
   }
   ```

4. **提供自验证方法**:
   ```javascript
   VERSION.validate()  // 检查VERSION.js自身一致性
   ```

### Q5: 我可以跳过验证吗？

**A**: ⚠️ 不建议，但可以：

```bash
# 方式1: 跳过prestart验证（不推荐）
node app.js  # 直接启动，不执行npm start

# 方式2: 临时禁用验证（仅用于紧急情况）
# 编辑 package.json，注释掉 prestart
# "prestart": "npm run migration:verify",  // 注释这一行
```

**风险**:
- 可能使用不规范的迁移文件
- 长期会导致迁移历史混乱
- 新人无法理解数据库演进

### Q6: 为什么禁止 fix/temp/test 等action？

**A**: 这些action反映了不良的开发习惯：

```bash
# ❌ fix-xxx - 说明之前设计有问题
20251012120000-fix-users-table.js
# 问题: 为什么之前的设计要fix？应该在code review时就发现

# ❌ temp-xxx - 临时迁移不应该提交
20251012120000-temp-test-migration.js
# 问题: 临时迁移会污染迁移历史

# ❌ test-xxx - 测试迁移不应该提交
20251012120000-test-new-feature.js
# 问题: 测试应该在开发环境进行，不要提交到版本控制

# ✅ 正确做法
20251012120000-add-column-users-vip-level.js  # 明确说明做什么
```

**正确的流程**:
1. 充分设计 → Code Review → 创建迁移
2. 在开发环境充分测试
3. 提交规范的、最终的迁移文件

---

## 规范说明

### 迁移文件命名规范

#### 格式

```
{YYYYMMDD}{HHMMSS}-{action}-{target}.js
│         │         │        │         └─ 文件扩展名
│         │         │        └─ 目标对象（表名、字段名等）
│         │         └─ 操作类型（必须是允许的action）
│         └─ 6位时间戳（时分秒）
└─ 8位日期戳（年月日）
```

#### 示例

```bash
# 表操作
20251012120000-create-table-users.js
20251012130000-alter-table-users.js
20251012140000-drop-table-old-logs.js
20251012150000-rename-table-old-users-to-legacy-users.js

# 列操作
20251012160000-add-column-users-vip-level.js
20251012170000-alter-column-users-mobile.js
20251012180000-drop-column-users-deprecated-field.js
20251012190000-rename-column-users-old-name-to-new-name.js

# 索引操作
20251012200000-create-index-users-mobile.js
20251012210000-drop-index-users-old-index.js

# 数据操作
20251012220000-migrate-data-merge-user-roles.js
20251012230000-seed-data-initial-configs.js
```

### 目标名称规范

#### 规则

1. **小写字母开头**
2. **只能包含**: 小写字母、数字、连字符
3. **长度限制**: 最多50字符

#### 示例

```bash
# ✅ 正确示例
users
user-vip-level
lottery-campaigns
point-exchange-records

# ❌ 错误示例
Users              # 大写字母开头
user_vip_level     # 使用下划线
userVipLevel       # 驼峰命名
user.vip.level     # 使用点号
```

### Action类型说明

| 分类 | Action | 说明 | 目标格式示例 |
|------|--------|------|-------------|
| **表操作** | create-table | 创建新表 | `users` |
| | alter-table | 修改表结构 | `users` |
| | drop-table | 删除表 | `old-logs` |
| | rename-table | 重命名表 | `old-users-to-legacy-users` |
| **列操作** | add-column | 添加列 | `users-vip-level` |
| | alter-column | 修改列 | `users-mobile` |
| | drop-column | 删除列 | `users-deprecated-field` |
| | rename-column | 重命名列 | `users-old-name-to-new-name` |
| **索引操作** | create-index | 创建索引 | `users-mobile` |
| | alter-index | 修改索引 | `users-mobile-idx` |
| | drop-index | 删除索引 | `users-old-index` |
| **约束操作** | add-constraint | 添加约束 | `users-mobile-unique` |
| | drop-constraint | 删除约束 | `users-old-constraint` |
| **数据操作** | migrate-data | 数据迁移 | `merge-user-roles` |
| | seed-data | 初始化数据 | `initial-configs` |
| **特殊** | baseline | 基准迁移 | `v1.0.0` |

---

## 附录

### package.json 脚本说明

```json
{
  "scripts": {
    "migration:toolkit": "node scripts/database/migration_toolkit.js",
    "migration:create": "node scripts/database/migration_toolkit.js create",
    "migration:verify": "node scripts/database/migration_toolkit.js verify",
    "migration:up": "npm run migration:verify && npx sequelize-cli db:migrate",
    "migration:down": "npx sequelize-cli db:migrate:undo",
    "migration:status": "npx sequelize-cli db:migrate:status",
    "prestart": "npm run migration:verify"
  }
}
```

### 相关文档

- 《数据库变更历史混乱问题解决方案_V1.0.md》- 完整重构方案
- 《数据库迁移规范自动化保障系统.md》- 自动化保障系统设计

---

**文档版本**: V1.0.1  
**创建时间**: 2025年10月12日  
**最后更新**: 2026年3月24日

