# 🔴 前端数据对接问题 - 后端数据库权威确认 & 前端适配方案

> **日期**: 2026-02-16
> **优先级**: 高
> **状态**: 后端已完成真实数据库验证，字段差异已定位，前端需适配后端
> **核心原则**: ⚠️ **后端数据库 = 唯一权威真相源。前端直接使用后端字段名，不做映射、不做兼容。**

---

## 一、项目技术体系概览

| 维度 | 技术方案 |
|------|----------|
| 后端框架 | Node.js 20+ / Express 4.x / Sequelize ORM |
| 数据库 | MySQL (Sealos云数据库 `restaurant_points_dev`) |
| API版本 | `/api/v4/` 统一前缀 |
| 响应标准 | `ApiResponse` 标准化（success/code/message/data/timestamp/version/request_id） |
| 账户体系 | Account 中间表：`users.user_id` → `accounts.account_id` → `asset_transactions` / `account_asset_balances` |
| 资产类型 | 可叠加资产（POINTS/DIAMOND/red_shard等）+ 不可叠加物品（item_instances） |
| 时区 | 全系统北京时间 `+08:00`，数据库 `dialectOptions.timezone: '+08:00'` |

### 商业模式

餐厅积分抽奖系统：用户消费获得积分(POINTS) → 抽奖消耗/获得积分及材料(red_shard等) → 兑换实物/虚拟商品 → C2C市场交易(DIAMOND结算)

---

## 二、核心发现

### 问题1 — 积分交易记录字段不匹配

1. **字段名差异**：后端返回 `delta_amount`，前端错误使用 `amount`。后端路由层（`routes/v4/assets/transactions.js` 第 61-76 行）明确 map 输出的是 `delta_amount`。**前端必须直接使用 `delta_amount`，禁止做字段映射。**
2. **`description` 未返回**：后端路由层当前没有从 `meta` JSON 中提取 `description`/`title` 字段。但数据库中 `meta.title` 覆盖率 79.2%，`meta.description` 覆盖率 91.2%，数据是有的。**后端需补充输出这两个字段。**
3. **`delta_amount` 正负号**：已通过真实数据确认——正数=获得，负数=消费，与前端的 earn/consume 逻辑一致。**前端直接用 `delta_amount > 0` 判断 earn，`delta_amount < 0` 判断 consume。**

### 问题2 — 库存管理页面为空

1. **后端数据充足**（user_id=31 有 3,379 个 available 物品，60,642 红色碎片等），后端接口正常。
2. **背包是双轨架构**（`data.assets[]` + `data.items[]`），前端必须按此结构解析，不是 `data.inventory[]`。
3. **关键排查点**：JWT Token 解析后的 `user_id` 是否指向有数据的用户。

---

## 三、问题1详情：积分交易记录

### 3.1 后端接口定义（权威）

**路由**: `GET /api/v4/assets/transactions`
**文件**: `routes/v4/assets/transactions.js` → `services/asset/QueryService.js`
**鉴权**: `authenticateToken` (JWT)

**查询参数**:

| 参数 | 类型 | 必填 | 说明 |
|------|------|------|------|
| `asset_code` | string | 否 | 资产代码筛选（如 `POINTS`） |
| `business_type` | string | 否 | 业务类型筛选（如 `lottery_consume`） |
| `page` | number | 否 | 页码，默认 1 |
| `page_size` | number | 否 | 每页条数，默认 20 |

### 3.2 后端响应格式（权威，前端必须按此适配）

路由层 `transactions.js` 第 61-76 行 map 输出（后端补充 `description`/`title` 后）：

```json
{
  "success": true,
  "code": "SUCCESS",
  "message": "操作成功",
  "data": {
    "transactions": [
      {
        "transaction_id": 38684,
        "asset_code": "POINTS",
        "delta_amount": 50,
        "balance_before": 809152,
        "balance_after": 809202,
        "business_type": "consumption_reward",
        "description": "【审核通过】消费50元，奖励50积分",
        "title": "消费奖励50分",
        "created_at": "2026-02-15T19:41:38.000Z"
      },
      {
        "transaction_id": 38683,
        "asset_code": "POINTS",
        "delta_amount": -10,
        "balance_before": 809162,
        "balance_after": 809152,
        "business_type": "lottery_consume",
        "description": "单次抽奖消耗10积分",
        "title": "抽奖消耗积分",
        "created_at": "2026-02-15T19:41:15.000Z"
      }
    ],
    "pagination": {
      "total": 9281,
      "page": 1,
      "page_size": 20,
      "total_pages": 465
    }
  },
  "timestamp": "2026-02-16 10:00:00",
  "version": "v4.0",
  "request_id": "req_xxx"
}
```

### 3.3 后端字段权威定义（前端直接使用，不做映射）

| 后端字段名 | 类型 | 说明 | 前端直接使用方式 |
|-----------|------|------|-----------------|
| `transaction_id` | number(BIGINT) | 流水ID | `wx:key="transaction_id"` |
| `asset_code` | string | 资产代码（POINTS/DIAMOND/red_shard） | 筛选条件 |
| `delta_amount` | number(BIGINT) | 变动金额（**正=增加，负=扣减**） | `Math.abs(item.delta_amount)` 显示金额；`item.delta_amount > 0` 判断 earn |
| `balance_before` | number(BIGINT) | 变动前余额 | 可选展示 |
| `balance_after` | number(BIGINT) | 变动后余额 | 余额跟踪展示 |
| `business_type` | string | 业务类型枚举 | 图标映射 |
| `description` | string \| null | 交易描述（来自 meta.description）**后端需新增** | 记录描述展示，无值时回退 `title`，再回退 `business_type` 中文 |
| `title` | string \| null | 交易标题（来自 meta.title）**后端需新增** | 记录标题展示 |
| `created_at` | string(ISO 8601) | 创建时间 | 时间展示 |

### 3.4 `delta_amount` 正负号（真实数据验证）

数据库真实数据示例（`account_id=5`, `asset_code='POINTS'`）：

| delta_amount | business_type | meta.title |
|-------------|---------------|-----------|
| `+50` | `consumption_reward` | 消费奖励50分 |
| `-10` | `lottery_consume` | 抽奖消耗积分 |
| `+100` | `lottery_reward` | 抽奖奖励：100积分 |
| `-50` | `lottery_consume` | 5连抽消耗积分 |
| `-80` | `lottery_consume` | 10连抽消耗积分 |

**结论**: `delta_amount` 正数=获得（earn），负数=消费（consume）。前端直接使用正负号判断方向。

### 3.5 `meta` 字段覆盖率（真实数据库统计）

POINTS 资产（共 9,281 条流水）：
- `meta.title` 有值：7,351 条（**79.2%**）
- `meta.description` 有值：8,463 条（**91.2%**）
- 约 8-20% 旧数据缺少 `meta.title`，前端需处理 null 回退

### 3.6 `business_type` 完整枚举（真实数据库统计，仅非 test 类型）

| business_type | 数据量 | 含义 | 建议前端图标 |
|--------------|--------|------|-------------|
| `lottery_consume` | 5,064 | 抽奖消耗积分 | 🎰 抽奖 |
| `lottery_reward` | 2,330 | 抽奖奖励发放 | 🎰 抽奖 |
| `exchange_debit` | 2,444 | 兑换扣减 | 🛒 兑换 |
| `consumption_reward` | 12 | 消费奖励积分 | 💰 消费奖励 |
| `consumption_budget_allocation` | 16 | 消费预算积分分配 | 💰 消费奖励 |
| `admin_adjustment` | 733 | 管理员调整 | ⚙️ 系统调整 |
| `material_convert_debit` | 434 | 材料转换扣减 | 🔄 转换 |
| `material_convert_credit` | 434 | 材料转换入账 | 🔄 转换 |
| `merchant_points_reward` | 50 | 商户积分奖励 | 🏪 商户奖励 |
| `opening_balance` | 11 | 开账（历史余额补录） | 📋 系统 |
| `order_freeze_buyer` | 1,928 | 交易市场冻结 | 🏪 交易 |
| `order_settle_*` | 339×3 | 交易市场结算 | 🏪 交易 |
| `market_listing_*` | 1,889+ | 市场挂牌相关 | 🏪 交易 |
| `lottery_budget_deduct` | 63 | 抽奖预算扣减 | 🎰 抽奖 |

---

## 四、问题2详情：库存管理页面

### 4.1 后端接口定义（权威）

**背包列表**: `GET /api/v4/backpack/`
**背包统计**: `GET /api/v4/backpack/stats`
**文件**: `routes/v4/backpack/index.js` → `services/BackpackService.js`
**鉴权**: `authenticateToken` (JWT)

### 4.2 背包列表响应格式（权威，前端必须按此适配）

```json
{
  "success": true,
  "code": "SUCCESS",
  "data": {
    "assets": [
      {
        "asset_code": "red_shard",
        "display_name": "红色碎片",
        "total_amount": 63382,
        "frozen_amount": 2740,
        "available_amount": 60642,
        "category": "red",
        "rarity": "common",
        "is_tradable": true
      },
      {
        "asset_code": "DIAMOND",
        "display_name": "钻石",
        "total_amount": 1234,
        "frozen_amount": 0,
        "available_amount": 1234,
        "category": "currency",
        "rarity": "common",
        "is_tradable": true
      }
    ],
    "items": [
      {
        "item_instance_id": 28251,
        "item_type": "product",
        "name": "青菜1份",
        "status": "available",
        "rarity": "common",
        "description": "新鲜青菜",
        "has_redemption_code": false,
        "acquired_at": "2026-02-15T19:41:15.000Z",
        "expires_at": null
      }
    ]
  }
}
```

**前端必须按 `data.assets[]` + `data.items[]` 双轨结构解析，不得使用其他字段名。**

### 4.3 背包统计响应格式（权威）

```json
{
  "success": true,
  "code": "SUCCESS",
  "data": {
    "total_assets": 2,
    "total_items": 3379,
    "total_asset_value": 61876,
    "items_by_type": {
      "product": 3379
    }
  }
}
```

| 后端字段名 | 类型 | 说明 | 前端直接使用方式 |
|-----------|------|------|-----------------|
| `total_assets` | number | 可叠加资产种类数 | 直接显示 |
| `total_items` | number | 不可叠加物品总数（仅 available） | 直接显示 |
| `total_asset_value` | number | 所有可叠加资产 available_amount 之和 | 直接显示 |
| `items_by_type` | object | 按 item_type 分组的物品计数 | 分类展示 |

### 4.4 assets[] 字段定义（前端直接使用）

| 后端字段名 | 类型 | 说明 |
|-----------|------|------|
| `asset_code` | string | 资产代码 |
| `display_name` | string | 中文显示名 |
| `total_amount` | number | 总余额（可用+冻结） |
| `frozen_amount` | number | 冻结余额 |
| `available_amount` | number | 可用余额 |
| `category` | string | 分组代码 |
| `rarity` | string | 稀有度 |
| `is_tradable` | boolean | 是否可交易 |

### 4.5 items[] 字段定义（前端直接使用）

| 后端字段名 | 类型 | 说明 |
|-----------|------|------|
| `item_instance_id` | number | 物品实例ID |
| `item_type` | string | 物品类型（product/voucher等） |
| `name` | string | 物品名称 |
| `status` | string | 状态（固定为 available） |
| `rarity` | string | 稀有度 |
| `description` | string | 物品描述 |
| `has_redemption_code` | boolean | 是否有待核销的核销码 |
| `acquired_at` | string(ISO 8601) | 获取时间 |
| `expires_at` | string \| null | 过期时间 |

### 4.6 关键说明

- `assets[]` 来自 `account_asset_balances` 表，过滤掉 `BUDGET_POINTS` 和 `is_enabled=false` 的资产
- `items[]` 来自 `item_instances` 表，仅返回 `status='available'` 的物品
- `POINTS` 当前未在 `material_asset_types` 表中配置，不会出现在 `assets[]` 列表中（余额数据存在于 `account_asset_balances` 表，通过 `GET /api/v4/assets/balance` 接口单独获取）

### 4.7 数据库真实数据验证

**用户 user_id=31（主测试账号，account_id=5）**：

| 数据维度 | 数据量 |
|---------|--------|
| POINTS 可用余额 | 809,202 |
| POINTS 冻结余额 | 4,640 |
| red_shard 可用余额 | 60,642 |
| red_shard 冻结余额 | 2,740 |
| item_instances (available) | 3,379 个 |
| item_instances (locked) | 987 个 |
| item_instances (used) | 1,399 个 |

**结论**: 后端数据充足。如果前端页面显示空，排查方向：
1. JWT Token 解析后的 `user_id` 是否对应有数据的用户
2. 前端是否正确解析 `data.assets[]` + `data.items[]` 双轨结构
3. iOS 日期兼容性：后端返回 ISO 8601 格式 `"2026-02-15T19:41:15.000Z"`，可直接解析

---

## 五、修复方案（后端为权威，前端适配后端）

### 后端修改（1处）

- [ ] `routes/v4/assets/transactions.js`：在 map 中新增 `description` 和 `title` 字段输出

```javascript
// routes/v4/assets/transactions.js 第 61-76 行修改为：
transactions: result.transactions.map(t => ({
  transaction_id: t.transaction_id,
  asset_code: t.asset_code,
  delta_amount: Number(t.delta_amount),
  balance_before: Number(t.balance_before),
  balance_after: Number(t.balance_after),
  business_type: t.business_type,
  description: t.meta?.description || t.meta?.title || null,  // ⭐ 新增
  title: t.meta?.title || null,                                // ⭐ 新增
  created_at: t.created_at
}))
```

### 前端修改（直接使用后端字段名，不做映射）

**积分明细页 & 交易记录页**：

- [ ] 所有使用 `amount` 的地方 → 直接改为 `delta_amount`
- [ ] 所有使用 `points_amount` 的地方 → 直接改为 `delta_amount`
- [ ] earn/consume 筛选：`item.delta_amount > 0` = earn，`item.delta_amount < 0` = consume
- [ ] 金额显示：`Math.abs(item.delta_amount)` + 正数前加"+"、负数显示"-"
- [ ] 标题显示：直接用 `item.title || item.description || '积分记录'`（三级回退，不做复杂映射）
- [ ] 描述显示：直接用 `item.description`
- [ ] 列表 key：直接用 `item.transaction_id`

**库存管理页**：

- [ ] 背包数据解析：`res.data.data.assets` + `res.data.data.items`（双轨结构）
- [ ] 统计数据解析：直接用 `total_assets`、`total_items`、`total_asset_value`、`items_by_type`
- [ ] 物品列表字段：直接用 `item_instance_id`、`name`、`item_type`、`status`、`description` 等后端字段名
- [ ] 确认 JWT Token 对应用户有实际数据
