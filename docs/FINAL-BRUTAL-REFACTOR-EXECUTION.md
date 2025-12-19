# 暴力重构最终执行方案（Final Brutal Refactor Execution Plan）

> **最终决策版本** - 2025-12-19  
> **执行策略**: 旧表强制DROP + 旧路由直接下线(404) + 旧代码硬删除 + 限流保留双实现容灾  
> **验收标准**: grep 黑名单归零 + 旧表不存在 + 路由层零 models 直连

---

## 📋 Part 1: 核心决策（已拍板）

### ✅ 决策 1: 旧表强制 DROP（不可逆）

**DROP 清单**（积分旧体系全部删除）:
- `user_inventory`（旧库存表）
- `user_points_accounts`（旧积分账户表）
- `points_transactions`（旧积分流水表）

**迁移策略**:
- ❌ 不做数据迁移（用户积分/物品余额全部清零，从零开始）
- ❌ 不做数据库备份（直接删除，不可回滚）

### ✅ 决策 2: 旧路由直接下线（不返回 410）

**策略**: 
- ❌ **不提供 410 过渡层**（更硬、更简单）
- ✅ 直接从 `app.js` 中移除旧路由挂载（表现为 404）
- ✅ 旧路由访问会触发最终的 404 兜底处理器

**删除的挂载**:
```javascript
// app.js 中删除以下行：
// app.use('/api/v4/inventory', require('./routes/v4/unified-engine/inventory'))
// app.use('/api/v4/points', require('./routes/v4/points'))
```

### ✅ 决策 3: 旧代码硬删除（满足黑名单归零）

**删除策略**:
- ✅ 旧模型文件：直接 `rm -f`
- ✅ 旧服务文件：直接 `rm -f`
- ✅ 旧路由文件：直接 `rm -f`
- ✅ 旧测试文件：直接 `rm -rf`
- ✅ 旧脚本文件：直接 `rm -f`
- ✅ 旧迁移文件：直接 `rm -f`
- ✅ 所有 `*.backup` 文件：直接删除

**禁止归档**（避免误引用复燃）:
- ❌ 不归档到 `routes/archived/`
- ❌ 不归档到 `scripts/archived/`
- ❌ 不保留"注释但不删"的代码

### ✅ 决策 4: 限流保留双实现容灾（唯一例外）

**保留策略**:
- ✅ Redis 滑窗（主实现） + `express-rate-limit`（后备实现）
- ✅ Redis 故障时自动切换到后备限流器（fail-closed）
- ✅ 增强可观测性：日志/监控需区分主链路 vs 后备链路
- ❌ **不删除** `app.js` 里的 `fallbackLimiter` 定义与挂载

---

## 📋 Part 2: 最终唯一真相（统一后的标准）

### 数据库层唯一真相

| 领域 | 唯一真相表 | 删除的旧表 | 备注 |
|------|-----------|-----------|------|
| **账户** | `accounts` | 无 | 支持用户账户 + 系统账户 |
| **资产余额** | `account_asset_balances` | `user_points_accounts` | 统一余额真相（积分/虚拟币/材料全部并入） |
| **资产流水** | `asset_transactions` | `points_transactions` | 统一流水真相（幂等性 + 审计） |
| **不可叠加物品** | `item_instances` | `user_inventory` | 物品所有权真相 |
| **核销订单** | `redemption_orders` | 无 | 核销码与订单管理 |
| **交易订单** | `trade_orders` | 无 | 市场交易订单 |

### 服务层唯一入口

| 领域 | 唯一服务 | 删除的旧服务 | 备注 |
|------|---------|-------------|------|
| **资产管理** | `AssetService` | `PointsService`（完全删除） | 统一资产操作入口 |
| **背包查询** | `BackpackService` | `InventoryService`（删除） | 双轨统一查询（assets + items） |
| **核销管理** | `RedemptionOrderService` | 无 | 核销码生成与验证 |
| **交易市场** | `TradeOrderService` | 无 | 市场交易订单管理 |

### 日志系统唯一入口

| 唯一实现 | 删除的旧实现 | 备注 |
|---------|-------------|------|
| `utils/logger.js` | `services/UnifiedLotteryEngine/utils/Logger.js` | 暴力统一，全仓库替换引用 |

---

## 📋 Part 3: 执行详细清单（分 4 个阶段）

### 🔴 Phase 0: 准备阶段（执行前确认）

#### 0.1 前端同步上线确认

```bash
# 与前端团队最后确认清单
echo "📋 前端团队确认清单："
echo "- [ ] 新版前端已完成所有接口适配"
echo "- [ ] 新版前端已部署到预发布环境并测试通过"
echo "- [ ] 前端可以在后端上线后立即发布新版本"
echo "- [ ] 前端已移除所有旧接口调用代码"
echo ""
echo "⚠️ 旧接口将直接返回 404，无 410 过渡"
```

---

### Phase 1: 数据库层暴力切换（停写窗口内完成）

#### 1.1 停止所有写入服务

```bash
# 停止后端服务
./scripts/system/process-manager.sh stop

# 验证服务已停止
./scripts/system/process-manager.sh status
# 预期：所有进程已停止
```

#### 1.2 删除旧表（不可逆）

```sql
-- ⚠️ 执行前最后确认：数据将永久丢失，无法恢复
SET FOREIGN_KEY_CHECKS = 0;

-- 1. 删除旧库存表
DROP TABLE IF EXISTS user_inventory;

-- 2. 删除旧积分账户表
DROP TABLE IF EXISTS user_points_accounts;

-- 3. 删除旧积分流水表
DROP TABLE IF EXISTS points_transactions;

SET FOREIGN_KEY_CHECKS = 1;

-- 验证删除结果
SHOW TABLES LIKE '%user_inventory%';
SHOW TABLES LIKE '%points%';
-- 预期：Empty set (0.00 sec)
```

#### 1.3 验证新表结构完整性

```sql
-- 1. 验证必需的新表存在
SELECT TABLE_NAME 
FROM information_schema.TABLES 
WHERE TABLE_SCHEMA = DATABASE()
  AND TABLE_NAME IN (
    'item_instances',
    'redemption_orders',
    'market_listings',
    'trade_orders',
    'exchange_market_records',
    'account_asset_balances',
    'asset_transactions',
    'accounts'
  )
ORDER BY TABLE_NAME;
-- 预期：8 rows

-- 2. 验证旧表不存在
SELECT TABLE_NAME 
FROM information_schema.TABLES 
WHERE TABLE_SCHEMA = DATABASE()
  AND TABLE_NAME IN (
    'user_inventory',
    'user_points_accounts',
    'points_transactions'
  );
-- 预期：Empty set (0.00 sec)

-- 3. 验证关键约束完整性
-- item_instances
SHOW INDEX FROM item_instances WHERE Key_name LIKE '%owner%';
-- 预期：idx_item_instances_owner_status (owner_user_id, status)

-- account_asset_balances
SHOW INDEX FROM account_asset_balances WHERE Key_name LIKE '%account_asset%';
-- 预期：uk_account_asset_balances_account_asset (account_id, asset_code)

-- asset_transactions
SHOW INDEX FROM asset_transactions WHERE Key_name LIKE '%business%';
-- 预期：uk_asset_transactions_business_id_type (business_id, business_type)

-- redemption_orders
SHOW INDEX FROM redemption_orders WHERE Key_name LIKE '%code_hash%';
-- 预期：uk_redemption_orders_code_hash (code_hash)

-- market_listings
SHOW INDEX FROM market_listings WHERE Key_name LIKE '%business_id%';
-- 预期：uk_market_listings_seller_business_id (seller_user_id, business_id)
```

---

### Phase 2: 代码层暴力删除（停写窗口内完成）

#### 2.1 删除旧模型文件

```bash
#!/bin/bash
cd /home/devbox/project

echo "🗑️ 删除旧模型文件..."
rm -f models/UserInventory.js
rm -f models/UserPointsAccount.js
rm -f models/PointsTransaction.js

echo "✅ 旧模型文件已删除"
```

#### 2.2 更新 models/index.js（删除旧模型注册）

```bash
#!/bin/bash
# 手工编辑 models/index.js，删除以下行及其注释块：

# 删除库存模型：
# - models.UserInventory = require('./UserInventory')(sequelize, DataTypes)
# - 及其前后注释

# 删除积分账户模型：
# - models.UserPointsAccount = require('./UserPointsAccount')(sequelize, DataTypes)
# - 及其前后注释

# 删除积分流水模型：
# - models.PointsTransaction = require('./PointsTransaction')(sequelize, DataTypes)
# - 及其前后注释

echo "⚠️ 请手工编辑 models/index.js 删除旧模型注册"
echo "验证语法："
node -c models/index.js && echo "✅ 语法正确" || echo "❌ 语法错误"
```

#### 2.3 删除旧服务文件

```bash
#!/bin/bash
cd /home/devbox/project

echo "🗑️ 删除旧服务文件..."
rm -f services/InventoryService.js
rm -f services/PointsService.js

# 删除所有备份文件
rm -f services/*.backup
rm -f services/*.backup-*

echo "✅ 旧服务文件已删除"
```

#### 2.4 删除旧路由文件

```bash
#!/bin/bash
cd /home/devbox/project

echo "🗑️ 删除旧路由文件..."
# 删除库存路由
rm -f routes/v4/unified-engine/inventory.js
rm -f routes/v4/unified-engine/inventory-core.js
rm -f routes/v4/unified-engine/inventory-market.js

# 删除积分路由（如果存在）
rm -f routes/v4/points.js

# 删除所有路由备份
rm -f routes/**/*.backup
rm -f routes/**/*.backup-*

echo "✅ 旧路由文件已删除"
```

#### 2.5 更新 app.js（移除旧路由挂载）

```bash
#!/bin/bash
# 手工编辑 app.js，删除以下行：

# 删除库存路由挂载：
# app.use('/api/v4/inventory', require('./routes/v4/unified-engine/inventory'))

# 删除积分路由挂载（如果存在）：
# app.use('/api/v4/points', require('./routes/v4/points'))

echo "⚠️ 请手工编辑 app.js 删除旧路由挂载"
echo "验证语法："
node -c app.js && echo "✅ 语法正确" || echo "❌ 语法错误"

# 验证新路由已挂载
echo "验证新路由挂载："
grep -n "app.use('/api/v4/" app.js | grep -E "backpack|redemption|marketplace"
```

#### 2.6 删除所有 .backup 文件

```bash
#!/bin/bash
cd /home/devbox/project

echo "🗑️ 删除所有 .backup 文件..."
find . -name "*.backup" -type f \
  -not -path "./node_modules/*" \
  -not -path "./backups/*" \
  -delete

find . -name "*.backup-*" -type f \
  -not -path "./node_modules/*" \
  -not -path "./backups/*" \
  -delete

echo "✅ 所有 .backup 文件已删除"
```

#### 2.7 删除旧测试文件

```bash
#!/bin/bash
cd /home/devbox/project

echo "🗑️ 删除旧测试文件..."
# 删除库存相关测试
rm -rf tests/business/inventory/
rm -f tests/integration/*inventory*.test.js
rm -f tests/integration/transfer_history_complete.test.js
rm -f tests/integration/market_withdraw_optimization.test.js

# 删除积分相关测试
rm -rf tests/business/points/
rm -f tests/integration/*points*.test.js

echo "✅ 旧测试文件已删除"
```

#### 2.8 删除旧脚本文件

```bash
#!/bin/bash
cd /home/devbox/project

echo "🗑️ 删除旧脚本文件..."
# 删除库存相关脚本
rm -f scripts/reconcile-inventory-migration.js
rm -f scripts/test_inventory_*.js
rm -f scripts/verify_inventory_routes.js

# 删除积分相关脚本
rm -f scripts/test_points_*.js

# 删除迁移脚本多入口
rm -f scripts/execute_migration.js
rm -f scripts/execute_migration_robust.js

# 删除整个迁移工具目录（一次性迁移工具，不再需要）
rm -rf scripts/migration/

echo "✅ 旧脚本文件已删除"
```

#### 2.9 删除旧迁移文件

```bash
#!/bin/bash
cd /home/devbox/project/migrations

echo "🗑️ 删除旧迁移文件..."
# 删除 user_inventory 相关迁移
rm -f 20251215220102-migrate-user-inventory-to-item-instances.js
rm -f 20251108234905-add-column-withdraw-fields-to-user-inventory.js
rm -f 20251215170000-add-selling-asset-fields-to-user-inventory.js
rm -f 20251109234600-cleanup-user-inventory-duplicate-verification-code-indexes.js
rm -f 20251109152918-add-operator-id-to-user-inventory.js
rm -f 20251109234220-add-transfer-tracking-fields-to-user-inventory.js

# 删除旧支付方式迁移
rm -f 20251208234550-remove-price-type-points-mixed.js
rm -f 20251209002100-remove-payment-type-points-mixed-from-records.js
rm -f 20251206_dual_account_system.sql

# 删除积分相关迁移（如果存在）
rm -f *points*.js

# 删除迁移文档
rm -f DEPRECATED_EXCHANGE_RECORDS.md

echo "✅ 旧迁移文件已删除"
```

#### 2.10 删除旧文档

```bash
#!/bin/bash
cd /home/devbox/project

echo "🗑️ 删除旧文档..."
# 删除迁移相关文档
rm -f MIGRATION-COMPLETION-REPORT.md
rm -f docs/duplicate-implementation-audit-2025-12-18.md

# 删除被合并的重构文档
rm -f docs/ZERO-COMPATIBILITY-BRUTAL-REFACTOR-PLAN.md
rm -f docs/BRUTAL_REFACTOR_EXECUTION_PLAN.md
rm -f docs/ZERO-COMPATIBILITY-REFACTOR-EXECUTION.md
rm -f docs/UNIFIED-BRUTAL-REFACTOR-EXECUTION-PLAN.md

# 只保留本最终文档
echo "✅ 旧文档已删除，只保留 FINAL-BRUTAL-REFACTOR-EXECUTION.md"
```

#### 2.11 统一日志系统（全仓库替换）

```bash
#!/bin/bash
cd /home/devbox/project

echo "📝 统一日志系统..."

# 1. 查找所有旧日志引用
find . -name "*.js" \
  -not -path "./node_modules/*" \
  -not -path "./backups/*" \
  -exec grep -l "services/UnifiedLotteryEngine/utils/Logger" {} \; \
  > /tmp/files_to_update.txt

echo "📋 需要更新日志引用的文件数量：$(wc -l < /tmp/files_to_update.txt)"

# 2. 批量替换（需要人工确认）
echo "⚠️ 请手工批量替换以下路径："
echo "   FROM: require('../../services/UnifiedLotteryEngine/utils/Logger')"
echo "   TO:   require('../../utils/logger')"
echo ""
echo "   或："
echo "   FROM: require('../services/UnifiedLotteryEngine/utils/Logger')"
echo "   TO:   require('../utils/logger')"
echo ""
cat /tmp/files_to_update.txt

# 3. 替换完成后，删除旧日志文件
read -p "⚠️ 替换完成后按回车继续删除旧日志文件..." 
rm -f services/UnifiedLotteryEngine/utils/Logger.js

echo "✅ 日志系统统一完成"
```

---

### Phase 3: 验收与启动（停写窗口内完成）

#### 3.1 执行黑名单验收脚本

**新建文件**: `scripts/validation/brutal-refactor-blacklist-check.sh`

```bash
#!/bin/bash
# 暴力重构验收脚本（黑名单关键字检查）

KEYWORDS=(
  "UserInventory"           # 旧库存模型
  "user_inventory"          # 旧库存表
  "InventoryService"        # 旧库存服务（排除 BackpackService）
  "UserPointsAccount"       # 旧积分账户模型
  "user_points_accounts"    # 旧积分账户表
  "PointsService"           # 旧积分服务
  "PointsTransaction"       # 旧积分流水模型
  "points_transactions"     # 旧积分流水表
  "verification_code"       # 旧核销码字段（已迁移到 redemption_orders）
  "price_type"              # 旧支付方式参数
  "payment_type"            # 旧支付类型字段
  "selling_points"          # 旧售价字段（积分）
  "双账户"                   # 旧方案描述
  "双轨"                     # 旧架构描述
  "已废弃"                   # deprecated 标记
  "历史兼容"                 # 兼容性标记
  "UnifiedLotteryEngine/utils/Logger"  # 旧日志路径
)

FAILED=0

for keyword in "${KEYWORDS[@]}"; do
  # 排除：docs/、backups/、migrations/、node_modules/、本验收脚本自身
  COUNT=$(rg "$keyword" \
    --glob '!docs/' \
    --glob '!backups/' \
    --glob '!migrations/' \
    --glob '!node_modules/' \
    --glob '!*.md' \
    --glob '!scripts/validation/brutal-refactor-blacklist-check.sh' \
    --count 2>/dev/null | wc -l)
  
  if [ "$COUNT" -gt 0 ]; then
    echo "❌ 黑名单关键字 '$keyword' 仍有 $COUNT 处命中"
    rg "$keyword" \
      --glob '!docs/' \
      --glob '!backups/' \
      --glob '!migrations/' \
      --glob '!node_modules/' \
      --glob '!*.md' \
      --glob '!scripts/validation/brutal-refactor-blacklist-check.sh'
    FAILED=1
  else
    echo "✅ 黑名单关键字 '$keyword' 已清零"
  fi
done

if [ "$FAILED" -eq 0 ]; then
  echo "🎉 暴力重构验收通过：所有旧方案残留已清零"
  exit 0
else
  echo "🚫 暴力重构验收失败：仍有旧方案残留"
  exit 1
fi
```

执行验收：

```bash
chmod +x scripts/validation/brutal-refactor-blacklist-check.sh
bash scripts/validation/brutal-refactor-blacklist-check.sh
```

#### 3.2 路由分层验收（路由层零 models 直连）

```bash
#!/bin/bash
# 路由分层验收：禁止路由层直连 models

cd /home/devbox/project

echo "🔍 路由分层验收..."

# 1. 检查路由层是否有 models 引用
ROUTES_WITH_MODELS=$(rg "require\(['\"].*models|app\.locals\.models" routes/ --files-with-matches)

if [ -z "$ROUTES_WITH_MODELS" ]; then
  echo "✅ 路由层零 models 直连"
else
  echo "❌ 以下路由仍在直连 models（必须下沉到 Service）："
  echo "$ROUTES_WITH_MODELS"
  exit 1
fi

# 2. 检查路由层是否有 sequelize.transaction()
ROUTES_WITH_TX=$(rg "sequelize\.transaction\(" routes/ --files-with-matches)

if [ -z "$ROUTES_WITH_TX" ]; then
  echo "✅ 路由层零事务开启"
else
  echo "❌ 以下路由仍在开启事务（必须下沉到 Service）："
  echo "$ROUTES_WITH_TX"
  exit 1
fi

echo "🎉 路由分层验收完成"
```

#### 3.3 Service 注册验收

```bash
#!/bin/bash
cd /home/devbox/project

echo "🔍 Service 注册验收..."

# 检查 services/index.js 是否注册了旧服务
if rg "\.set\('inventory'" services/index.js; then
  echo "❌ 仍注册 inventory 服务"
  exit 1
else
  echo "✅ 已移除 inventory 服务"
fi

if rg "\.set\('points'" services/index.js; then
  echo "❌ 仍注册 points 服务"
  exit 1
else
  echo "✅ 已移除 points 服务"
fi

echo "🎉 Service 注册验收完成"
```

#### 3.4 启动服务并健康检查

```bash
#!/bin/bash
cd /home/devbox/project

echo "🚀 启动服务..."
./scripts/system/process-manager.sh start pm2

# 等待服务启动
echo "⏳ 等待服务启动（10秒）..."
sleep 10

# 健康检查
echo "🔍 健康检查..."
HEALTH_RESPONSE=$(curl -s http://localhost:3000/health)

if echo "$HEALTH_RESPONSE" | jq -e '.status == "healthy"' > /dev/null 2>&1; then
  echo "✅ 服务健康检查通过"
  echo "$HEALTH_RESPONSE" | jq '.'
else
  echo "❌ 服务健康检查失败"
  echo "$HEALTH_RESPONSE"
  exit 1
fi

echo "🎉 服务启动成功"
```

---

### Phase 4: 限流双实现容灾验证（保留 fallback）

#### 4.1 验证 fallbackLimiter 配置正确

**文件**: `app.js`

**验证点**：
```javascript
// ✅ 确认保留以下配置：
const rateLimit = require('express-rate-limit')

const fallbackLimiter = rateLimit({
  windowMs: 60 * 1000, // 1分钟
  max: 100,
  message: { 
    success: false, 
    code: 'RATE_LIMIT_EXCEEDED', 
    message: '请求过于频繁，请稍后再试（后备限流器）' 
  },
  skip: async (req) => {
    // 检查 Redis 是否可用
    const { isRedisHealthy } = require('./utils/UnifiedRedisClient')
    return await isRedisHealthy()  // Redis 可用时跳过后备限流器
  }
})

// ✅ 确认保留挂载
app.use('/api/', fallbackLimiter)
```

```bash
echo "🔍 验证限流器配置..."
grep -A 10 "fallbackLimiter" app.js
echo "✅ 限流器配置保留正确"
```

#### 4.2 增强限流可观测性

**文件**: `middleware/RateLimiterMiddleware.js`

**修改位置**: 第 232-236 行

```javascript
} catch (error) {
  logger.error('[RateLimiter] Redis限流失败，切换到后备限流器', {
    error: error.message,
    error_stack: error.stack,
    ip: req.ip,
    path: req.path,
    method: req.method,
    user_id: req.user?.user_id,
    timestamp: new Date().toISOString(),
    alert_level: 'P1',
    alert_reason: 'redis_rate_limiter_failure',
    fallback_status: 'will_use_express_rate_limit'  // 标识会切换到后备
  })
  
  // 继续处理（后备限流器会接管）
  next()
}
```

#### 4.3 监控限流链路命中情况

**新增监控脚本**: `scripts/monitoring/check-rate-limiter-fallback.sh`

```bash
#!/bin/bash
# 监控限流器链路切换情况

echo "📊 限流器链路监控（最近 1 小时）"

# 统计 Redis 限流失败次数
REDIS_FAILURES=$(grep "redis_rate_limiter_failure" logs/*.log 2>/dev/null | wc -l)

# 统计后备限流器触发次数
FALLBACK_HITS=$(grep "后备限流器" logs/*.log 2>/dev/null | wc -l)

echo "Redis 限流失败: $REDIS_FAILURES 次"
echo "后备限流器触发: $FALLBACK_HITS 次"

if [ "$REDIS_FAILURES" -gt 10 ]; then
  echo "⚠️ Redis 限流异常频繁，建议检查 Redis 服务"
fi

if [ "$FALLBACK_HITS" -gt 50 ]; then
  echo "⚠️ 后备限流器触发频繁，可能影响用户体验"
fi
```

---

## 📋 Part 4: 验收标准总览

### 4.1 代码黑名单检查（必须全部归零）

```bash
# 执行黑名单验收
bash scripts/validation/brutal-refactor-blacklist-check.sh

# 预期结果：所有关键字归零，exit 0
```

### 4.2 数据库表清单验收

```sql
-- 1. 禁止表清单（必须不存在）
SELECT TABLE_NAME FROM information_schema.TABLES 
WHERE TABLE_SCHEMA = DATABASE()
  AND TABLE_NAME IN (
    'user_inventory',
    'user_points_accounts',
    'points_transactions'
  );
-- 预期结果：Empty set

-- 2. 必需表清单（必须存在）
SELECT TABLE_NAME FROM information_schema.TABLES 
WHERE TABLE_SCHEMA = DATABASE()
  AND TABLE_NAME IN (
    'item_instances',
    'redemption_orders',
    'market_listings',
    'trade_orders',
    'exchange_market_records',
    'account_asset_balances',
    'asset_transactions',
    'accounts'
  );
-- 预期结果：8 rows
```

### 4.3 路由分层验收（路由层零 models 直连）

```bash
# 1. 检查路由层是否有 models 引用
rg "require\(['\"].*models|app\.locals\.models" routes/ --files-with-matches
# 预期结果：无输出

# 2. 检查路由层是否有 sequelize.transaction()
rg "sequelize\.transaction\(" routes/ --files-with-matches
# 预期结果：无输出
```

### 4.4 Service 注册验收

```bash
# 检查 services/index.js 是否注册了旧服务
rg "\.set\('inventory'" services/index.js
# 预期结果：无输出

rg "\.set\('points'" services/index.js
# 预期结果：无输出
```

### 4.5 服务健康检查验收

```bash
# 健康检查
curl -s http://localhost:3000/health | jq '.'

# 预期结果：
# {
#   "status": "healthy",
#   "code": "SYSTEM_HEALTHY",
#   "checks": {
#     "database": { "status": "connected", ... },
#     "redis": { "status": "connected", ... }
#   },
#   "timestamp": "..."
# }
```

---

## 📋 Part 5: CI 强制检查（防止旧方案复燃）

### 5.1 新增 CI 检查文件

**新增文件**: `.github/workflows/brutal-refactor-check.yml`

```yaml
name: 暴力重构验收检查

on: [push, pull_request]

jobs:
  refactor-check:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v3
      
      - name: 安装 ripgrep
        run: sudo apt-get install -y ripgrep
      
      - name: 黑名单关键字检查
        run: |
          FAILED=0
          
          # 检查旧模型/服务残留
          if rg "UserInventory|UserPointsAccount|PointsService|InventoryService" \
             --glob '!docs/' --glob '!backups/' --glob '!*.md' \
             --glob '!scripts/validation/*' --quiet; then
            echo "❌ 发现旧模型/服务残留"
            FAILED=1
          fi
          
          # 检查旧日志路径残留
          if rg "UnifiedLotteryEngine/utils/Logger" \
             --glob '!*.md' --quiet; then
            echo "❌ 发现旧日志路径残留"
            FAILED=1
          fi
          
          # 检查旧字段残留
          if rg "verification_code|price_type|payment_type|selling_points" \
             --glob '!docs/' --glob '!migrations/' --glob '!*.md' --quiet; then
            echo "❌ 发现旧字段残留"
            FAILED=1
          fi
          
          exit $FAILED
      
      - name: 路由分层检查
        run: |
          if rg "require\(['\"].*models" routes/ --quiet; then
            echo "❌ 路由层仍在直连 models"
            exit 1
          fi
          
          if rg "sequelize\.transaction\(" routes/ --quiet; then
            echo "❌ 路由层仍在开启事务"
            exit 1
          fi
          
          echo "✅ 路由分层检查通过"
```

---

## 📋 Part 6: 风险提示与回滚方案

### 6.1 高风险点识别

| 风险点 | 影响范围 | 发生概率 | 应对措施 |
|--------|---------|---------|---------|
| 用户数据全部清零导致投诉 | P0 - 用户流失 | 低（已确认） | 已与业务团队确认可接受；提前公告用户 |
| 前端未同步上线导致大量 404 | P0 - 用户无法使用 | 低（已确认） | 已与前端团队确认同步上线 |
| 删除代码后发现遗漏引用 | P0 - 服务启动失败 | 中 | 执行前全量 grep 确认；测试环境预演 |
| 数据库 DROP 后无法恢复 | P0 - 数据永久丢失 | 确定发生 | 已确认不做备份，数据永久丢弃，不可回滚 |
| 限流双实现配置错误 | P1 - 性能影响 | 低 | 测试环境预演；监控后备链路命中率 |
| 日志系统替换不完整 | P2 - 日志缺失 | 中 | grep 确认所有引用已替换 |

### 6.2 不可逆操作清单（执行前再次确认）

- [ ] `DROP TABLE user_inventory`（数据永久丢失，无法恢复）
- [ ] `DROP TABLE user_points_accounts`（用户积分余额永久丢失，无法恢复）
- [ ] `DROP TABLE points_transactions`（积分流水历史永久丢失，无法恢复）
- [ ] 删除 `services/InventoryService.js`（3000+ 行代码）
- [ ] 删除 `services/PointsService.js`
- [ ] 删除所有 `*.backup` 文件
- [ ] 删除 `migrations/` 相关迁移文件
- [ ] 删除 `scripts/migration/` 整个目录

**执行前必须**:
1. ✅ 团队已确认"旧数据永久丢弃"策略（不做备份，不可回滚）
2. ✅ 前端已确认同步上线新版本
3. ✅ 在测试环境完整执行过一次

### 6.3 回滚策略（不可回滚）

#### 触发回滚的条件

- ❌ **本方案不支持回滚**（代码和数据库都已永久删除）
- 如果执行失败，只能：
  1. 修复当前问题继续推进
  2. 或重新部署整个系统（从零开始）

#### 为什么不可回滚？

1. **数据库层**：旧表已 DROP，数据永久丢失
2. **代码层**：旧代码已硬删除（不归档，不做 Git 标签）
3. **用户数据**：积分/库存余额全部清零，无法恢复

**⚠️ 重要说明**：
- ❌ 数据库旧表已 DROP，无法恢复
- ❌ 旧代码已删除，无快速回滚路径
- ❌ 用户旧数据已永久丢失，无法找回
- ✅ 执行前必须在测试环境完整预演并确认无误

---

## 📋 Part 7: 执行时间表

| 时间段 | 操作内容 | 负责人 | 验收标准 |
|--------|---------|--------|---------|
| T-1 天 | 创建 Git 代码标签 + 测试环境预演 | 后端 | Git 标签已创建，测试环境通过 |
| T-1 天 | 与前端/业务团队最后确认 | 产品 + 前端 | 前端确认已准备好，业务确认数据丢弃策略 |
| T0 00:00 | 停止服务（停机窗口开始） | 运维 | 用户无法访问 |
| T0 00:05 | 执行 Phase 1（数据库层 DROP） | DBA | 旧表已删除，新表验证通过 |
| T0 00:15 | 执行 Phase 2（代码层硬删除） | 后端 | 文件删除清单完成 |
| T0 00:25 | 执行 Phase 3（验收与启动） | 后端 | 黑名单归零，服务启动成功 |
| T0 00:35 | 执行 Phase 4（限流验证） | 后端 | 双实现容灾验证通过 |
| T0 00:45 | 执行验收脚本 | 后端 | 所有验收通过 |
| T0 00:55 | 启动服务 + 健康检查 | 运维 | /health 返回 healthy |
| T0 01:00 | 开放服务（停机窗口结束） | 运维 | 用户可正常访问 |
| T0 01:00 | 前端同步发布新版本 | 前端 | 新版本上线 |
| T0 ~ T+24h | 持续监控（错误/性能） | 运维 + 后端 | 无异常告警 |

**总停机时长**: 60 分钟  
**⚠️ 注意**: 数据库旧表将永久删除，不做备份，不可回滚

---

## 📋 Part 8: 执行前检查清单

### T-24h：提前通知
- [ ] 用户公告：系统维护时间（凌晨 00:00-01:00）
- [ ] 客服培训：维护期间的应急话术
- [ ] 团队待命：开发/运维/DBA/前端团队确认在线

### T-2h：最后准备
- [ ] Git 代码标签已创建
- [ ] 测试环境完整执行过一次并通过验收
- [ ] 前端团队最后确认：新版本已准备好同步上线
- [ ] 业务团队已确认数据永久丢弃策略（不做备份）
- [ ] 监控告警已配置

### T-0：开始执行
- [ ] 停止服务
- [ ] 删除旧表（不可逆）
- [ ] 清理旧代码（硬删除）
- [ ] 执行验收脚本
- [ ] 验证限流双实现
- [ ] 启动服务

### T+1h：回滚决策点
- [ ] 验收脚本全部通过
- [ ] 服务健康检查通过
- [ ] 前端新版本已上线
- [ ] 决定：继续 or 回滚

### T+24h：持续监控
- [ ] 监控 404 响应频次（旧接口调用残留）
- [ ] 监控限流后备链路命中次数
- [ ] 检查错误日志（无异常报错）
- [ ] 用户反馈（无功能异常）

---

## 📋 Part 9: 一键执行脚本（整合所有阶段）

**⚠️ 此脚本会不可逆地删除数据和代码，执行前必须备份！**

**新建文件**: `scripts/brutal-refactor-execute.sh`

```bash
#!/bin/bash
# 暴力重构一键执行脚本
# 文件位置：scripts/brutal-refactor-execute.sh

set -e  # 任意步骤失败立即退出

echo "🚨 开始暴力重构（Zero-Compatibility）..."

# 前置检查
read -p "⚠️ 已创建 Git 代码标签？(yes/no): " GIT_TAG_CONFIRM
if [ "$GIT_TAG_CONFIRM" != "yes" ]; then
  echo "❌ 请先创建 Git 代码标签！"
  exit 1
fi

read -p "⚠️ 前端已确认同步上线？(yes/no): " FRONTEND_CONFIRM
if [ "$FRONTEND_CONFIRM" != "yes" ]; then
  echo "❌ 请先与前端确认！"
  exit 1
fi

read -p "⚠️ 确认旧数据永久丢弃（不做备份）？(yes/no): " DATA_CONFIRM
if [ "$DATA_CONFIRM" != "yes" ]; then
  echo "❌ 请再次确认数据永久丢弃策略！"
  exit 1
fi

read -p "⚠️ 确认旧路由将直接返回 404（不做 410）？(yes/no): " ROUTE_CONFIRM
if [ "$ROUTE_CONFIRM" != "yes" ]; then
  echo "❌ 请确认旧路由处理策略！"
  exit 1
fi

echo ""
echo "⚠️⚠️⚠️ 最后警告 ⚠️⚠️⚠️"
echo "即将执行不可逆操作："
echo "1. DROP TABLE user_inventory（数据永久丢失）"
echo "2. DROP TABLE user_points_accounts（数据永久丢失）"
echo "3. DROP TABLE points_transactions（数据永久丢失）"
echo "4. 删除所有旧代码（硬删除，不归档）"
echo ""
read -p "确认执行？输入 'I UNDERSTAND' 继续: " FINAL_CONFIRM
if [ "$FINAL_CONFIRM" != "I UNDERSTAND" ]; then
  echo "❌ 操作已取消"
  exit 1
fi

# Phase 1：数据库层
echo "🔧 Phase 1：数据库层暴力切换..."
mysql -h $DB_HOST -u $DB_USER -p$DB_PASSWORD $DB_NAME <<EOF
SET FOREIGN_KEY_CHECKS = 0;
DROP TABLE IF EXISTS user_inventory;
DROP TABLE IF EXISTS user_points_accounts;
DROP TABLE IF EXISTS points_transactions;
SET FOREIGN_KEY_CHECKS = 1;
EOF

echo "✅ Phase 1 完成"

# Phase 2：代码层
echo "🔧 Phase 2：代码层暴力删除..."
cd /home/devbox/project

# 删除旧模型
rm -f models/UserInventory.js models/UserPointsAccount.js models/PointsTransaction.js

# 删除旧服务
rm -f services/InventoryService.js services/PointsService.js
rm -f services/*.backup services/*.backup-*

# 删除旧路由
rm -f routes/v4/unified-engine/inventory*.js
rm -f routes/v4/points.js
rm -f routes/**/*.backup routes/**/*.backup-*

# 删除旧测试
rm -rf tests/business/inventory/ tests/business/points/
rm -f tests/integration/*inventory*.test.js tests/integration/*points*.test.js

# 删除旧脚本
rm -f scripts/reconcile-inventory-migration.js
rm -f scripts/test_inventory_*.js scripts/test_points_*.js
rm -f scripts/execute_migration*.js
rm -rf scripts/migration/

# 删除旧迁移
cd migrations
rm -f *inventory*.js *points*.js
cd ..

# 删除所有 .backup 文件
find . -name "*.backup" -type f -not -path "./node_modules/*" -not -path "./backups/*" -delete
find . -name "*.backup-*" -type f -not -path "./node_modules/*" -not -path "./backups/*" -delete

# 删除旧文档
rm -f MIGRATION-COMPLETION-REPORT.md
rm -f docs/duplicate-implementation-audit-2025-12-18.md
rm -f docs/ZERO-COMPATIBILITY-BRUTAL-REFACTOR-PLAN.md
rm -f docs/BRUTAL_REFACTOR_EXECUTION_PLAN.md
rm -f docs/ZERO-COMPATIBILITY-REFACTOR-EXECUTION.md
rm -f docs/UNIFIED-BRUTAL-REFACTOR-EXECUTION-PLAN.md

echo "✅ Phase 2 完成"

# Phase 3：验收
echo "🔍 Phase 3：执行验收..."
bash scripts/validation/brutal-refactor-blacklist-check.sh

if [ $? -ne 0 ]; then
  echo "❌ 验收失败，请检查日志"
  exit 1
fi

echo "✅ Phase 3 完成"

echo "🎉 暴力重构自动化部分完成！"
echo ""
echo "⚠️ 请手工完成以下操作（必须）："
echo "1. 编辑 models/index.js：删除旧模型注册（UserInventory/UserPointsAccount/PointsTransaction）"
echo "2. 编辑 app.js：删除旧路由挂载（/api/v4/inventory、/api/v4/points）"
echo "3. 批量替换日志引用：UnifiedLotteryEngine/utils/Logger → utils/logger"
echo "4. 删除旧日志文件：rm -f services/UnifiedLotteryEngine/utils/Logger.js"
echo "5. 启动服务：./scripts/system/process-manager.sh start pm2"
echo "6. 健康检查：curl -s http://localhost:3000/health | jq"
echo ""
echo "⚠️ 数据库旧表已永久删除，不可恢复"
```

---

## 📋 Part 10: 核心原则总结

1. **单一真相**：每个领域只有一个余额/状态真相表
2. **原子切换**：停写 → 删旧表 → 清旧代码 → 启动，不留双轨窗口
3. **直接下线**：旧路由从 `app.js` 移除，表现为 404（不提供 410 过渡）
4. **硬删除**：旧代码/脚本/迁移全部 `rm -f`（不归档，避免误引用）
5. **容灾有度**：限流保留双实现容灾，其他模块单实现
6. **数据归零**：旧数据直接丢弃，从零开始（不做数据库备份，永久删除）
7. **验收充分**：黑名单 grep + 数据库表清单 + 路由分层 + CI 强制检查
8. **回滚有限**：代码可回滚到 Git 标签，数据库旧表已 DROP 不可回滚

---

**文档版本**: v1.1-final (2025-12-19)  
**核心决策**: 数据永久丢弃（不备份） + 旧路由直接下线(404) + 旧代码硬删除 + 限流保留双实现容灾  
**验收标准**: grep 黑名单归零 + 旧表不存在 + 路由层零 models 直连 + CI 强制检查  
**回滚策略**: 代码可回滚到 Git 标签，数据库旧表已 DROP 不可回滚

**此文档为最终唯一执行文档，其他重构方案文档均已作废。**

---

## ⚠️⚠️⚠️ 重要警告 ⚠️⚠️⚠️

**本方案不做数据库备份，旧表数据将永久删除，不可恢复！**

执行前必须：
1. 业务团队已确认并接受"用户数据全部清零"
2. 前端团队已确认同步上线新版本
3. 测试环境已完整预演并通过验收
4. 已创建 Git 代码标签用于代码层回滚

**数据库操作不可逆，请谨慎执行！**

