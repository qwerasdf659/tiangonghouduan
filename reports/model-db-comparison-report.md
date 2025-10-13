# 📊 数据库表与模型对比分析报告

**生成时间**: 2025年10月13日 北京时间  
**分析范围**: 模型定义 vs 数据库实际表结构

---

## 📦 模型定义的表 (21个)

| 序号 | 表名 | 模型名 | 说明 |
|-----|------|--------|------|
| 1 | `audit_logs` | AuditLog | 审计日志 |
| 2 | `audit_records` | AuditRecord | 审计记录 |
| 3 | `chat_messages` | ChatMessage | 聊天消息 |
| 4 | `customer_sessions` | CustomerSession | 客服会话 |
| 5 | `exchange_records` | ExchangeRecords | 兑换记录 |
| 6 | `feedbacks` | Feedback | 用户反馈 |
| 7 | `image_resources` | ImageResources | 图片资源 |
| 8 | `lottery_campaigns` | LotteryCampaign | 抽奖活动 |
| 9 | `lottery_draws` | LotteryDraw | 抽奖记录 |
| 10 | `lottery_presets` | LotteryPreset | 抽奖预设 |
| 11 | `lottery_prizes` | LotteryPrize | 奖品配置 |
| 12 | `points_transactions` | PointsTransaction | 积分交易 |
| 13 | `products` | Product | 商品信息 |
| 14 | `roles` | Role | 角色权限 |
| 15 | `system_announcements` | SystemAnnouncement | 系统公告 |
| 16 | `trade_records` | TradeRecord | 交易记录 |
| 17 | `user_inventory` | UserInventory | 用户库存 |
| 18 | `user_points_accounts` | UserPointsAccount | 用户积分账户 |
| 19 | `user_roles` | UserRole | 用户角色关联 |
| 20 | `user_sessions` | UserSession | 用户会话 |
| 21 | `users` | User | 用户信息 |

---

## 🗄️ 数据库实际表 (20个，不含sequelizemeta)

根据之前的查询结果，数据库中实际存在的表：

| 序号 | 表名 | 业务模块 |
|-----|------|---------|
| 1 | `chat_messages` | 💬 客服系统 |
| 2 | `customer_sessions` | 💬 客服系统 |
| 3 | `exchange_records` | 💰 积分兑换 |
| 4 | `feedbacks` | 💭 用户反馈 |
| 5 | `image_resources` | 🖼️ 资源管理 |
| 6 | `lottery_campaigns` | 🎲 抽奖系统 |
| 7 | `lottery_draws` | 🎲 抽奖系统 |
| 8 | `lottery_pity` | 🎲 抽奖系统 |
| 9 | `lottery_presets` | 🎲 抽奖系统 |
| 10 | `lottery_prizes` | 🎲 抽奖系统 |
| 11 | `points_transactions` | 💰 积分系统 |
| 12 | `products` | 📦 商品管理 |
| 13 | `roles` | 👥 权限管理 |
| 14 | `system_announcements` | 📢 系统管理 |
| 15 | `trade_records` | 🛒 交易管理 |
| 16 | `user_inventory` | 🎒 用户库存 |
| 17 | `user_points_accounts` | 💳 积分账户 |
| 18 | `user_roles` | 🔐 权限关联 |
| 19 | `user_sessions` | 🔑 会话管理 |
| 20 | `users` | 👤 用户管理 |

---

## 🔍 差异分析

### ❌ 模型中有但数据库中缺失的表 (2个)

| 序号 | 表名 | 模型名 | 影响 | 优先级 |
|-----|------|--------|------|--------|
| 1 | **`audit_logs`** | AuditLog | 🔴 审计日志功能无法使用 | 🔴 高 |
| 2 | **`audit_records`** | AuditRecord | 🔴 审计记录功能无法使用 | 🔴 高 |

**问题说明**：
- 这两个表是审计系统的核心表
- 如果代码中使用了这些模型，会导致运行时错误
- 需要立即创建这些表

### ⚠️ 数据库中有但模型中缺失的表 (1个)

| 序号 | 表名 | 可能原因 | 建议处理 |
|-----|------|---------|---------|
| 1 | **`lottery_pity`** | 保底机制表，可能缺少对应模型 | 🟡 需要创建对应模型 |

**问题说明**：
- `lottery_pity` 表在数据库中存在，但在models目录中没有对应的模型文件
- 如果业务代码使用这个表，应该创建对应的模型
- 如果是废弃表，应该通过迁移删除

---

## 📋 详细问题清单

### 🔴 严重问题

1. **缺失 `audit_logs` 表**
   - 影响：审计日志功能完全无法使用
   - 现象：如果代码中使用 `AuditLog.create()` 会报错 "Table doesn't exist"
   - 解决：创建迁移脚本添加此表

2. **缺失 `audit_records` 表**
   - 影响：审计记录功能完全无法使用
   - 现象：如果代码中使用 `AuditRecord.create()` 会报错 "Table doesn't exist"
   - 解决：创建迁移脚本添加此表

### 🟡 中等问题

3. **缺失 `lottery_pity` 模型**
   - 影响：如果业务代码需要操作保底机制，缺少ORM层
   - 现象：只能使用原生SQL操作此表
   - 解决：
     - 选项1：创建 `models/LotteryPity.js` 模型文件
     - 选项2：如果是废弃表，创建迁移删除

---

## 💡 修复方案

### 方案1：创建缺失的审计表（推荐）

```bash
# 1. 生成迁移文件
npx sequelize-cli migration:generate --name create-audit-tables

# 2. 手写迁移脚本内容（参考下文）

# 3. 执行迁移
npx sequelize-cli db:migrate
```

**迁移脚本示例** (`migrations/XXXXXX-create-audit-tables.js`):

```javascript
module.exports = {
  up: async (queryInterface, Sequelize) => {
    // 创建 audit_logs 表
    await queryInterface.createTable('audit_logs', {
      log_id: {
        type: Sequelize.BIGINT,
        primaryKey: true,
        autoIncrement: true
      },
      user_id: {
        type: Sequelize.INTEGER,
        allowNull: true,
        references: { model: 'users', key: 'user_id' }
      },
      action: {
        type: Sequelize.STRING(100),
        allowNull: false
      },
      resource_type: {
        type: Sequelize.STRING(50),
        allowNull: true
      },
      resource_id: {
        type: Sequelize.BIGINT,
        allowNull: true
      },
      ip_address: {
        type: Sequelize.STRING(45),
        allowNull: true
      },
      user_agent: {
        type: Sequelize.TEXT,
        allowNull: true
      },
      created_at: {
        type: Sequelize.DATE,
        allowNull: false,
        defaultValue: Sequelize.literal('CURRENT_TIMESTAMP')
      },
      updated_at: {
        type: Sequelize.DATE,
        allowNull: false,
        defaultValue: Sequelize.literal('CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP')
      }
    });

    // 创建 audit_records 表
    await queryInterface.createTable('audit_records', {
      record_id: {
        type: Sequelize.BIGINT,
        primaryKey: true,
        autoIncrement: true
      },
      table_name: {
        type: Sequelize.STRING(64),
        allowNull: false
      },
      record_id_value: {
        type: Sequelize.BIGINT,
        allowNull: false
      },
      operation: {
        type: Sequelize.ENUM('INSERT', 'UPDATE', 'DELETE'),
        allowNull: false
      },
      old_value: {
        type: Sequelize.JSON,
        allowNull: true
      },
      new_value: {
        type: Sequelize.JSON,
        allowNull: true
      },
      user_id: {
        type: Sequelize.INTEGER,
        allowNull: true,
        references: { model: 'users', key: 'user_id' }
      },
      created_at: {
        type: Sequelize.DATE,
        allowNull: false,
        defaultValue: Sequelize.literal('CURRENT_TIMESTAMP')
      },
      updated_at: {
        type: Sequelize.DATE,
        allowNull: false,
        defaultValue: Sequelize.literal('CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP')
      }
    });

    // 添加索引
    await queryInterface.addIndex('audit_logs', ['user_id', 'created_at']);
    await queryInterface.addIndex('audit_logs', ['action']);
    await queryInterface.addIndex('audit_records', ['table_name', 'record_id_value']);
    await queryInterface.addIndex('audit_records', ['user_id', 'created_at']);
  },

  down: async (queryInterface) => {
    await queryInterface.dropTable('audit_records');
    await queryInterface.dropTable('audit_logs');
  }
};
```

### 方案2：处理 lottery_pity 表

**选项A：创建对应模型（如果需要使用）**

创建 `models/LotteryPity.js`:

```javascript
const { DataTypes } = require('sequelize');

module.exports = (sequelize) => {
  const LotteryPity = sequelize.define('LotteryPity', {
    pity_id: {
      type: DataTypes.BIGINT,
      primaryKey: true,
      autoIncrement: true
    },
    user_id: {
      type: DataTypes.INTEGER,
      allowNull: false,
      references: { model: 'users', key: 'user_id' }
    },
    campaign_id: {
      type: DataTypes.INTEGER,
      allowNull: false,
      references: { model: 'lottery_campaigns', key: 'campaign_id' }
    },
    current_pity_count: {
      type: DataTypes.INTEGER,
      defaultValue: 0
    },
    // ... 其他字段根据实际表结构定义
  }, {
    tableName: 'lottery_pity',
    timestamps: true,
    underscored: true
  });

  return LotteryPity;
};
```

**选项B：删除废弃表（如果不再使用）**

```bash
# 生成迁移
npx sequelize-cli migration:generate --name drop-lottery-pity-table

# 迁移内容
module.exports = {
  up: async (queryInterface) => {
    await queryInterface.dropTable('lottery_pity');
  },
  down: async (queryInterface, Sequelize) => {
    // 根据需要恢复表结构
  }
};
```

---

## 📊 优先级处理建议

### 🔴 立即处理（P0）

1. ✅ **创建 `audit_logs` 和 `audit_records` 表**
   - 时间：30分钟
   - 方法：使用上面的迁移脚本
   - 验证：`node -e "require('./models/AuditLog'); console.log('✅ 模型加载成功')"`

### 🟡 短期处理（P1）

2. ✅ **处理 `lottery_pity` 表/模型不匹配**
   - 时间：15分钟
   - 方法：检查业务代码是否使用，决定创建模型或删除表
   - 验证：`grep -r "lottery_pity" routes/ services/`

---

## 🧪 验证脚本

创建完整的验证脚本 `scripts/database/verify-model-db-sync.js`：

```javascript
const { sequelize } = require('../../config/database.js');
const models = require('../../models');

async function verifySync() {
  console.log('🧪 开始验证模型与数据库同步性...\n');
  
  const issues = [];
  
  for (const modelName of Object.keys(models)) {
    if (modelName === 'sequelize' || modelName === 'Sequelize') continue;
    
    const model = models[modelName];
    const tableName = model.tableName || model.name;
    
    try {
      // 尝试查询表
      await sequelize.query(`SELECT 1 FROM ${tableName} LIMIT 1`);
      console.log(`✅ ${tableName}: 表存在`);
    } catch (error) {
      console.error(`❌ ${tableName}: 表不存在或无法访问`);
      issues.push({ table: tableName, model: modelName });
    }
  }
  
  if (issues.length > 0) {
    console.log(`\n⚠️ 发现 ${issues.length} 个问题:`);
    issues.forEach(i => console.log(`   - ${i.table} (${i.model})`));
    process.exit(1);
  } else {
    console.log('\n✅ 所有模型表都存在');
    process.exit(0);
  }
}

verifySync();
```

---

## 📝 总结

### 核心问题

- **2个表缺失**: `audit_logs`, `audit_records`
- **1个模型缺失**: `LotteryPity` (对应 `lottery_pity` 表)

### 风险评估

- 🔴 高风险：审计功能如果被代码使用会导致运行时错误
- 🟡 中风险：保底机制表缺少ORM层，可能影响代码可维护性

### 下一步行动

1. 立即创建审计表的迁移脚本
2. 检查业务代码中是否使用 `lottery_pity` 表
3. 根据使用情况决定创建模型或删除表
4. 执行迁移并验证

---

**报告生成时间**: 2025年10月13日  
**数据来源**: 模型定义 + 数据库查询结果  
**建议执行人**: 后端开发团队


