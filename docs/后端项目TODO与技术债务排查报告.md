# 后端项目 TODO 与技术债务排查报告

**排查日期**：2026年1月30日  
**最后更新**：2026年1月30日（完成P0-P3全部问题修复方案）  
**排查范围**：`/home/devbox/project` 后端数据库项目  
**技术栈**：Node.js 20+ + Express + Sequelize ORM + MySQL + Redis + Socket.io  
**项目状态**：未上线，可一次性投入解决技术债务

---

## 1. 项目现状概览

### 1.1 数据库规模（真实数据验证）

| 指标 | 数量 | 说明 |
|------|------|------|
| 数据库表 | 72张 | 完整的业务系统 |
| 用户数 | 49 | 测试/开发数据 |
| 抽奖记录 | 250条 | lottery_draws表 |
| 活动数 | 4个 | 1个active，3个ended |
| 矩阵配置 | 12条 | B0-B3 × P0-P2 完整 |
| 系统配置 | 39条 | system_settings表 |
| 告警记录 | 0条 | 表存在但无数据 |

### 1.2 排查结果概览

| 类别 | 数量 | 优先级 | 说明 |
|------|------|--------|------|
| 🔴 影响数据准确性 | 2 | P0 高 | 需立即修复 |
| 🟡 deprecated 标记 | 2 | P1 中 | 修正注释 |
| 🟡 空catch块 | 6 | P1 中 | 添加错误日志 |
| 🟠 监控能力缺失 | 1项 | P1 中 | 告警推送 |
| 🟡 功能扩展点 | 2 | P2 中 | 完成实现 |
| 🟢 脚本工具类 | 6 | P3 低 | 完善脚本 |
| ⚪ 正常设计模式 | 5 | 无需处理 | 抽象类/接口定义 |

### 1.3 工作量汇总

| 优先级 | 任务数 | 预估工时 | 说明 |
|--------|--------|----------|------|
| P0 | 2项 | 1.5天 | 新用户统计0.5天，矩阵配置1天 |
| P1 | 3项 | 1.5天 | 空catch块0.5天，deprecated 15分钟，告警推送1天 |
| P2 | 2项 | 1天 | 告警规则0.5天，资产导出0.5天 |
| P3 | 6项 | 0.5天 | 脚本工具完善 |
| **合计** | **13项** | **4.5天** |

---

## 2. P0 高优先级问题（影响业务数据准确性）

### 2.1 新用户统计数据永远为0

**文件**：`services/LotteryAnalyticsService.js`  
**行号**：2851  
**当前代码**：
```javascript
const newUsers = 0 // TODO: 需要查询用户首次抽奖时间
```

**问题分析**：
- 新用户数被硬编码为0，导致统计报表中该指标永远显示0
- 影响管理后台的日报/周报数据分析准确性
- **数据库验证**：`lottery_draws` 表有 `user_id` + `created_at` 字段，可支持统计

**修复方案**：

在 `_calculateDailyReportStats` 方法中，使用 `sequelize.query()` 执行子查询：

**SQL逻辑**：
```sql
SELECT COUNT(DISTINCT ld.user_id) as new_users
FROM lottery_draws ld
INNER JOIN (
  SELECT user_id, MIN(created_at) as first_draw_time
  FROM lottery_draws
  GROUP BY user_id
) first_draws ON ld.user_id = first_draws.user_id 
              AND ld.created_at = first_draws.first_draw_time
WHERE ld.created_at BETWEEN :startTime AND :endTime
```

**实施步骤**：
1. 在第2847行 `const activeUsers = userIds.size` 之后
2. 删除第2851行的硬编码 `const newUsers = 0`
3. 添加上述SQL查询，使用 `sequelize.query()` 执行
4. 参数 `startTime`、`endTime` 从现有方法参数中获取

**技术路线**：
- 使用 `sequelize.query()` 原生SQL（子查询比ORM更直观高效）
- 无需新建表，无需改ORM模型

**预计工作量**：0.5天

---

### 2.2 矩阵配置 loadFromDatabase 未实现

**文件**：`services/UnifiedLotteryEngine/compute/calculators/TierMatrixCalculator.js`  
**行号**：311-321  

#### 问题分析

当前数据库表 `lottery_tier_matrix_config` 只有2个字段，代码需要4个字段：

| 数据库表现有字段 | 代码需要的字段 |
|------------------|----------------|
| `cap_multiplier` | `high` |
| `empty_weight_multiplier` | `mid` |
| （缺失） | `low` |
| （缺失） | `fallback` |

#### 修复方案：扩展数据库表

##### 1. 数据库迁移脚本

```sql
-- 添加4个档位权重字段
ALTER TABLE lottery_tier_matrix_config
ADD COLUMN high_multiplier DECIMAL(5,2) NOT NULL DEFAULT 0.00 COMMENT 'high档位权重乘数',
ADD COLUMN mid_multiplier DECIMAL(5,2) NOT NULL DEFAULT 0.00 COMMENT 'mid档位权重乘数',
ADD COLUMN low_multiplier DECIMAL(5,2) NOT NULL DEFAULT 0.00 COMMENT 'low档位权重乘数',
ADD COLUMN fallback_multiplier DECIMAL(5,2) NOT NULL DEFAULT 1.00 COMMENT 'fallback档位权重乘数';
```

##### 2. 初始化默认数据（与代码硬编码一致）

```sql
-- B0: 预算不足，仅能抽 fallback
UPDATE lottery_tier_matrix_config SET high_multiplier=0, mid_multiplier=0, low_multiplier=0, fallback_multiplier=1.0 WHERE budget_tier='B0';

-- B1P0: 低预算+宽松
UPDATE lottery_tier_matrix_config SET high_multiplier=0, mid_multiplier=0, low_multiplier=1.2, fallback_multiplier=0.9 WHERE budget_tier='B1' AND pressure_tier='P0';
-- B1P1: 低预算+正常
UPDATE lottery_tier_matrix_config SET high_multiplier=0, mid_multiplier=0, low_multiplier=1.0, fallback_multiplier=1.0 WHERE budget_tier='B1' AND pressure_tier='P1';
-- B1P2: 低预算+紧张
UPDATE lottery_tier_matrix_config SET high_multiplier=0, mid_multiplier=0, low_multiplier=0.8, fallback_multiplier=1.2 WHERE budget_tier='B1' AND pressure_tier='P2';

-- B2P0: 中预算+宽松
UPDATE lottery_tier_matrix_config SET high_multiplier=0, mid_multiplier=1.3, low_multiplier=1.1, fallback_multiplier=0.8 WHERE budget_tier='B2' AND pressure_tier='P0';
-- B2P1: 中预算+正常
UPDATE lottery_tier_matrix_config SET high_multiplier=0, mid_multiplier=1.0, low_multiplier=1.0, fallback_multiplier=1.0 WHERE budget_tier='B2' AND pressure_tier='P1';
-- B2P2: 中预算+紧张
UPDATE lottery_tier_matrix_config SET high_multiplier=0, mid_multiplier=0.7, low_multiplier=1.1, fallback_multiplier=1.3 WHERE budget_tier='B2' AND pressure_tier='P2';

-- B3P0: 高预算+宽松
UPDATE lottery_tier_matrix_config SET high_multiplier=1.5, mid_multiplier=1.2, low_multiplier=0.9, fallback_multiplier=0.7 WHERE budget_tier='B3' AND pressure_tier='P0';
-- B3P1: 高预算+正常
UPDATE lottery_tier_matrix_config SET high_multiplier=1.0, mid_multiplier=1.0, low_multiplier=1.0, fallback_multiplier=1.0 WHERE budget_tier='B3' AND pressure_tier='P1';
-- B3P2: 高预算+紧张
UPDATE lottery_tier_matrix_config SET high_multiplier=0.6, mid_multiplier=0.8, low_multiplier=1.2, fallback_multiplier=1.5 WHERE budget_tier='B3' AND pressure_tier='P2';
```

##### 3. 修改 Model

在 `models/LotteryTierMatrixConfig.js` 的 `getFullMatrix()` 方法中返回新字段：

```javascript
matrix[bt][pt] = {
  cap_multiplier: parseFloat(config.cap_multiplier),
  empty_weight_multiplier: parseFloat(config.empty_weight_multiplier),
  // 新增4个档位权重字段
  high_multiplier: parseFloat(config.high_multiplier),
  mid_multiplier: parseFloat(config.mid_multiplier),
  low_multiplier: parseFloat(config.low_multiplier),
  fallback_multiplier: parseFloat(config.fallback_multiplier)
}
```

##### 4. 实现 loadFromDatabase()

```javascript
async loadFromDatabase(campaign_id = null) {
  const { LotteryTierMatrixConfig } = require('../../../../models')
  
  try {
    const db_matrix = await LotteryTierMatrixConfig.getFullMatrix()
    
    if (!db_matrix || Object.keys(db_matrix).length === 0) {
      this._log('warn', '数据库无矩阵配置，使用默认配置')
      return this.matrix
    }

    // 从数据库加载到 this.matrix
    for (const [bt, pressures] of Object.entries(db_matrix)) {
      if (!this.matrix[bt]) this.matrix[bt] = {}
      for (const [pt, values] of Object.entries(pressures)) {
        this.matrix[bt][pt] = {
          high: values.high_multiplier,
          mid: values.mid_multiplier,
          low: values.low_multiplier,
          fallback: values.fallback_multiplier
        }
      }
    }

    this._log('info', '从数据库加载矩阵配置成功', { 
      campaign_id, 
      config_count: Object.keys(db_matrix).length * 3 
    })
    
    return this.matrix
  } catch (error) {
    this._log('error', '加载矩阵配置失败，使用默认配置', { error: error.message })
    return this.matrix
  }
}
```

##### 5. 更新管理后台

在现有矩阵配置页面添加4个权重字段的编辑功能。

#### 实施步骤

1. 创建迁移脚本，添加4个新字段
2. 执行初始化SQL，写入默认数据（与代码硬编码一致）
3. 修改 `LotteryTierMatrixConfig` 模型
4. 实现 `TierMatrixCalculator.loadFromDatabase()`
5. 更新管理后台API和前端页面

**预计工作量**：1天

---

## 3. P1 中优先级问题

### 3.1 空catch块问题（6处）

空 catch 块会"吞掉"错误，导致问题难以排查。

#### 问题清单

| 文件 | 行号 | 当前代码 | 修复方案 |
|------|------|----------|----------|
| `admin/src/utils/echarts-lazy.js` | 182 | `.catch(() => {})` | `.catch(err => console.warn('[ECharts] 延迟加载失败:', err.message))` |
| `scripts/database/validate_all_tables.js` | 441 | `.catch(() => {})` | `.catch(err => console.warn('数据库连接关闭失败:', err.message))` |
| `scripts/database/generate_baseline_v2.js` | 435 | `.catch(() => {})` | `.catch(err => console.warn('数据库连接关闭失败:', err.message))` |
| `scripts/database/validation_toolkit.js` | 473 | `.catch(() => {})` | `.catch(err => console.warn('数据库连接关闭失败:', err.message))` |
| `migrations/20260107004800-*.js` | 140 | `.catch(() => {})` | `.catch(err => console.warn('[迁移回滚] 删除索引失败:', err.message))` |
| `migrations/20260107004800-*.js` | 170 | `.catch(() => {})` | `.catch(err => console.warn('[迁移回滚] 创建索引失败:', err.message))` |

#### 修复原则

```javascript
// ❌ 错误写法
.catch(() => {})

// ✅ 正确写法（脚本场景）
.catch(err => console.warn('操作失败（非致命）:', err.message))

// ✅ 正确写法（业务/迁移场景）
.catch(err => logger.warn('操作失败', { error: err.message, stack: err.stack }))
```

**预计工作量**：0.5天

---

### 3.2 @deprecated 代码清理

#### 3.2.1 BusinessCacheHelper.getUserByMobile ⚠️ 标记有误

**文件**：`utils/BusinessCacheHelper.js:795`  

**当前注释（有误）**：
```javascript
/**
 * @deprecated 登录场景应直接查库，不应调用此方法
 */
```

**检查结果**：

| 调用位置 | `useCache` 参数 | 符合规范 |
|----------|-----------------|----------|
| `routes/v4/auth/login.js:84` | `false` | ✅ 登录禁用缓存 |
| `routes/v4/auth/login.js:106` | `false` | ✅ 登录禁用缓存 |
| `routes/v4/auth/login.js:354` | `false` | ✅ 登录禁用缓存 |
| `routes/v4/auth/login.js:371` | `false` | ✅ 登录禁用缓存 |
| `services/UserService.js:157` | 由 `shouldUseCache` 控制 | ✅ 事务场景自动禁用 |

**结论**：
- ✅ 所有登录场景都**正确**使用了 `useCache: false`
- ⚠️ `@deprecated` 标记**过度宽泛**，实际方法在非登录场景是可用的
- 📌 **不是代码废弃问题，而是注释不准确**

**修复方案**：修正注释
```javascript
// 修改前
/**
 * @deprecated 登录场景应直接查库，不应调用此方法
 */

// 修改后
/**
 * @warning 登录场景禁止直接调用此方法！
 * @description 此方法被 UserService.findByMobile() 内部调用
 * @see UserService.findByMobile(mobile, { useCache: false }) - 登录场景的正确调用方式
 * @internal 仅供 UserService 非登录场景内部使用
 */
```

---

#### 3.2.2 draw_types 配置字段 ✅ 可直接删除

**文件**：`config/business.config.js:35-49`  
**说明**：`draw_types` 配置已迁移至 `lottery_campaign_pricing_config` 表

**检查结果**：
- ✅ **没有实际代码使用**，仅有注释引用
- ✅ 业务逻辑已通过 `LotteryPricingService` 从数据库读取

**修复方案**：删除第35-49行的整段废弃注释

---

#### 3.2.3 @deprecated 清理汇总

| 项目 | 状态 | 操作 | 工作量 |
|------|------|------|--------|
| `getUserByMobile` | ⚠️ 标记有误 | 修正注释 | 5分钟 |
| `draw_types` | ✅ 可删除 | 删除废弃注释 | 10分钟 |

**总计工作量**：15分钟

---

### 3.3 告警WebSocket推送

**现有基础设施**：

| 组件 | 状态 | 说明 |
|------|------|------|
| `LotteryAlertService` | ✅ 完整 | 告警规则引擎、CRUD、状态管理 |
| `lottery_alerts` 表 | ✅ 存在 | 字段：status, severity, message等 |
| `ChatWebSocketService` | ✅ 运行中 | 支持5000+并发，已有admin房间机制 |

#### 修复方案

**方案：扩展 `ChatWebSocketService` 推送告警**

##### 后端实现

1. **创建 `services/AlertWebSocketService.js`**

   复用 `ChatWebSocketService` 的 Socket.io 实例：

   **职责**：
   - `pushAlertToAdmins(alert)` - 推送单条告警到管理员房间
   - `pushPendingAlerts(socket)` - 管理员登录时推送未确认告警列表

   **实现思路**：
   - 在 `app.js` 中初始化时，将 Socket.io 实例传入 `AlertWebSocketService.init(io)`
   - 使用 `this.io.to('admin_room').emit('new_alert', alertData)` 推送

2. **修改 `LotteryAlertService.createAlert()`**

   在方法末尾添加 WebSocket 推送调用：
   ```javascript
   // 推送告警到管理平台
   const AlertWebSocketService = require('./AlertWebSocketService')
   await AlertWebSocketService.pushAlertToAdmins(alert)
   ```

3. **静默窗口机制**

   在 `LotteryAlertService` 层控制：
   - 在创建告警前，查询是否有同类告警在30分钟内已触发
   - 如有则跳过创建和推送

##### 前端实现

在 `admin/src/modules/monitoring/` 添加告警中心页面：
- 监听 `new_alert` 事件
- 浏览器 Notification API 弹窗 + 声音提醒
- 告警列表（筛选severity/status/时间范围）
- 告警确认/解决功能

**预计工作量**：后端0.5天 + 前端0.5天

---

## 4. P2 功能扩展点

### 4.1 告警规则扩展点

**文件**：`services/LotteryAlertService.js:467`  

**当前代码**：
```javascript
// TODO: 其他规则检测可以在此添加
```

**当前已实现**：库存不足告警、预算消耗告警

#### 修复方案

将 `ALERT_RULES`（第35-91行）中定义的规则全部实现：

| 规则代码 | 规则名称 | 检测逻辑 |
|----------|----------|----------|
| `RULE_001` | 中奖率偏离告警 | 最近1小时中奖率与配置值偏差>20% |
| `RULE_002` | 高档奖品发放过快 | 高档奖品发放速度超过预算的1.5倍 |
| `RULE_006` | 连续空奖率异常 | 连续空奖≥10次的用户数占比>5% |

**实施步骤**：

1. 在第467行添加3个新的规则检测调用：
   ```javascript
   const winRateAlerts = await LotteryAlertService.checkWinRateAlert(campaign.campaign_id)
   results.new_alerts += winRateAlerts.length

   const highTierAlerts = await LotteryAlertService.checkHighTierSpeedAlert(campaign.campaign_id)
   results.new_alerts += highTierAlerts.length

   const emptyStreakAlerts = await LotteryAlertService.checkEmptyStreakAlert(campaign.campaign_id)
   results.new_alerts += emptyStreakAlerts.length
   ```

2. 实现3个静态方法：
   - `checkWinRateAlert(campaign_id)` - 查询最近1小时 `lottery_draws`，计算中奖率与配置值偏差
   - `checkHighTierSpeedAlert(campaign_id)` - 统计 `reward_tier='high'` 的发放速度
   - `checkEmptyStreakAlert(campaign_id)` - 统计用户连续空奖次数

**预计工作量**：0.5天

---

### 4.2 前端资产导出功能

**文件**：`admin/src/modules/asset/pages/assets-portfolio.js:262-265`  

**当前代码**：
```javascript
async exportAssets() {
  this.showInfo('导出功能开发中...')
  // TODO: 实现导出功能
}
```

#### 修复方案

##### 后端API

新增导出接口：

**接口设计**：
```
GET /api/v4/console/asset/export
Query参数：
  - type: 资产类型筛选
  - status: 状态筛选  
  - format: excel | csv (默认excel)
Response：Content-Type: application/vnd.openxmlformats-officedocument.spreadsheetml.sheet
```

**实现思路**：
- 复用现有 `AssetService` 查询逻辑
- 使用项目已有的 `xlsx` 依赖（package.json:154）生成Excel
- 流式下载，避免内存溢出

##### 前端实现

```javascript
async exportAssets() {
  try {
    const params = new URLSearchParams(this.buildQueryParams())
    params.append('format', 'excel')
    
    const response = await fetch(`/api/v4/console/asset/export?${params}`, {
      headers: { Authorization: `Bearer ${this.token}` }
    })
    
    const blob = await response.blob()
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `资产列表_${new Date().toISOString().slice(0,10)}.xlsx`
    a.click()
    URL.revokeObjectURL(url)
    
    this.showSuccess('导出成功')
  } catch (error) {
    this.showError('导出失败: ' + error.message)
  }
}
```

**预计工作量**：0.5天

---

## 5. P3 脚本工具类 TODO

以下 TODO 位于**运维脚本**中，不影响线上业务：

### 5.1 问题清单

| 文件 | 行号 | TODO内容 |
|------|------|----------|
| `scripts/reconciliation/check_lottery_consistency.js` | 44 | 接入告警通道 |
| `scripts/reconciliation/check_lottery_consistency.js` | 75 | 更新系统配置或Redis标记 |
| `scripts/database/migration_toolkit.js` | 123 | 添加其他字段定义 |
| `scripts/database/migration_toolkit.js` | 194 | 添加回滚逻辑 |
| `scripts/database/migration_toolkit.js` | 239 | 实现操作 |
| `scripts/database/migration_toolkit.js` | 243 | 实现回滚逻辑 |

### 5.2 修复方案

#### ① `check_lottery_consistency.js:44` - 接入告警通道

**当前代码**：
```javascript
// TODO: 实际项目中接入告警通道
// - 钉钉机器人 Webhook
// - 邮件通知
```

**修复方案**：复用P1-3的 `AlertWebSocketService`

```javascript
const AlertWebSocketService = require('../../services/AlertWebSocketService')
await AlertWebSocketService.pushAlertToAdmins({
  alert_type: 'consistency',
  severity: 'danger',
  message: `数据一致性告警: ${alert_type}`,
  current_value: JSON.stringify(data),
  created_at: new Date()
})
```

---

#### ② `check_lottery_consistency.js:75` - 更新系统配置

**当前代码**：
```javascript
// TODO: 实际项目中更新系统配置或 Redis 标记
```

**修复方案**：使用现有 `SystemConfigService`

```javascript
const SystemConfigService = require('../../services/SystemConfigService')
await SystemConfigService.updateConfig(`${entry_type}_enabled`, 'false', {
  updated_by: 0, // system_job用户
  update_reason: `数据一致性检测异常，自动冻结入口`
})
```

---

#### ③ `migration_toolkit.js:123` - 添加其他字段定义

**当前代码**：
```javascript
// TODO: 添加其他字段定义
```

**修复方案**：根据 `data.columns` 动态生成字段定义

```javascript
// 遍历 data.columns 数组，生成每个字段的 Sequelize DataTypes 定义
data.columns.forEach(col => {
  template += `      ${col.name}: {
        type: Sequelize.${col.type.toUpperCase()},
        allowNull: ${col.nullable},
        comment: '${col.comment || col.name}'
      },\n`
})
```

---

#### ④ `migration_toolkit.js:194` - 添加回滚逻辑

**当前代码**：
```javascript
// TODO: 添加回滚逻辑
```

**修复方案**：生成与 `up` 对应的回滚操作

```javascript
down: async (queryInterface, Sequelize) => {
  // 回滚字段类型修改
  await queryInterface.changeColumn('${data.table}', '${data.column}', {
    type: Sequelize.${data.original_type}, // 需要记录原始类型
    allowNull: ${data.original_nullable}
  })
}
```

**依赖**：迁移创建时需记录原始字段信息到 `data.original_*` 字段

---

#### ⑤ `migration_toolkit.js:239` - 实现操作

**当前代码**：
```javascript
// TODO: 实现 ${data.action} 操作
```

**修复方案**：根据 `data.action` 类型生成对应的迁移操作

```javascript
up: async (queryInterface, Sequelize) => {
  switch('${data.action}') {
    case 'add_column':
      await queryInterface.addColumn('${data.table}', '${data.column}', {
        type: Sequelize.${data.type},
        allowNull: ${data.nullable}
      })
      break
    case 'add_index':
      await queryInterface.addIndex('${data.table}', ['${data.columns.join("', '")}'], {
        name: '${data.index_name}'
      })
      break
    case 'remove_column':
      await queryInterface.removeColumn('${data.table}', '${data.column}')
      break
  }
}
```

---

#### ⑥ `migration_toolkit.js:243` - 实现回滚逻辑

**当前代码**：
```javascript
// TODO: 实现回滚逻辑
```

**修复方案**：与⑤配对的回滚操作

```javascript
down: async (queryInterface, Sequelize) => {
  switch('${data.action}') {
    case 'add_column':
      await queryInterface.removeColumn('${data.table}', '${data.column}')
      break
    case 'add_index':
      await queryInterface.removeIndex('${data.table}', '${data.index_name}')
      break
    case 'remove_column':
      await queryInterface.addColumn('${data.table}', '${data.column}', {
        type: Sequelize.${data.original_type},
        allowNull: ${data.original_nullable}
      })
      break
  }
}
```

**预计工作量**：0.5天

---

## 6. 正常设计模式（无需处理）

以下代码是**抽象类/接口的正常实现**，强制子类实现特定方法：

| 文件 | 行号 | 说明 |
|------|------|------|
| `services/UnifiedLotteryEngine/pipeline/stages/BaseStage.js` | 54 | 抽象基类 `execute()` |
| `services/UnifiedLotteryEngine/pipeline/budget/BudgetProvider.js` | 59 | 接口 `getAvailableBudget()` |
| `services/UnifiedLotteryEngine/pipeline/budget/BudgetProvider.js` | 100 | 接口 `deductBudget()` |
| `services/UnifiedLotteryEngine/pipeline/budget/BudgetProvider.js` | 117 | 接口 `rollbackBudget()` |
| `services/UnifiedLotteryEngine/pipeline/PipelineRunner.js` | 54 | 运行时校验 |

**结论**：标准设计模式，无需修改

---

## 7. 行动计划

### 7.1 立即执行（本周内）

| 任务 | 优先级 | 预计工时 | 状态 |
|------|--------|----------|------|
| 修复新用户统计为0 | P0 | 0.5天 | ✅ 方案已确认 |
| 矩阵配置 loadFromDatabase | P0 | 1天 | ✅ 方案已确认（扩展数据库表+实现加载） |
| 修复6处空catch块 | P1 | 0.5天 | ✅ 方案已确认 |
| 修正 @deprecated 注释 | P1 | 15分钟 | ✅ 方案已确认 |

### 7.2 短期（2周内）

| 任务 | 优先级 | 预计工时 | 状态 |
|------|--------|----------|------|
| 告警WebSocket推送（后端） | P1 | 0.5天 | ✅ 方案已确认 |
| 告警中心页面（前端） | P1 | 0.5天 | ✅ 方案已确认 |
| 告警规则扩展实现 | P2 | 0.5天 | ✅ 方案已确认 |
| 前端资产导出功能 | P2 | 0.5天 | ✅ 方案已确认 |

### 7.3 中期（1个月内）

| 任务 | 优先级 | 预计工时 | 状态 |
|------|--------|----------|------|
| 脚本工具类TODO完善 | P3 | 0.5天 | ✅ 方案已确认 |

---

## 8. 技术路线总结

基于项目**现有技术栈**的决策：

| 决策项 | 选择 | 理由 |
|--------|------|------|
| 新用户统计 | `sequelize.query()` 原生SQL | 子查询比ORM更直观高效 |
| 矩阵配置加载 | 扩展数据库表+实现加载 | 添加4个字段，默认数据与代码硬编码一致 |
| 告警推送 | 扩展 `ChatWebSocketService` | 复用现有Socket.io架构 |
| 资产导出 | 使用 `xlsx` 依赖 | package.json已有依赖 |
| 脚本告警通知 | 复用 `AlertWebSocketService` | 统一告警渠道 |
| 入口冻结 | `SystemConfigService.updateConfig()` | 复用现有配置服务 |
| 旧接口兼容 | 不兼容 | 项目未上线，直接删除废弃代码 |

---

## 9. 附录：排查命令

```bash
# 查找所有 TODO/FIXME/HACK
grep -rn "TODO\|FIXME\|HACK" --include="*.js" --exclude-dir=node_modules

# 查找 @deprecated 标记
grep -rn "@deprecated" --include="*.js" --exclude-dir=node_modules

# 查找空catch块
grep -rn "catch.*{}" --include="*.js" --exclude-dir=node_modules
grep -rn "\.catch\s*(\s*(\s*)\s*=>\s*{\s*}\s*)" --include="*.js" --exclude-dir=node_modules

# 连接数据库检查数据
node -e "
require('dotenv').config();
const { sequelize } = require('./config/database');
sequelize.authenticate().then(() => console.log('✅ 数据库连接成功'));
"

# 检查特定表数据
node -e "
require('dotenv').config();
const { sequelize } = require('./config/database');
const { QueryTypes } = require('sequelize');
sequelize.query('SELECT COUNT(*) as count FROM lottery_tier_matrix_config', { type: QueryTypes.SELECT })
  .then(r => console.log('矩阵配置条数:', r[0].count));
"
```

---

**文档维护者**：后端开发团队  
**创建日期**：2026年1月30日  
**最后更新**：2026年1月30日（完成P0-P3全部问题修复方案）  
**下次复查日期**：2026年3月1日
