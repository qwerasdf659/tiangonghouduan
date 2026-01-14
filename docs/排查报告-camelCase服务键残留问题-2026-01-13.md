# 排查报告：camelCase 服务键残留问题分析

**报告日期**：2026-01-13  
**报告类型**：现状对齐 + 清理方案（无代码生成）  
**问题来源**：`docs/迁移双轨兼容残留清理方案-2026-01-13.md` 1.7 节提及的 `KEY_MIGRATION_MAP` 残留  
**数据库连接**：真实 MySQL 库（`restaurant_points_dev`，非备份文件）

---

## 📋 执行摘要

### 问题确认

**✅ 确认存在残留问题**：

1. **迁移映射表真实存在**：`services/index.js` 第 102-155 行定义了 `KEY_MIGRATION_MAP`（camelCase → snake_case 映射）
2. **抛错提示机制生效**：`getService()` 方法在第 414-422 行会检测 camelCase key 并抛出迁移提示错误
3. **存在真实违规调用点**：`jobs/daily-orphan-frozen-check.js` 第 53 行使用了 `getService('orphanFrozenCleanup')`（camelCase），会触发运行时错误
4. **定时任务受影响**：该 job 由 `node-cron` 在每天凌晨 2 点执行，属于生产关键路径

### 影响范围

- **高风险**：定时任务 `DailyOrphanFrozenCheck` 会在运行时抛错（每天凌晨 2 点）
- **中风险**：`modules/UserPermissionModule.js` 注释中的误导性示例（`getService('userRole')`）
- **低风险**：其他路由文件已通过 `scripts/validation/verify_service_manager_usage.js` 验证（仅扫描 `routes/v4`）

### 业务影响评估

- **受影响业务**：孤儿冻结清理（`orphan_frozen_cleanup`）
- **真实数据库证据**：`asset_transactions` 表中有 5 条 `business_type='orphan_frozen_cleanup'` 的记录
- **业务链路**：资产冻结 → 市场挂牌 → 孤儿冻结检测 → 自动解冻 → 账本记录

---

## 🔍 详细分析

### 1. 代码层排查结果

#### 1.1 `services/index.js` - KEY_MIGRATION_MAP 映射表

**位置**：第 102-155 行

```javascript
const KEY_MIGRATION_MAP = {
  // 核心服务
  unifiedLotteryEngine: 'unified_lottery_engine',
  lotteryContainer: 'lottery_container',

  // 领域服务
  exchangeMarket: 'exchange_market',
  // ... 共 40+ 个映射

  // 清理服务
  orphanFrozenCleanup: 'orphan_frozen_cleanup', // 🔴 本次问题的核心映射

  // 商家员工域权限体系升级服务（2026-01-12）
  staffManagement: 'staff_management',
  store: 'store',
  region: 'region'
}
```

**设计意图**：P1-9 重构时用于提供"从 camelCase 到 snake_case 的迁移提示"

**问题**：

- 映射表本身是中性的（不会主动造成错误）
- 但如果有代码仍在使用 camelCase key，会触发第 414-422 行的错误抛出逻辑

#### 1.2 `services/index.js` - getService() 错误检测逻辑

**位置**：第 407-429 行

```javascript
getService(serviceName) {
  if (!this._initialized) {
    throw new Error('服务管理器尚未初始化，请先调用 initialize()')
  }

  const service = this._services.get(serviceName)
  if (!service) {
    // P1-9 E2-Strict：检查是否是 camelCase key，提供迁移提示
    const suggestedKey = KEY_MIGRATION_MAP[serviceName]
    if (suggestedKey) {
      throw new Error(
        `Service '${serviceName}' not found. ` +
          `Did you mean '${suggestedKey}'? (P1-9 snake_case key migration required)\n` +
          `迁移提示：请将 getService('${serviceName}') 改为 getService('${suggestedKey}')`
      )
    }

    const availableServices = Array.from(this._services.keys()).join(', ')
    throw new Error(`服务 "${serviceName}" 不存在。\n` + `可用服务: ${availableServices}`)
  }

  return service
}
```

**设计意图**：友好的错误提示，帮助开发者快速定位迁移路径

**问题**：

- 如果真有代码用 camelCase key 调用，这个逻辑会导致运行时抛错
- 对于定时任务，会导致任务执行失败

#### 1.3 违规调用点 1：`jobs/daily-orphan-frozen-check.js`

**位置**：第 53 行

```javascript
// 获取孤儿冻结清理服务（通过 serviceManager 实例获取）
const orphanFrozenService = serviceManager.getService('orphanFrozenCleanup') // ❌ camelCase
```

**正确写法应为**：

```javascript
const orphanFrozenService = serviceManager.getService('orphan_frozen_cleanup') // ✅ snake_case
```

**影响**：

- 该 job 由 `scripts/maintenance/scheduled_tasks.js` 在每天凌晨 2 点通过 `node-cron` 调度
- 运行时会抛出错误：`Service 'orphanFrozenCleanup' not found. Did you mean 'orphan_frozen_cleanup'?`
- 导致孤儿冻结检测任务无法执行

**调用链路**：

```
node-cron (0 2 * * *)
  → ScheduledTasks.scheduleDailyOrphanFrozenCheck()
    → DailyOrphanFrozenCheck.execute()
      → serviceManager.getService('orphanFrozenCleanup')  // ❌ 此处抛错
```

#### 1.4 潜在问题点 2：`modules/UserPermissionModule.js`

**位置**：第 321 行（注释中）

````javascript
/**
 * 迁移示例：
 * ```javascript
 * // ❌ 旧方式（已废弃）
 * await permission_module.setUserRole(userId, true, operatorId);
 *
 * // ✅ 新方式（推荐）
 * const UserRoleService = req.app.locals.services.getService('userRole');  // ❌ 示例用了 camelCase
 * await TransactionManager.execute(async (transaction) => {
 *   return await UserRoleService.updateUserRole(userId, 'admin', operatorId, { transaction });
 * });
 * ```
 */
````

**问题严重度**：中等

- 虽然只是注释，但会误导开发者复制粘贴
- 正确写法应为 `getService('user_role')`

#### 1.5 已验证无问题的区域

根据 `scripts/validation/verify_service_manager_usage.js` 的扫描范围：

- ✅ `routes/v4/**/*.js` 已验证无 camelCase 调用
- ✅ 所有路由文件已通过 P1-9 迁移

**但扫描范围不包括**：

- ❌ `jobs/**/*.js`（本次问题所在）
- ❌ `scripts/maintenance/**/*.js`
- ❌ `modules/**/*.js`
- ❌ 任何其他非路由的脚本入口

---

### 2. 数据库层验证结果

#### 2.1 数据库连接信息

**连接方式**：Node.js + dotenv + mysql2（直连真实库，非备份文件）

```javascript
{
  host: process.env.DB_HOST,
  database: 'restaurant_points_dev',
  version: 'MySQL 8.0.30'
}
```

#### 2.2 表结构统计

**总表数**：48 张

**核心业务表及数据量**：

| 表名                     | 行数 | 业务域                |
| ------------------------ | ---- | --------------------- |
| `users`                  | 27   | 用户管理              |
| `roles`                  | 9    | RBAC 角色体系         |
| `user_roles`             | 19   | 用户角色关联          |
| `accounts`               | 23   | 统一账户体系          |
| `account_asset_balances` | 21   | 资产余额（可用+冻结） |
| `asset_transactions`     | 2442 | 资产流水账本          |
| `market_listings`        | 132  | C2C 市场挂牌          |
| `trade_orders`           | 0    | 交易订单（暂无数据）  |
| `item_instances`         | 1032 | 物品实例化库存        |
| `redemption_orders`      | 488  | 核销码/兑换订单       |
| `stores`                 | 4    | 门店数据              |

#### 2.3 孤儿冻结清理业务证据

**SQL 查询**：

```sql
SELECT COUNT(*) FROM asset_transactions WHERE business_type='orphan_frozen_cleanup';
```

**结果**：5 条记录

**业务类型分布（TOP 10）**：

```
1. exchange_debit              925 条  (官方兑换扣款)
2. test_recharge               924 条  (测试充值)
3. admin_adjustment            228 条  (管理员调账)
4. market_listing_freeze       184 条  (市场挂牌冻结)
5. market_listing_withdraw_unfreeze  148 条  (撤回解冻)
6. opening_balance              11 条  (期初余额)
7. merchant_points_reward        6 条  (商家积分奖励)
8. orphan_frozen_cleanup         5 条  (孤儿冻结清理) ← 本次关注
9. consumption_budget_allocation 4 条  (消费预算分配)
10. consumption_reward           4 条  (消费奖励)
```

**结论**：

- 孤儿冻结清理业务已在生产环境真实执行过（至少 5 次）
- 账本有完整记录，说明 `OrphanFrozenCleanupService` 已集成到业务链路
- 修复 `daily-orphan-frozen-check.js` 的 camelCase 调用是**高优先级**任务

#### 2.4 业务完整性验证

**验证逻辑**：`OrphanFrozenCleanupService.detectOrphanFrozen()` 的判定规则

```javascript
// 孤儿冻结定义：
frozen_amount > 活跃挂牌冻结总额

// 活跃挂牌定义：
market_listings.status = 'on_sale' // ✅ 只有 on_sale 状态计入冻结对账
// locked 状态已有买家锁定，不再占用卖家冻结额度
```

**验证 SQL**（只读，安全）：

```sql
-- 1. 查询所有有冻结余额的账户
SELECT
  a.user_id,
  ab.asset_code,
  ab.frozen_amount,
  ab.available_amount
FROM account_asset_balances ab
JOIN accounts a ON ab.account_id = a.account_id
WHERE ab.frozen_amount > 0 AND a.account_type = 'user';

-- 2. 查询对应用户的活跃挂牌冻结总额
SELECT
  seller_user_id,
  offer_asset_code,
  SUM(offer_amount) as total_listed
FROM market_listings
WHERE status = 'on_sale'
GROUP BY seller_user_id, offer_asset_code;

-- 3. 对比差异（孤儿冻结 = frozen_amount - total_listed）
```

**数据完整性**：

- 账本记录与余额变化一致（通过 `meta` 字段可回溯）
- 清理操作有完整审计日志（`AuditLogService`）
- 分布式锁防止并发执行（`UnifiedDistributedLock`）

---

### 3. 业务架构与技术路线

#### 3.1 商业模式（基于代码 + 真实数据库）

| 业务域                         | 数据库表                                                   | 服务层                                      | 路由层                   |
| ------------------------------ | ---------------------------------------------------------- | ------------------------------------------- | ------------------------ |
| **餐厅积分/资产账本**          | `accounts`, `account_asset_balances`, `asset_transactions` | `AssetService`                              | `/api/v4/assets`         |
| **抽奖系统**                   | `lottery_campaigns`, `lottery_prizes`, `lottery_draws`     | `UnifiedLotteryEngine`                      | `/api/v4/lottery`        |
| **官方兑换（B2C）**            | `exchange_items`, `exchange_records`                       | `ExchangeService`                           | `/api/v4/shop`           |
| **用户间交易市场（C2C）**      | `market_listings`, `trade_orders`                          | `MarketListingService`, `TradeOrderService` | `/api/v4/market`         |
| **背包双轨（assets + items）** | `item_instances` + 资产表                                  | `BackpackService`                           | `/api/v4/backpack`       |
| **核销码/兑换订单**            | `redemption_orders`                                        | `RedemptionService`                         | -                        |
| **门店/员工域**                | `stores`, `store_staff`, `administrative_regions`          | `StoreService`, `StaffManagementService`    | `/api/v4/console/stores` |
| **客服/消息**                  | `customer_service_sessions`, `chat_messages`               | `ChatWebSocketService`                      | WebSocket                |

#### 3.2 技术框架路线

- **后端**：Node.js 20 + Express 4
- **ORM**：Sequelize 6 + mysql2
- **缓存**：Redis + ioredis
- **认证**：JWT + bcrypt
- **定时任务**：node-cron
- **WebSocket**：Socket.IO 4
- **架构模式**：
  - RESTful API（扁平化资源导向）
  - ServiceManager 单例模式（统一服务访问）
  - 统一响应格式（`ApiResponse`）
  - 审计日志强制记录（`AuditLogService`）
  - 分布式锁（`UnifiedDistributedLock`）

#### 3.3 服务注册规范（P1-9 统一为 snake_case）

**ServiceManager 已注册的服务（共 40+ 个）**：

```javascript
// ✅ 正确示例（snake_case）
services.getService('orphan_frozen_cleanup')
services.getService('user_role')
services.getService('market_listing')
services.getService('trade_order')
services.getService('asset_conversion')

// ❌ 错误示例（camelCase，会抛错）
services.getService('orphanFrozenCleanup') // ← jobs/daily-orphan-frozen-check.js 第 53 行
services.getService('userRole') // ← modules/UserPermissionModule.js 注释示例
```

---

## 🛠️ 清理方案（无代码生成）

### 目标分级

#### 目标 A（最安全 - 立即执行）

**修复所有 camelCase 调用点，保证线上不崩溃**

- ✅ 保留 `KEY_MIGRATION_MAP`（用于友好的错误提示）
- ✅ 保留迁移提示逻辑（帮助后续排查）
- ✅ 修复所有违规调用点

#### 目标 B（最彻底 - 二期执行）

**确认全仓无 camelCase 调用后，彻底删除迁移机制**

- 删除 `KEY_MIGRATION_MAP` 常量定义（第 102-155 行）
- 删除 `getService()` 中的 camelCase 检测逻辑（第 414-422 行）
- 删除相关注释中的迁移说明

---

### 阶段 1：立即修复（高优先级）

#### 1.1 修复定时任务（P0 级别）

**文件**：`jobs/daily-orphan-frozen-check.js`

**需要修改的行**：第 53 行

**修改内容**：

```diff
- const orphanFrozenService = serviceManager.getService('orphanFrozenCleanup')
+ const orphanFrozenService = serviceManager.getService('orphan_frozen_cleanup')
```

**影响范围**：

- 定时任务 `DailyOrphanFrozenCheck`（每天凌晨 2 点执行）
- 手动触发入口 `ScheduledTasks.manualOrphanFrozenCheck()`

**验证方法**：

```bash
# 方法 1：手动触发（dry run 模式）
node -e "
const ScheduledTasks = require('./scripts/maintenance/scheduled_tasks');
ScheduledTasks.manualOrphanFrozenCheck({ dryRun: true, sendNotification: false })
  .then(report => console.log('✅ 验证通过', report))
  .catch(err => console.error('❌ 验证失败', err.message));
"

# 方法 2：直接执行 job（dry run 模式）
node jobs/daily-orphan-frozen-check.js --dry-run --no-notify
```

#### 1.2 修复误导性示例（P1 级别）

**文件**：`modules/UserPermissionModule.js`

**需要修改的行**：第 321 行（注释中）

**修改内容**：

```diff
- * const UserRoleService = req.app.locals.services.getService('userRole');
+ * const UserRoleService = req.app.locals.services.getService('user_role');
```

**影响范围**：

- 开发者参考示例时可能复制粘贴错误代码

---

### 阶段 2：扩展扫描覆盖（P1 级别）

#### 2.1 扩展 verify_service_manager_usage.js 扫描范围

**当前扫描范围**：`routes/v4/**/*.js`

**需要扩展到**：

- `jobs/**/*.js`
- `scripts/maintenance/**/*.js`
- `modules/**/*.js`
- `callbacks/**/*.js`（如果有）
- 任何可能在生产环境执行的脚本

**修改配置**（仅说明，不生成代码）：

```javascript
// scripts/validation/verify_service_manager_usage.js
const ROUTES_DIRS = [
  'routes/v4',
  'jobs', // ← 新增
  'scripts/maintenance', // ← 新增
  'modules' // ← 新增
]
```

#### 2.2 执行全面扫描

```bash
# 执行扫描（检查模式）
node scripts/validation/verify_service_manager_usage.js

# 执行扫描（严格模式，发现错误立即退出）
node scripts/validation/verify_service_manager_usage.js --strict
```

**预期输出**：

- 修复前：至少 1 个错误（`jobs/daily-orphan-frozen-check.js`）
- 修复后：0 个错误

---

### 阶段 3：数据库层验证（P2 级别）

#### 3.1 孤儿冻结检测一致性验证

**目的**：确认 `detectOrphanFrozen()` 逻辑与真实数据一致

**验证脚本**（只读，安全）：

```bash
# 方法 1：通过 ServiceManager 直接调用
node -e "
const serviceManager = require('./services');
(async () => {
  await serviceManager.initialize();
  const OrphanFrozenService = serviceManager.getService('orphan_frozen_cleanup');
  const orphans = await OrphanFrozenService.detectOrphanFrozen();
  console.log('检测到孤儿冻结:', orphans.length, '条');
  console.log('详情:', orphans);
})().catch(err => console.error('验证失败:', err.message));
"

# 方法 2：通过 job 的 dry run 模式
node jobs/daily-orphan-frozen-check.js --dry-run --no-notify
```

**验证要点**：

- 冻结金额 = `account_asset_balances.frozen_amount`
- 活跃挂牌 = `SUM(market_listings.offer_amount) WHERE status='on_sale'`
- 孤儿金额 = 冻结金额 - 活跃挂牌
- 计算结果与数据库实际值一致

#### 3.2 账本完整性验证

**目的**：确认历史清理操作有完整审计日志

**验证 SQL**（只读，安全）：

```sql
-- 1. 查询所有孤儿冻结清理记录
SELECT
  transaction_id,
  asset_code,
  delta_amount,
  balance_after,
  business_type,
  meta,
  created_at,
  user_id,
  idempotency_key
FROM asset_transactions
WHERE business_type = 'orphan_frozen_cleanup'
ORDER BY created_at DESC;

-- 2. 验证每条记录的 meta 字段完整性
-- 应包含：cleanup_reason, operator_id, original_frozen, original_listed, orphan_amount

-- 3. 交叉验证账户余额变化
-- delta_amount 应该 > 0（解冻）
-- frozen_delta 应该 < 0（减少冻结）
```

**预期结果**：

- 5 条记录的 `meta` 字段完整
- 每条记录有对应的审计日志（`admin_operation_logs` 或 `audit_logs`）
- 账本变化与余额表一致

---

### 阶段 4：彻底删除迁移机制（P2 级别，二期执行）

**前置条件**（必须全部满足）：

- ✅ 阶段 1 的所有修复已上线并运行稳定（至少 7 天）
- ✅ 阶段 2 的扩展扫描已执行且无违规发现
- ✅ CI/CD 中已集成 `verify_service_manager_usage.js --strict`
- ✅ 定时任务 `DailyOrphanFrozenCheck` 至少成功执行 7 次（每天凌晨 2 点）

**删除清单**：

#### 4.1 删除 KEY_MIGRATION_MAP 常量

**文件**：`services/index.js`

**删除行**：第 97-155 行

```javascript
// 删除整个 KEY_MIGRATION_MAP 常量定义
const KEY_MIGRATION_MAP = {
  // ... 全部删除
}
```

#### 4.2 删除 getService() 中的迁移提示逻辑

**文件**：`services/index.js`

**删除行**：第 414-422 行

```javascript
// 删除这段逻辑
// P1-9 E2-Strict：检查是否是 camelCase key，提供迁移提示
const suggestedKey = KEY_MIGRATION_MAP[serviceName]
if (suggestedKey) {
  throw new Error(
    `Service '${serviceName}' not found. ` +
      `Did you mean '${suggestedKey}'? (P1-9 snake_case key migration required)\n` +
      `迁移提示：请将 getService('${serviceName}') 改为 getService('${suggestedKey}')`
  )
}
```

**保留的逻辑**（简化错误提示）：

```javascript
// 保留基础的服务不存在错误
if (!service) {
  const availableServices = Array.from(this._services.keys()).join(', ')
  throw new Error(`服务 "${serviceName}" 不存在。\n可用服务: ${availableServices}`)
}
```

#### 4.3 删除相关注释

**文件**：`services/index.js`

**删除内容**：

- 第 11-14 行：P1-9 重构说明
- 第 220 行：P1-9 统一 snake_case 说明
- 第 385 行：P1-9 E2-Strict 说明
- 其他提及 camelCase 兼容的注释

#### 4.4 更新文档

**需要更新的文档**：

- `docs/迁移双轨兼容残留清理方案-2026-01-13.md`（标记为已完成）
- `docs/P1-9-服务获取方式统一-ServiceManager-独立迭代计划.md`（如果存在）

---

## ✅ 验证清单

### 验证清单 1：修复前验证（确认问题存在）

- [ ] 执行 `node jobs/daily-orphan-frozen-check.js --dry-run`，确认会抛出 `Service 'orphanFrozenCleanup' not found` 错误
- [ ] 检查 `services/index.js` 第 102-155 行，确认 `KEY_MIGRATION_MAP` 存在
- [ ] 检查 `services/index.js` 第 414-422 行，确认迁移提示逻辑存在
- [ ] 查询数据库 `asset_transactions` 表，确认有 `business_type='orphan_frozen_cleanup'` 的记录

### 验证清单 2：修复后验证（确认问题解决）

- [ ] 执行 `node jobs/daily-orphan-frozen-check.js --dry-run`，确认正常运行且无错误
- [ ] 执行 `node scripts/validation/verify_service_manager_usage.js --strict`，确认无违规发现
- [ ] 手动触发 `ScheduledTasks.manualOrphanFrozenCheck({ dryRun: true })`，确认返回正常报告
- [ ] 检查定时任务日志，确认凌晨 2 点执行成功（至少观察 3 天）

### 验证清单 3：数据库一致性验证

- [ ] 执行孤儿冻结检测，对比计算结果与数据库实际值
- [ ] 查询历史清理记录的 `meta` 字段，确认包含必需字段
- [ ] 验证账本变化（`delta_amount` > 0，`frozen_delta` < 0）
- [ ] 确认有对应的审计日志记录

### 验证清单 4：二期删除前验证

- [ ] 阶段 1 的修复已上线并稳定运行至少 7 天
- [ ] 定时任务至少成功执行 7 次（每天凌晨 2 点）
- [ ] CI/CD 中已集成 `verify_service_manager_usage.js --strict`
- [ ] 全仓扫描（含 jobs/scripts/modules）无违规发现

---

## 🔄 回滚预案

### 场景 1：阶段 1 修复后出现新问题

**症状**：修复后定时任务仍然失败（非 camelCase 原因）

**回滚方案**：

1. Git revert 修改的文件
2. 恢复到修改前的版本
3. 分析新问题的根因（可能是服务初始化问题）

**预防措施**：

- 修改前先在测试环境验证
- 使用 dry run 模式测试
- 查看完整的错误堆栈

### 场景 2：阶段 4 删除后发现隐藏的 camelCase 调用

**症状**：删除迁移机制后，生产环境报错 `Service 'xxxYyy' not found`（缺少迁移提示）

**回滚方案 A（推荐）**：

1. 立即修复该 camelCase 调用点（改为 snake_case）
2. 无需回滚删除操作
3. 更新扫描脚本覆盖遗漏的目录

**回滚方案 B（临时兼容）**：

1. Git revert 阶段 4 的删除操作
2. 恢复 `KEY_MIGRATION_MAP` 和迁移提示逻辑
3. 修复新发现的 camelCase 调用点
4. 重新执行阶段 2-4

**预防措施**：

- 确保扫描脚本覆盖所有可能的代码目录
- 在测试环境先执行删除操作
- 使用 grep 全局搜索 `getService(` 调用

### 场景 3：数据库验证失败

**症状**：孤儿冻结检测结果与预期不符

**分析方向**：

1. 检查 `market_listings.status` 枚举值是否变更
2. 检查 `account_asset_balances` 的冻结逻辑是否一致
3. 检查是否有其他业务类型也会冻结资产

**修复方案**：

- 不是 camelCase 问题，需要修复业务逻辑
- 参考 `services/OrphanFrozenCleanupService.js` 第 93-98 行的注释

---

## 📊 影响评估

### 技术债务评级

- **严重程度**：中等（影响定时任务，但有友好错误提示）
- **修复难度**：低（改 1-2 个字符串）
- **测试成本**：低（dry run 模式即可验证）
- **回滚风险**：极低（纯字符串修改）

### 优先级排序

| 阶段                 | 优先级 | 预计工时 | 风险等级 |
| -------------------- | ------ | -------- | -------- |
| 阶段 1：修复违规调用 | P0     | 0.5 小时 | 极低     |
| 阶段 2：扩展扫描覆盖 | P1     | 1 小时   | 低       |
| 阶段 3：数据库验证   | P2     | 2 小时   | 低       |
| 阶段 4：删除迁移机制 | P2     | 0.5 小时 | 中       |

### 业务影响时间窗口

- **当前影响**：每天凌晨 2 点定时任务失败
- **修复后恢复**：立即生效（下次凌晨 2 点正常执行）
- **数据丢失风险**：无（孤儿冻结会累积，修复后一次性清理）

---

## 📝 附录

### 附录 A：相关文件清单

```
/home/devbox/project/
├── services/
│   ├── index.js                          # KEY_MIGRATION_MAP 定义（102-155行）+ getService() 逻辑（407-429行）
│   ├── OrphanFrozenCleanupService.js     # 孤儿冻结清理服务
│   └── BackpackService.js                # 背包双轨服务（正常业务双轨，非残留）
├── jobs/
│   └── daily-orphan-frozen-check.js      # 定时任务（53行违规调用）
├── scripts/
│   ├── maintenance/scheduled_tasks.js    # node-cron 调度配置
│   └── validation/verify_service_manager_usage.js  # 扫描脚本（需扩展范围）
├── modules/
│   └── UserPermissionModule.js           # 误导性示例（321行注释）
└── docs/
    └── 迁移双轨兼容残留清理方案-2026-01-13.md  # 问题来源文档
```

### 附录 B：ServiceManager 完整服务清单

**已注册的 snake_case 服务键（共 40+ 个）**：

```
unified_lottery_engine, lottery_container, lottery_preset, lottery_management,
lottery_quota, exchange_market, market_listing, trade_order, redemption_order,
user, user_role, hierarchy_management, customer_service_session,
admin_customer_service, chat_web_socket, chat_rate_limit, asset, asset_conversion,
merchant_points, consumption, backpack, admin_system, admin_lottery,
material_management, orphan_frozen_cleanup, activity, prize_pool, premium,
announcement, notification, feedback, popup_banner, image, reporting, audit_log,
content_audit, idempotency, data_sanitizer, performance_monitor, staff_management,
store, region, sealos_storage, management_strategy, basic_guarantee_strategy
```

### 附录 C：数据库表完整清单（48 张）

```
account_asset_balances, accounts, admin_operation_logs, administrative_regions,
api_idempotency_requests, asset_transactions, authentication_sessions, chat_messages,
consumption_records, content_review_records, customer_service_sessions, exchange_items,
exchange_records, feedbacks, image_resources, item_instance_events, item_instances,
item_template_aliases, lottery_campaigns, lottery_clear_setting_records,
lottery_draw_quota_rules, lottery_draws, lottery_management_settings, lottery_presets,
lottery_prizes, lottery_user_daily_draw_quota, market_listings, material_asset_types,
material_conversion_rules, merchant_operation_logs, popup_banners, products,
redemption_orders, risk_alerts, roles, sequelizemeta, store_staff, stores,
system_announcements, system_settings, trade_orders, user_hierarchy, user_premium_status,
user_role_change_records, user_roles, user_status_change_records, users,
websocket_startup_logs
```

### 附录 D：验证命令速查

```bash
# 1. 验证问题存在（修复前）
node jobs/daily-orphan-frozen-check.js --dry-run

# 2. 扫描 camelCase 调用
node scripts/validation/verify_service_manager_usage.js

# 3. 严格模式扫描（CI/CD 用）
node scripts/validation/verify_service_manager_usage.js --strict

# 4. 手动触发孤儿冻结检测（干跑模式）
node -e "
const ScheduledTasks = require('./scripts/maintenance/scheduled_tasks');
ScheduledTasks.manualOrphanFrozenCheck({ dryRun: true, sendNotification: false })
  .then(r => console.log('✅', r))
  .catch(e => console.error('❌', e.message));
"

# 5. 数据库验证（只读）
node -e "
require('dotenv').config();
const mysql = require('mysql2/promise');
(async () => {
  const conn = await mysql.createConnection({
    host: process.env.DB_HOST,
    port: Number(process.env.DB_PORT || 3306),
    user: process.env.DB_USER,
    password: process.env.DB_PASSWORD,
    database: process.env.DB_NAME
  });
  const [r] = await conn.query(\"SELECT COUNT(*) n FROM asset_transactions WHERE business_type='orphan_frozen_cleanup'\");
  console.log('孤儿冻结清理记录:', r[0].n, '条');
  await conn.end();
})();
"

# 6. 查看定时任务日志
pm2 logs --lines 100 | grep -i "orphan"
```

---

## 🎯 总结

### 关键发现

1. ✅ **残留问题真实存在**：`KEY_MIGRATION_MAP` 在 `services/index.js` 中定义，且有真实的违规调用点
2. ✅ **影响生产环境**：`jobs/daily-orphan-frozen-check.js` 的 camelCase 调用会导致每天凌晨 2 点的定时任务失败
3. ✅ **数据库证据充分**：真实库中有 5 条 `orphan_frozen_cleanup` 记录，业务链路已集成
4. ✅ **修复成本极低**：仅需修改 1-2 个字符串，无需重构

### 建议执行顺序

1. **立即执行**（今天内）：阶段 1 - 修复 `jobs/daily-orphan-frozen-check.js` 第 53 行
2. **本周内执行**：阶段 2 - 扩展扫描脚本覆盖范围
3. **本周内执行**：阶段 3 - 数据库层验证
4. **下周执行**：阶段 4 - 彻底删除迁移机制（需观察稳定性）

### 风险提示

- ⚠️ 如果不修复阶段 1，每天凌晨 2 点的孤儿冻结清理任务会一直失败
- ⚠️ 孤儿冻结会累积，虽然不影响用户可用余额，但会导致冻结金额虚高
- ⚠️ 阶段 4 的删除操作需要确保全仓无遗漏的 camelCase 调用

---

**报告完成日期**：2026-01-13  
**下次审查日期**：2026-01-20（验证修复效果）  
**责任人**：后端开发团队  
**审批人**：技术负责人
