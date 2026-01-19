# API 路径参数设计规范

> 版本：2.2  
> 更新时间：2026-01-20  
> 适用范围：餐厅积分抽奖系统 V4
> 
> **V2.2 更新**：新增第10.1节"执行策略"，明确路由重构采用"直接切换 + 一次性全做"方案（已拍板）

---

## 1. 核心设计原则

本项目采用**分层标识设计**，根据资源类型选择最合适的标识方式：

| 资源类型 | 特征 | 最佳标识 | API 占位符 |
|---------|------|---------|-----------|
| **事务实体** | 高频创建、有状态、数量无限增长 | 数字 ID | `:id` |
| **配置实体** | 低频变更、语义稳定、数量有限 | 业务码 | `:code` |
| **外部暴露实体** | 需要隐藏内部ID、防枚举 | UUID | `:uuid` |

**设计参考**：采用游戏公司 + 阿里混合方案
- 活动/配置类资源使用业务码（跨环境一致、可读性强）
- 实例/记录类资源使用数字ID（索引效率、无限增长）
- 外部分享使用UUID（防枚举、安全性）

---

## 2. 资源分类清单

### 2.1 事务实体（Transaction Entities）→ `:id`

使用**数字自增主键**作为 API 路径参数。

| 资源 | 数据库表 | 主键字段 | API 路径示例 |
|-----|----------|---------|-------------|
| 物品实例 | `item_instances` | `item_instance_id` | `/items/:id` |
| 市场挂牌 | `market_listings` | `listing_id` | `/listings/:id` |
| 交易订单 | `trade_orders` | `order_id` | `/orders/:id` |
| 抽奖记录 | `lottery_draws` | `draw_id` | `/draws/:id` |
| 消费记录 | `consumption_records` | `record_id` | `/records/:id` |
| 兑换订单 | `redemption_orders` | `order_id` | `/exchange/orders/:id` |
| 资产流水 | `asset_transactions` | `transaction_id` | `/transactions/:id` |
| 风控告警 | `risk_alerts` | `alert_id` | `/risk-alerts/:id` |
| **转换规则** | `material_conversion_rules` | `rule_id` | `/conversion-rules/:id` |
| **配额规则** | `lottery_quota_rules` | `rule_id` | `/lottery-quota/rules/:id` |
| **奖品池配置** | `lottery_prizes` | `prize_id` | `/prize-pool/prize/:id` |
| **定价配置** | `pricing_configs` | `config_id` | `/pricing/:id` |

**选择理由**：
- 索引效率最高（B+树对整数索引优化）
- 排序性能最优
- 存储成本最低
- 这些资源会高频创建（每次活动都新建规则/奖品配置）

---

### 2.2 配置实体（Configuration Entities）→ `:code`

使用**业务码**作为 API 路径参数。数据库设计为双键（数字主键 + 业务码唯一约束）。

| 资源 | 数据库表 | 业务码字段 | API 路径示例 |
|-----|----------|-----------|-------------|
| 材料资产类型 | `material_asset_types` | `asset_code` | `/asset-types/:code` |
| 类目定义 | `category_defs` | `category_code` | `/categories/:code` |
| 稀有度定义 | `rarity_defs` | `rarity_code` | `/rarities/:code` |
| 资产分组 | `asset_group_defs` | `group_code` | `/asset-groups/:code` |
| 角色定义 | `roles` | `role_name` | `/roles/:code` |
| **抽奖活动** | `lottery_campaigns` | `campaign_code` | `/campaigns/:code` |
| **奖品池（按活动）** | - | `campaign_code` | `/prize-pool/:code` |
| 系统设置 | `system_settings` | `setting_key` | `/settings/:code` |

**业务码格式规范**：
```
snake_case:    red_shard, food_drink, merchant_staff, spring_festival
UPPER_SNAKE:   DIAMOND, POINTS, BUDGET_POINTS
lowercase:     electronics, admin, user
```

**选择理由**：
- 跨环境一致（dev/staging/prod 用同一个 `spring_festival`）
- 可读性强（日志/调试直接可读）
- 迁移友好（数据迁移时业务码不变）
- 语义稳定（`DIAMOND` 永远是钻石）

---

### 2.3 外部暴露实体（External Entities）→ `:uuid`

使用 **UUID** 作为外部暴露的标识符。

| 场景 | 字段 | API 路径示例 |
|-----|------|-------------|
| 用户外部分享 | `user_uuid` | `/user/profile/:uuid` |
| QR码验证 | `user_uuid` | `/user/qr-code/:uuid` |
| 邀请链接 | `invite_uuid` | `/invite/:uuid` |
| 第三方对接 | 各业务UUID | `/external/:uuid` |

**注意**：内部管理接口仍可使用数字 ID：
```
GET /api/v4/console/users/:id/stats   # 管理后台用数字ID
GET /api/v4/user/profile/:uuid        # 外部分享用UUID
```

**选择理由**：
- 防止用户ID枚举攻击
- 隐藏内部业务信息
- 分布式生成，无需中心协调

---

## 3. 关键决策记录

### 3.1 `/prizes/:campaignCode` 路径重构

**现状问题**：
```
GET /api/v4/lottery/prizes/:campaignCode    # 语义不清晰，看起来像"奖品详情"
```

**重构方案**：
```
GET /api/v4/lottery/campaigns/:code/prizes  # 清晰：活动 → 奖品列表
GET /api/v4/lottery/campaigns/:code/config  # 清晰：活动 → 配置
```

**重构理由**：
- RESTful 层级结构更清晰
- 明确表达"按活动查询奖品"的语义
- 与业界（阿里/美团）设计一致

---

### 3.2 事务实体 vs 配置实体判定

| 资源 | 分类 | 占位符 | 判定理由 |
|-----|------|--------|---------|
| `conversion-rules` | 事务实体 | `:id` | 每次活动可能创建新规则，高频创建 |
| `lottery-quota/rules` | 事务实体 | `:id` | 配额规则按需创建，无固定业务码 |
| `prize-pool/prize` | 事务实体 | `:id` | 奖品配置实例，每期活动独立创建 |
| `campaigns` | 配置实体 | `:code` | 活动编码跨环境复用（`spring_festival`） |
| `prize-pool` | 配置实体 | `:code` | 按活动码查询奖品池 |
| `asset-types` | 配置实体 | `:code` | 资产类型固定（`DIAMOND`、`POINTS`） |

---

### 3.3 `/campaigns/:code/pricing` 设计

活动定价配置采用层级设计：

```
# 活动是配置实体，用 :code
GET  /api/v4/console/lottery-management/campaigns/:code/pricing
POST /api/v4/console/lottery-management/campaigns/:code/pricing

# 定价配置实例是事务实体，用 :id
PUT  /api/v4/console/lottery-management/campaigns/:code/pricing/:id/activate
PUT  /api/v4/console/lottery-management/campaigns/:code/pricing/:id/archive
```

---

## 4. normalizePath 实现

`IdempotencyService.normalizePath()` 方法将实际路径转换为规范化路径，用于匹配 `CANONICAL_OPERATION_MAP`。

### 4.1 转换规则

| 输入类型 | 正则模式 | 输出占位符 |
|---------|---------|-----------|
| 纯数字 | `/\d+/` | `:id` |
| UUID | `/[0-9a-f]{8}-[0-9a-f]{4}-...-[0-9a-f]{12}/` | `:uuid` |
| 业务码（配置实体路径中） | `/[A-Za-z][A-Za-z0-9_]*/` | `:code` |

### 4.2 完整实现

```javascript
/**
 * 规范化API路径，将动态参数替换为标准占位符
 *
 * @param {string} path - 原始API路径
 * @returns {string} 规范化后的路径
 *
 * @description
 * 三种资源类型对应三种占位符：
 * 1. 事务实体（数字ID）→ :id
 * 2. 配置实体（业务码）→ :code
 * 3. 外部暴露实体（UUID）→ :uuid
 */
static normalizePath(path) {
  if (!path) return ''

  let result = path

  // 1. UUID → :uuid（优先匹配，格式最明确）
  result = result.replace(
    /\/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/gi,
    '/:uuid'
  )

  // 2. 纯数字 → :id（事务实体）
  result = result.replace(/\/\d+/g, '/:id')

  // 3. 配置实体路径中的业务码 → :code
  const configEntityPatterns = [
    /\/(asset-types)\/([A-Za-z][A-Za-z0-9_]*)(?=\/|$)/g,
    /\/(categories)\/([A-Za-z][A-Za-z0-9_]*)(?=\/|$)/g,
    /\/(rarities)\/([A-Za-z][A-Za-z0-9_]*)(?=\/|$)/g,
    /\/(asset-groups)\/([A-Za-z][A-Za-z0-9_]*)(?=\/|$)/g,
    /\/(roles)\/([A-Za-z][A-Za-z0-9_]*)(?=\/|$)/g,
    /\/(campaigns)\/([A-Za-z][A-Za-z0-9_]*)(?=\/|$)/g,
    /\/(prize-pool)\/([A-Za-z][A-Za-z0-9_]*)(?=\/|$)/g,
    /\/(settings)\/([A-Za-z][A-Za-z0-9_]*)(?=\/|$)/g,
  ]

  configEntityPatterns.forEach(pattern => {
    result = result.replace(pattern, '/$1/:code')
  })

  // 4. 路由参数占位符统一化（保留 :id, :code, :uuid）
  result = result.replace(/:(?!id\b|code\b|uuid\b)[a-zA-Z_][a-zA-Z0-9_]*/g, ':id')

  return result
}
```

### 4.3 转换示例

| 原始路径 | 规范化路径 | 资源类型 |
|---------|-----------|---------|
| `/api/v4/market/listings/123` | `/api/v4/market/listings/:id` | 事务实体 |
| `/api/v4/trade/orders/456/cancel` | `/api/v4/trade/orders/:id/cancel` | 事务实体 |
| `/api/v4/console/material/conversion-rules/789` | `/api/v4/console/material/conversion-rules/:id` | 事务实体 |
| `/api/v4/console/material/asset-types/red_shard` | `/api/v4/console/material/asset-types/:code` | 配置实体 |
| `/api/v4/console/material/asset-types/DIAMOND/disable` | `/api/v4/console/material/asset-types/:code/disable` | 配置实体 |
| `/api/v4/console/roles/admin` | `/api/v4/console/roles/:code` | 配置实体 |
| `/api/v4/lottery/campaigns/spring_festival` | `/api/v4/lottery/campaigns/:code` | 配置实体 |
| `/api/v4/lottery/campaigns/spring_festival/prizes` | `/api/v4/lottery/campaigns/:code/prizes` | 配置实体 |
| `/api/v4/console/prize-pool/spring_festival` | `/api/v4/console/prize-pool/:code` | 配置实体 |
| `/api/v4/console/lottery-management/campaigns/spring_festival/pricing` | `/api/v4/console/lottery-management/campaigns/:code/pricing` | 配置实体 |
| `/api/v4/console/lottery-management/campaigns/spring_festival/pricing/123/activate` | `/api/v4/console/lottery-management/campaigns/:code/pricing/:id/activate` | 混合 |
| `/api/v4/user/profile/550e8400-e29b-41d4-a716-446655440000` | `/api/v4/user/profile/:uuid` | 外部暴露 |

---

## 5. CANONICAL_OPERATION_MAP 规范

`CANONICAL_OPERATION_MAP` 使用规范化后的路径作为键：

```javascript
const CANONICAL_OPERATION_MAP = {
  // ===== 事务实体：使用 :id =====
  'GET /api/v4/market/listings/:id': 'MARKET_LISTING_DETAIL',
  'POST /api/v4/market/listings/:id/purchase': 'MARKET_LISTING_PURCHASE',
  'POST /api/v4/trade/orders/:id/cancel': 'TRADE_ORDER_CANCEL',
  'GET /api/v4/shop/exchange/orders/:id': 'EXCHANGE_ORDER_DETAIL',
  'GET /api/v4/console/risk-alerts/:id': 'RISK_ALERT_DETAIL',
  'POST /api/v4/console/risk-alerts/:id/review': 'RISK_ALERT_REVIEW',
  
  // 转换规则（事务实体）
  'POST /api/v4/console/material/conversion-rules/': 'ADMIN_MATERIAL_RULE_CREATE',
  'PUT /api/v4/console/material/conversion-rules/:id': 'ADMIN_MATERIAL_RULE_UPDATE',
  'PUT /api/v4/console/material/conversion-rules/:id/disable': 'ADMIN_MATERIAL_RULE_DISABLE',
  
  // 奖品池配置实例（事务实体）
  'PUT /api/v4/console/prize-pool/prize/:id': 'ADMIN_PRIZE_UPDATE',
  'PUT /api/v4/console/prize-pool/prize/:id/add-stock': 'ADMIN_PRIZE_ADD_STOCK',

  // ===== 配置实体：使用 :code =====
  // 材料资产类型
  'GET /api/v4/console/material/asset-types/:code': 'ASSET_TYPE_DETAIL',
  'PUT /api/v4/console/material/asset-types/:code': 'ASSET_TYPE_UPDATE',
  'PUT /api/v4/console/material/asset-types/:code/disable': 'ASSET_TYPE_DISABLE',
  
  // 系统设置
  'GET /api/v4/console/settings/:code': 'SETTINGS_DETAIL',
  'PUT /api/v4/console/settings/:code': 'SETTINGS_UPDATE',
  
  // 角色
  'GET /api/v4/console/roles/:code': 'ROLE_DETAIL',
  
  // 抽奖活动（配置实体）
  'GET /api/v4/lottery/campaigns/:code': 'CAMPAIGN_DETAIL',
  'GET /api/v4/lottery/campaigns/:code/prizes': 'CAMPAIGN_PRIZES',
  'GET /api/v4/lottery/campaigns/:code/config': 'CAMPAIGN_CONFIG',
  
  // 奖品池（按活动码查询）
  'GET /api/v4/console/prize-pool/:code': 'PRIZE_POOL_BY_CAMPAIGN',
  'POST /api/v4/console/prize-pool/:code': 'PRIZE_POOL_ADD_PRIZE',
  
  // 活动定价配置（活动用 :code，定价配置用 :id）
  'GET /api/v4/console/lottery-management/campaigns/:code/pricing': 'ADMIN_PRICING_CONFIG_LIST',
  'POST /api/v4/console/lottery-management/campaigns/:code/pricing': 'ADMIN_PRICING_CONFIG_CREATE',
  'PUT /api/v4/console/lottery-management/campaigns/:code/pricing/:id/activate': 'ADMIN_PRICING_CONFIG_ACTIVATE',
  'PUT /api/v4/console/lottery-management/campaigns/:code/pricing/:id/archive': 'ADMIN_PRICING_CONFIG_ARCHIVE',

  // ===== 外部暴露实体：使用 :uuid =====
  'GET /api/v4/user/profile/:uuid': 'USER_PROFILE_BY_UUID',
  'GET /api/v4/user/qr-code/:uuid': 'USER_QR_VERIFY',
}
```

---

## 6. 数据库设计规范

### 6.1 事务实体表

```sql
CREATE TABLE item_instances (
  item_instance_id BIGINT AUTO_INCREMENT PRIMARY KEY,
  -- 无业务码，只用数字ID
  owner_user_id INT NOT NULL,
  status ENUM('available', 'locked', 'used') NOT NULL,
  ...
);

-- 转换规则（事务实体，高频创建）
CREATE TABLE material_conversion_rules (
  rule_id BIGINT AUTO_INCREMENT PRIMARY KEY,
  -- 无业务码，按数字ID操作
  source_asset_code VARCHAR(50) NOT NULL,
  target_asset_code VARCHAR(50) NOT NULL,
  ...
);
```

### 6.2 配置实体表（双键设计）

```sql
CREATE TABLE material_asset_types (
  material_asset_type_id BIGINT AUTO_INCREMENT PRIMARY KEY,  -- 数字主键（内部关联）
  asset_code VARCHAR(50) NOT NULL UNIQUE,                    -- 业务码（API路径参数）
  display_name VARCHAR(100) NOT NULL,
  ...
);

CREATE TABLE lottery_campaigns (
  campaign_id BIGINT AUTO_INCREMENT PRIMARY KEY,             -- 数字主键（内部关联）
  campaign_code VARCHAR(50) NOT NULL UNIQUE,                 -- 业务码（API路径参数）
  campaign_name VARCHAR(100) NOT NULL,
  ...
);

-- API 路径使用 asset_code/campaign_code，内部关联使用数字主键
```

### 6.3 用户表（三键设计）

```sql
CREATE TABLE users (
  user_id INT AUTO_INCREMENT PRIMARY KEY,         -- 内部数字ID
  user_uuid UUID NOT NULL UNIQUE,                 -- 外部UUID
  mobile VARCHAR(20) NOT NULL UNIQUE,             -- 登录凭证
  ...
);

-- 管理后台用 user_id，外部分享用 user_uuid
```

---

## 7. 路由定义规范

### 7.1 事务实体路由

```javascript
// routes/v4/market/listings.js
router.get('/listings/:id', authenticateToken, async (req, res) => {
  const listingId = parseInt(req.params.id)
  // ...
})

// routes/v4/console/material.js - 转换规则（事务实体）
router.put('/conversion-rules/:id', adminAuthMiddleware, async (req, res) => {
  const ruleId = parseInt(req.params.id)
  // ...
})
```

### 7.2 配置实体路由

```javascript
// routes/v4/console/material.js - 资产类型（配置实体）
router.get('/asset-types/:assetCode', adminAuthMiddleware, async (req, res) => {
  const assetCode = req.params.assetCode  // 字符串，无需转换
  // ...
})

router.put('/asset-types/:assetCode/disable', adminAuthMiddleware, async (req, res) => {
  const assetCode = req.params.assetCode
  // ...
})

// routes/v4/lottery/campaigns.js - 活动（配置实体）
router.get('/campaigns/:campaignCode', authenticateToken, async (req, res) => {
  const campaignCode = req.params.campaignCode
  // ...
})

router.get('/campaigns/:campaignCode/prizes', authenticateToken, async (req, res) => {
  const campaignCode = req.params.campaignCode
  // ...
})
```

### 7.3 外部暴露路由

```javascript
// routes/v4/user/profile.js
router.get('/profile/:userUuid', async (req, res) => {
  const userUuid = req.params.userUuid
  // 验证 UUID 格式
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(userUuid)) {
    return res.apiError('无效的用户标识', 'INVALID_UUID', null, 400)
  }
  // ...
})
```

---

## 8. 参数校验规范

### 8.1 数字 ID 校验

```javascript
const validateNumericId = (paramName) => (req, res, next) => {
  const value = req.params[paramName]
  const numValue = parseInt(value, 10)
  
  if (isNaN(numValue) || numValue <= 0 || String(numValue) !== value) {
    return res.apiError(`无效的${paramName}`, 'INVALID_ID', null, 400)
  }
  
  req.params[paramName] = numValue
  next()
}

// 使用
router.get('/listings/:id', validateNumericId('id'), async (req, res) => { ... })
router.put('/conversion-rules/:id', validateNumericId('id'), async (req, res) => { ... })
```

### 8.2 业务码校验

```javascript
const validateBusinessCode = (paramName) => (req, res, next) => {
  const value = req.params[paramName]
  
  // 业务码格式：字母开头，可包含字母、数字、下划线
  if (!/^[A-Za-z][A-Za-z0-9_]*$/.test(value)) {
    return res.apiError(`无效的${paramName}`, 'INVALID_CODE', null, 400)
  }
  
  next()
}

// 使用
router.get('/asset-types/:assetCode', validateBusinessCode('assetCode'), async (req, res) => { ... })
router.get('/campaigns/:campaignCode', validateBusinessCode('campaignCode'), async (req, res) => { ... })
```

### 8.3 UUID 校验

```javascript
const validateUuid = (paramName) => (req, res, next) => {
  const value = req.params[paramName]
  
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(value)) {
    return res.apiError(`无效的${paramName}`, 'INVALID_UUID', null, 400)
  }
  
  next()
}

// 使用
router.get('/profile/:userUuid', validateUuid('userUuid'), async (req, res) => { ... })
```

---

## 9. 扩展配置实体

当新增配置实体时，需要更新 `normalizePath` 中的 `configEntityPatterns`：

```javascript
// 新增资源类型示例：/payment-methods/{code}
const configEntityPatterns = [
  // ... 现有模式 ...
  /\/(payment-methods)\/([A-Za-z][A-Za-z0-9_]*)(?=\/|$)/g,  // 新增
]
```

同时更新 `CANONICAL_OPERATION_MAP`：

```javascript
'GET /api/v4/console/payment-methods/:code': 'PAYMENT_METHOD_DETAIL',
'PUT /api/v4/console/payment-methods/:code': 'PAYMENT_METHOD_UPDATE',
```

---

## 10. 路由重构待办清单

### 10.1 执行策略（已拍板 2026-01-20）

| 决策项 | 决定 | 说明 |
|-------|------|------|
| **切换方式** | 直接切换 | 不保留旧路由兼容期，前后端同步发布 |
| **执行范围** | 一次性全做 | 所有待重构路由在同一版本完成 |

### 10.2 待重构路由清单

以下现有路由需要按照本规范进行重构：

| 现有路由 | 重构后 | 状态 |
|---------|-------|------|
| `GET /lottery/prizes/:campaignCode` | `GET /lottery/campaigns/:code/prizes` | 待重构 |
| `GET /lottery/config/:campaignCode` | `GET /lottery/campaigns/:code/config` | 待重构 |
| `GET /console/prize-pool/:campaign_code` | `GET /console/prize-pool/:code` | 参数名统一 |
| `PUT /console/material/asset-types/:id` | `PUT /console/material/asset-types/:code` | 待重构 |
| `PUT /console/material/asset-types/:id/disable` | `PUT /console/material/asset-types/:code/disable` | 待重构 |
| `PUT /console/settings/:id` | `PUT /console/settings/:code` | 待重构 |

---

## 11. 总结

| 判断标准 | 使用 `:id` | 使用 `:code` | 使用 `:uuid` |
|---------|-----------|-------------|-------------|
| 数据增长 | 无限增长 | 有限数量 | 按需生成 |
| 变更频率 | 高频创建 | 低频变更 | 低频 |
| 外部暴露 | 内部使用 | 可外部暴露 | 专用于外部 |
| 可读性需求 | 不需要 | 需要 | 不需要 |
| 跨环境一致 | 不保证 | 保证 | 保证 |
| 典型资源 | 订单、记录、规则实例 | 活动、资产类型、设置 | 用户分享链接 |

**核心原则**：根据资源的业务特征选择最合适的标识方式，不强行统一。
