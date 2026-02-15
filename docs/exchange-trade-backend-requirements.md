# 天工小程序 — 兑换页面 & 交易页面后端功能需求文档

> **文档版本**: v2.0.0（后端对齐版）  
> **生成日期**: 2026-02-16  
> **适用范围**: 兑换页面（exchange）、交易市场页面（trade/market）、库存管理页面（trade/inventory）、积分活动记录页面（records）  
> **后端API版本**: V4 RESTful API 架构（`/api/v4/`）  
> **认证方式**: JWT Token（Bearer Token），所有接口均需认证  
> **技术栈**: Node.js 20+ / Express / Sequelize 6 / MySQL / Redis / Socket.IO  

---

## ⚠️ 后端对齐说明

本文档 v2.0 基于后端真实数据库 Schema、已实现的 Service 层代码和 API 路由进行全面对齐。与 v1.0 的主要差异：

1. **字段命名**: 全部使用后端数据库实际字段名（snake_case），去掉前端臆造字段
2. **接口路径**: 以后端已有的路由域结构为准（`/backpack/exchange`、`/market`、`/assets`）
3. **数据模型**: 以真实数据库表结构为准（80张表，已用 `DESCRIBE` 校验）
4. **资产体系**: 后端是多币种资产体系（`material_asset_types` 表），不是简单的"积分"；兑换使用 `cost_asset_code` + `cost_amount`
5. **账户体系**: 后端采用双层账户模型：`accounts`（账户）→ `account_asset_balances`（余额），不是 `user_id` 直连余额
6. **响应格式**: 后端统一 ApiResponse 格式 `{ success, code, message, data, timestamp, version, request_id }`

---

## 📋 目录

- [一、兑换页面（Exchange）后端需求](#一兑换页面exchange后端需求)
- [二、交易页面（Trade）后端需求](#二交易页面trade后端需求)
- [三、数据模型定义（真实数据库 Schema）](#三数据模型定义真实数据库-schema)
- [四、通用规范](#四通用规范)

---

## 一、兑换页面（Exchange）后端需求

### 1.1 兑换商品列表

| 项目 | 说明 |
|------|------|
| **接口路径** | `GET /api/v4/backpack/exchange/items` |
| **功能描述** | 获取可兑换商品列表，支持空间筛选、分类筛选、关键词搜索、价格范围、分页排序 |
| **认证要求** | ✅ JWT Token |
| **后端服务** | `exchange_query`（ExchangeQueryService.getMarketItems） |
| **实现状态** | ✅ 已实现 |

**请求参数（Query String）**:

| 参数 | 类型 | 必填 | 默认值 | 说明 |
|------|------|------|--------|------|
| `status` | string | 否 | `active` | 商品状态：`active` / `inactive` |
| `space` | string | 否 | null | 空间类型：`lucky`（幸运空间）/ `premium`（臻选空间） |
| `category` | string | 否 | null | 商品分类（对应 `category_defs.category_code`） |
| `asset_code` | string | 否 | null | 材料资产代码筛选（如 `red_shard`、`DIAMOND`） |
| `keyword` | string | 否 | null | 模糊搜索（匹配 `item_name`） |
| `min_cost` | number | 否 | null | 最低价格筛选 |
| `max_cost` | number | 否 | null | 最高价格筛选 |
| `stock_status` | string | 否 | null | 库存状态：`in_stock`(>5) / `low_stock`(1-5) |
| `page` | number | 否 | 1 | 页码 |
| `page_size` | number | 否 | 20 | 每页数量（最大 50） |
| `sort_by` | string | 否 | `sort_order` | 排序字段 |
| `sort_order` | string | 否 | `ASC` | 排序方向：`ASC` / `DESC` |

**响应数据结构**:

```json
{
  "success": true,
  "code": "SUCCESS",
  "message": "获取商品列表成功",
  "data": {
    "items": [
      {
        "exchange_item_id": 17,
        "item_name": "星巴克咖啡券",
        "description": "星巴克中杯美式一杯",
        "cost_asset_code": "red_shard",
        "cost_amount": 100,
        "original_price": 150,
        "stock": 50,
        "sold_count": 120,
        "category": "food_drink",
        "space": "lucky",
        "sort_order": 10,
        "status": "active",
        "primary_image_id": 42,
        "tags": ["热销", "限时"],
        "is_hot": true,
        "is_new": false,
        "is_lucky": true,
        "has_warranty": false,
        "free_shipping": false,
        "sell_point": "限时低价",
        "created_at": "2026-01-15 10:30:00"
      }
    ],
    "pagination": {
      "page": 1,
      "page_size": 20,
      "total": 77,
      "total_pages": 4
    },
    "summary": null
  },
  "timestamp": "2026-02-16 14:30:00",
  "version": "v4.0",
  "request_id": "req_xxx"
}
```

**关键字段说明**（以数据库 `exchange_items` 表字段为准）:

| 字段 | DB类型 | 说明 |
|------|--------|------|
| `exchange_item_id` | BIGINT PK | 商品主键 |
| `item_name` | VARCHAR(200) | 商品名称 |
| `description` | TEXT | 商品描述 |
| `cost_asset_code` | VARCHAR(50) | **支付资产代码**（如 `red_shard`、`DIAMOND`、`POINTS`） |
| `cost_amount` | BIGINT | **支付资产数量** |
| `original_price` | BIGINT NULL | 原价（用于展示折扣，可为 null） |
| `stock` | INT | 库存数量 |
| `sold_count` | INT | 已售数量 |
| `category` | VARCHAR(50) | 分类编码（关联 `category_defs`） |
| `space` | VARCHAR(20) | 空间类型：`lucky` / `premium` |
| `primary_image_id` | INT NULL FK | 主图ID（关联 `image_resources`） |
| `tags` | JSON | 标签数组 |
| `is_hot` | TINYINT(1) | 是否热销 |
| `is_new` | TINYINT(1) | 是否新品 |
| `is_lucky` | TINYINT(1) | 是否幸运商品 |
| `has_warranty` | TINYINT(1) | 是否有保修 |
| `free_shipping` | TINYINT(1) | 是否包邮 |
| `sell_point` | VARCHAR(200) | 商品卖点 |
| `sort_order` | INT | 排序权重 |
| `status` | ENUM | `active` / `inactive` |

> ⚠️ **v1.0 差异**: v1.0 使用 `exchange_points` / `discount` / `rating` / `sales` / `seller` / `image_url` / `image_ratio` 等字段，后端不存在这些字段。后端使用 `cost_asset_code` + `cost_amount` 多币种支付模型，图片通过 `primary_image_id` 关联 `image_resources` 表的 `file_path`。

---

### 1.2 执行商品兑换

| 项目 | 说明 |
|------|------|
| **接口路径** | `POST /api/v4/backpack/exchange` |
| **功能描述** | 用户使用材料资产兑换商品（扣减资产、扣减库存、生成兑换订单） |
| **认证要求** | ✅ JWT Token |
| **后端服务** | `exchange_core`（CoreService.exchangeItem） |
| **实现状态** | ✅ 已实现 |

**请求Body**:

```json
{
  "exchange_item_id": 17,
  "quantity": 1,
  "idempotency_key": "exchange_17_10001_1708070400000"
}
```

| 参数 | 类型 | 必填 | 说明 |
|------|------|------|------|
| `exchange_item_id` | number | ✅ | 兑换商品ID |
| `quantity` | number | 否 | 兑换数量（默认1） |
| `idempotency_key` | string | ✅ | 幂等键（防止重复提交） |

**响应数据结构**:

```json
{
  "success": true,
  "code": "SUCCESS",
  "message": "兑换成功",
  "data": {
    "order_no": "EX202602160001",
    "exchange_item_id": 17,
    "quantity": 1,
    "pay_asset_code": "red_shard",
    "pay_amount": 100,
    "status": "pending",
    "exchange_time": "2026-02-16 14:30:00"
  },
  "timestamp": "2026-02-16 14:30:00",
  "version": "v4.0",
  "request_id": "req_xxx"
}
```

**业务规则**（基于 `CoreService.exchangeItem` 实现）:

1. 幂等键校验（`idempotency_key` 在 `exchange_records` 表唯一约束）
2. 商品状态校验（`status = 'active'`）
3. 库存校验（`stock >= quantity`）
4. 通过 `BalanceService.changeBalance()` 扣减资产（`cost_asset_code` + `cost_amount`）
5. 库存扣减（`stock -= quantity`，`sold_count += quantity`）
6. 创建兑换记录（`exchange_records`），状态 `pending`
7. 全流程在 `TransactionManager.execute()` 事务内

> ⚠️ **v1.0 差异**: v1.0 写"积分不足返回 HTTP 409"，后端实际通过 `BusinessError` 抛出，由全局错误处理返回相应状态码。v1.0 返回的 `remaining_points` 后端不返回（安全考虑，余额需单独查询）。

---

### 1.3 兑换订单管理

#### 1.3.1 获取兑换订单记录

| 项目 | 说明 |
|------|------|
| **接口路径** | `GET /api/v4/backpack/exchange/orders` |
| **功能描述** | 获取用户的兑换订单历史 |
| **后端服务** | `exchange_query`（QueryService.getUserOrders） |
| **实现状态** | ✅ 已实现 |

**请求参数**: `page`, `page_size`, `status`

**订单状态枚举**（数据库 ENUM）: `pending` → `completed` → `shipped` / `cancelled`

#### 1.3.2 获取兑换商品详情

| 项目 | 说明 |
|------|------|
| **接口路径** | `GET /api/v4/backpack/exchange/items/:exchange_item_id` |
| **实现状态** | ✅ 已实现 |

#### 1.3.3 获取兑换订单详情

| 项目 | 说明 |
|------|------|
| **接口路径** | `GET /api/v4/backpack/exchange/orders/:order_no` |
| **实现状态** | ✅ 已实现 |

#### 1.3.4 取消兑换订单

| 项目 | 说明 |
|------|------|
| **接口路径** | `POST /api/v4/backpack/exchange/orders/:order_no/cancel` |
| **功能描述** | 取消未完成的兑换订单，退还资产 |
| **实现状态** | ✅ 已实现 |

---

### 1.4 臻选空间（Premium）

#### 1.4.1 查询臻选空间解锁状态

| 项目 | 说明 |
|------|------|
| **接口路径** | `GET /api/v4/backpack/exchange/premium-status` |
| **功能描述** | 查询当前用户的臻选空间解锁状态 |
| **后端服务** | `premium`（PremiumService.getPremiumStatus） |
| **实现状态** | ✅ 已实现 |

**响应数据结构**:

```json
{
  "success": true,
  "code": "SUCCESS",
  "data": {
    "is_unlocked": false,
    "expires_at": null,
    "unlock_time": null,
    "total_unlock_count": 0,
    "unlock_method": "points",
    "required_total_points": 100000,
    "current_total_points": 55000,
    "unlock_cost": 100,
    "validity_hours": 24
  }
}
```

**关键字段说明**（基于 `user_premium_status` 表 + `PremiumService` 常量）:

| 字段 | 来源 | 说明 |
|------|------|------|
| `is_unlocked` | DB `is_unlocked` | 当前是否已解锁（TINYINT） |
| `expires_at` | DB `expires_at` | 解锁过期时间 |
| `unlock_time` | DB `unlock_time` | 上次解锁时间 |
| `total_unlock_count` | DB `total_unlock_count` | 累计解锁次数 |
| `unlock_method` | DB ENUM | `points` / `exchange` / `vip` / `manual` |
| `required_total_points` | 常量 `100000` | 历史累计积分门槛 |
| `current_total_points` | `users.history_total_points` | 用户当前历史累计积分 |
| `unlock_cost` | 常量 `100` | 解锁费用（扣 POINTS） |
| `validity_hours` | 常量 `24` | 有效期小时数 |

> ⚠️ **v1.0 差异**: v1.0 写 `unlock_expires_at`，后端实际字段是 `expires_at`；v1.0 缺少 `unlock_method`、`total_unlock_count` 等字段。

#### 1.4.2 解锁臻选空间

| 项目 | 说明 |
|------|------|
| **接口路径** | `POST /api/v4/backpack/exchange/unlock-premium` |
| **功能描述** | 用户执行臻选空间解锁，扣除 POINTS，开启24小时访问 |
| **后端服务** | `premium`（PremiumService.unlockPremium） |
| **实现状态** | ✅ 已实现 |

**业务规则**（基于 `PremiumService` 代码）:

1. `users.history_total_points >= 100000`（历史累计门槛）
2. POINTS 可用余额 >= 100（通过 `BalanceService.changeBalance` 扣减）
3. 如果已解锁且未过期，拒绝重复解锁
4. 解锁有效期 24 小时
5. 全流程在 `TransactionManager.execute()` 事务内

---

### 1.5 竞价系统（Bid）

#### 1.5.1 获取竞价商品列表

| 项目 | 说明 |
|------|------|
| **接口路径** | `GET /api/v4/backpack/bid/products` |
| **功能描述** | 获取竞价商品列表 |
| **后端服务** | `bid_query`（BidQueryService） |
| **实现状态** | ✅ 已实现 |

**请求参数**: `status`（默认 `active`，可选 `pending`/`ended`/`settled`/`no_bid`/`all`）、`page`、`page_size`

**响应字段**（基于 `bid_products` 表）:

| 字段 | DB类型 | 说明 |
|------|--------|------|
| `bid_product_id` | BIGINT PK | 竞价商品ID |
| `exchange_item_id` | BIGINT FK | 关联兑换商品ID |
| `start_price` | BIGINT | 起拍价 |
| `current_price` | BIGINT | 当前最高出价 |
| `min_bid_increment` | BIGINT | 最小加价幅度 |
| `price_asset_code` | VARCHAR(50) | 竞价资产类型（默认 `DIAMOND`） |
| `status` | ENUM | 7态：`pending`→`active`→`ended`→`settled`/`no_bid`/`cancelled`/`settlement_failed` |
| `start_time` | DATETIME | 竞价开始时间 |
| `end_time` | DATETIME | 竞价结束时间 |
| `bid_count` | INT | 出价次数 |
| `winner_user_id` | INT NULL | 当前最高出价者 |

> ⚠️ **v1.0 差异**: v1.0 写 `starting_price` / `asset_code` / `highest_bidder_id`，后端实际字段是 `start_price` / `price_asset_code` / `winner_user_id`。状态机是7态，不是v1.0描述的5态。

#### 1.5.2 获取竞价商品详情

| 项目 | 说明 |
|------|------|
| **接口路径** | `GET /api/v4/backpack/bid/products/:bid_product_id` |
| **实现状态** | ✅ 已实现 |

#### 1.5.3 提交竞价出价

| 项目 | 说明 |
|------|------|
| **接口路径** | `POST /api/v4/backpack/bid` |
| **后端服务** | `bid`（BidService.placeBid） |
| **实现状态** | ✅ 已实现 |

**请求Body**:

```json
{
  "bid_product_id": 1,
  "bid_amount": 400
}
```

> ⚠️ **v1.0 差异**: v1.0 要求传 `asset_code`，后端实际从 `bid_products.price_asset_code` 读取，无需前端传入。

**业务规则**（基于 `BidService.placeBid` 实现）:

1. 资产白名单校验（`material_asset_types.is_tradable = true`）
2. 悲观锁定竞价商品
3. 金额校验：`bid_amount >= current_price + min_bid_increment`
4. 旧冻结解冻（用户之前出过价，先解冻旧金额）
5. 新金额冻结
6. 更新 `bid_records`（含幂等键 `idempotency_key`）
7. 更新 `bid_products.current_price`

**响应字段**（基于 `bid_records` 表）:

| 字段 | 说明 |
|------|------|
| `bid_record_id` | 出价记录ID |
| `bid_amount` | 出价金额 |
| `previous_highest` | 出价前最高价 |
| `is_winning` | 是否当前领先 |

#### 1.5.4 获取用户竞价历史

| 项目 | 说明 |
|------|------|
| **接口路径** | `GET /api/v4/backpack/bid/history` |
| **实现状态** | ✅ 已实现 |

---

### 1.6 积分余额查询

| 项目 | 说明 |
|------|------|
| **接口路径** | `GET /api/v4/assets/balance` |
| **功能描述** | 查询单个资产余额（多币种） |
| **后端服务** | `asset_balance`（BalanceService.getBalance） |
| **实现状态** | ✅ 已实现 |

**请求参数**: `asset_code`（必填，如 `POINTS`、`DIAMOND`、`red_shard`）

> ⚠️ `BUDGET_POINTS` 是系统内部资产，后端已拦截禁止查询。

**响应数据结构**:

```json
{
  "success": true,
  "code": "SUCCESS",
  "data": {
    "asset_code": "POINTS",
    "available_amount": 2000,
    "frozen_amount": 100,
    "total_amount": 2100
  }
}
```

**后端数据路径**: `accounts`(user_id) → `account_asset_balances`(account_id + asset_code) → 余额

**系统资产定义**（`material_asset_types` 表，共4种）:

| asset_code | display_name | is_tradable | group_code | 说明 |
|-----------|-------------|-------------|-----------|------|
| `POINTS` | 普通积分 | ❌ 0 | points | 消费积分（不可交易） |
| `DIAMOND` | 钻石 | ✅ 1 | currency | 高级货币（可交易） |
| `red_shard` | 红色碎片 | ✅ 1 | red | 材料资产（可交易） |
| `BUDGET_POINTS` | 预算积分 | ❌ 0 | points | 系统内部（前端不可见） |

---

### 1.7 用户信息查询

| 项目 | 说明 |
|------|------|
| **接口路径** | `GET /api/v4/auth/user-info` |
| **功能描述** | 获取当前登录用户基本信息 |
| **实现状态** | ✅ 已实现 |

**响应字段**（基于 `users` 表）:

| 字段 | DB类型 | 说明 |
|------|--------|------|
| `user_id` | INT PK | 用户ID |
| `nickname` | VARCHAR(50) | 昵称 |
| `avatar_url` | VARCHAR(500) | 头像URL |
| `mobile` | VARCHAR(20) | 手机号（脱敏） |
| `user_level` | ENUM | `normal` / `vip` / `merchant` |
| `status` | ENUM | `active` / `inactive` / `banned` |
| `history_total_points` | INT | 历史累计积分 |

> ⚠️ **v1.0 差异**: v1.0 写 `phone`、`is_admin`，后端实际用 `mobile`、`user_level`。管理员判断通过 RBAC 角色系统（`user_roles` + `roles` 表，`role_level >= 100`）。

---

### 1.8 WebSocket 实时推送

| 项目 | 说明 |
|------|------|
| **协议** | Socket.IO（ChatWebSocketService） |
| **初始化** | `ChatWebSocketService.initialize(server)` |
| **路径** | `/socket.io` |
| **认证** | 握手阶段 JWT 鉴权 |

**需要后端推送的事件**:

| 事件名 | 触发场景 | 推送数据 |
|--------|---------|---------|
| `product_updated` | 商品信息更新 | `{ product_id, updated_fields }` |
| `exchange_stock_changed` | 商品库存变更 | `{ exchange_item_id, new_stock }` |
| `bid_outbid` | 用户出价被超越 | `{ bid_product_id, new_highest_price, new_bidder_id }` |
| `bid_won` | 竞价成功 | `{ bid_product_id, final_price }` |
| `bid_lost` | 竞价失败 | `{ bid_product_id, winning_price }` |

---

## 二、交易页面（Trade）后端需求

### 2.1 交易市场商品列表

| 项目 | 说明 |
|------|------|
| **接口路径** | `GET /api/v4/market/listings` |
| **功能描述** | 获取 C2C 用户交易市场挂单列表，支持多维度筛选 |
| **后端服务** | `market_listing_query`（QueryService.getMarketListings） |
| **实现状态** | ✅ 已实现 |

**请求参数（Query String）**:

| 参数 | 类型 | 必填 | 默认值 | 说明 |
|------|------|------|--------|------|
| `page` | number | 否 | 1 | 页码 |
| `limit` | number | 否 | 20 | 每页数量 |
| `listing_kind` | string | 否 | null | 挂牌类型：`item_instance` / `fungible_asset` |
| `asset_code` | string | 否 | null | 资产代码筛选（仅 `fungible_asset` 有效） |
| `item_category_code` | string | 否 | null | 物品类目代码（仅 `item_instance` 有效） |
| `asset_group_code` | string | 否 | null | 资产分组代码（仅 `fungible_asset` 有效） |
| `rarity_code` | string | 否 | null | 稀有度筛选（仅 `item_instance` 有效） |
| `min_price` | number | 否 | null | 最低价格 |
| `max_price` | number | 否 | null | 最高价格 |
| `sort` | string | 否 | `newest` | 排序方式：`newest` / `price_asc` / `price_desc` |

**响应数据结构**:

```json
{
  "success": true,
  "code": "SUCCESS",
  "data": {
    "products": [
      {
        "market_listing_id": 5402,
        "listing_kind": "fungible_asset",
        "seller_user_id": 31,
        "offer_item_instance_id": null,
        "offer_item_display_name": null,
        "offer_item_rarity": null,
        "offer_item_category_code": null,
        "offer_asset_code": "red_shard",
        "offer_asset_display_name": "红色碎片",
        "offer_asset_group_code": "red",
        "offer_amount": 50,
        "price_asset_code": "DIAMOND",
        "price_amount": 250,
        "status": "on_sale",
        "created_at": "2026-02-15 08:00:00"
      },
      {
        "market_listing_id": 2759,
        "listing_kind": "item_instance",
        "seller_user_id": 11377,
        "offer_item_instance_id": 24714,
        "offer_item_display_name": "交易测试物品",
        "offer_item_rarity": null,
        "offer_item_category_code": null,
        "offer_asset_code": null,
        "offer_amount": null,
        "price_asset_code": "DIAMOND",
        "price_amount": 100,
        "status": "on_sale",
        "created_at": "2026-02-14 08:00:00"
      }
    ],
    "pagination": { "page": 1, "page_size": 20, "total": 50 }
  }
}
```

**关键字段说明**（基于 `market_listings` 表）:

| 字段 | DB类型 | 说明 |
|------|--------|------|
| `market_listing_id` | BIGINT PK | 挂单ID |
| `listing_kind` | ENUM | **挂牌类型**：`item_instance`（不可叠加物品）/ `fungible_asset`（可叠加资产） |
| `seller_user_id` | INT FK | 卖家用户ID |
| `offer_item_instance_id` | BIGINT NULL FK | 物品实例ID（`item_instance` 类型使用） |
| `offer_item_template_id` | BIGINT NULL FK | 物品模板ID |
| `offer_item_display_name` | VARCHAR(200) | 物品显示名称 |
| `offer_item_category_code` | VARCHAR(50) | 物品分类编码 |
| `offer_item_rarity` | VARCHAR(50) | 物品稀有度编码 |
| `offer_asset_code` | VARCHAR(50) NULL | 资产代码（`fungible_asset` 类型使用） |
| `offer_asset_group_code` | VARCHAR(50) NULL | 资产分组代码 |
| `offer_asset_display_name` | VARCHAR(100) | 资产显示名称 |
| `offer_amount` | BIGINT NULL | 上架数量（`fungible_asset` 类型使用） |
| `price_asset_code` | VARCHAR(50) | **定价币种**（默认 `DIAMOND`） |
| `price_amount` | BIGINT | **售价** |
| `status` | ENUM | `on_sale` / `locked` / `sold` / `withdrawn` / `admin_withdrawn` |
| `idempotency_key` | VARCHAR(100) UNI | 幂等键 |

> ⚠️ **v1.0 重大差异**: 后端 `market_listings` 是**双模式表**（`listing_kind` 区分物品和资产），v1.0 未体现此设计。后端状态用 `on_sale` 而非 v1.0 的 `active`。没有 `seller_nickname`、`item_type`、`rarity_display`、`listed_at` 等字段。

---

### 2.2 交易市场商品详情

| 项目 | 说明 |
|------|------|
| **接口路径** | `GET /api/v4/market/listings/:market_listing_id` |
| **实现状态** | ✅ 已实现 |

---

### 2.3 购买市场商品

| 项目 | 说明 |
|------|------|
| **接口路径** | `POST /api/v4/market/listings/:market_listing_id/purchase` |
| **功能描述** | 买家购买市场商品 |
| **后端服务** | `TradeOrderService`（通过 ServiceManager） |
| **实现状态** | ✅ 已实现 |

**业务规则**:

1. 验证挂单状态为 `on_sale`
2. 禁止自买自卖
3. 悲观锁 + 挂单状态 → `locked`
4. 冻结买家资产（`order_freeze_buyer`）
5. 创建 `trade_orders` 记录
6. 结算：扣减买家资产 → 扣平台手续费 → 入账卖家
7. 物品/资产转移
8. 挂单状态 → `sold`

**trade_orders 状态机**: `created` → `frozen` → `completed` / `cancelled` / `failed`

**响应数据结构**:

```json
{
  "success": true,
  "data": {
    "trade_order_id": 1001,
    "business_id": "TR202602160001",
    "market_listing_id": 2001,
    "buyer_user_id": 10001,
    "seller_user_id": 10002,
    "asset_code": "DIAMOND",
    "gross_amount": 50,
    "fee_amount": 5,
    "net_amount": 45,
    "status": "completed"
  }
}
```

> ⚠️ **v1.0 差异**: 后端有完整的手续费计算体系（`gross_amount` / `fee_amount` / `net_amount`），v1.0 完全未涉及。

---

### 2.4 上架物品到市场

| 项目 | 说明 |
|------|------|
| **接口路径** | `POST /api/v4/market/list` |
| **功能描述** | 将用户背包中的不可叠加物品上架到交易市场 |
| **幂等控制** | ✅ `Idempotency-Key` 请求头 |
| **实现状态** | ✅ 已实现 |

**请求Body**:

```json
{
  "item_instance_id": 5001,
  "price_amount": 50,
  "price_asset_code": "DIAMOND"
}
```

---

### 2.5 上架可叠加资产到市场

| 项目 | 说明 |
|------|------|
| **接口路径** | `POST /api/v4/market/fungible-assets/list` |
| **功能描述** | 将可叠加资产上架到交易市场 |
| **幂等控制** | ✅ `Idempotency-Key` 请求头 |
| **实现状态** | ✅ 已实现 |

**请求Body**:

```json
{
  "asset_code": "DIAMOND",
  "amount": 100,
  "price_amount": 500,
  "price_asset_code": "red_shard"
}
```

**业务规则**: 资产必须 `is_tradable = true`（`material_asset_types` 表控制）

---

### 2.6 撤回市场挂单

| 项目 | 说明 |
|------|------|
| **接口路径** | `POST /api/v4/market/manage/listings/:market_listing_id/withdraw` |
| **实现状态** | ✅ 已实现 |

---

### 2.7 查询我的挂单状态

| 项目 | 说明 |
|------|------|
| **接口路径** | `GET /api/v4/market/listing-status` |
| **实现状态** | ✅ 已实现 |

---

### 2.8 市场分类筛选数据

| 项目 | 说明 |
|------|------|
| **接口路径** | `GET /api/v4/market/listings/facets` |
| **功能描述** | 获取市场的分类维度（物品类型、稀有度、价格区间） |
| **实现状态** | ⚠️ 待确认/待实现 |

**数据来源**:

- 物品类型: `item_instances.item_type`（实际值：`voucher`=4420、`product`=1524、`tradable_item`=112、`prize`=41）
- 稀有度: `rarity_defs` 表（5级：common/uncommon/rare/epic/legendary）
- 分类: `category_defs` 表（9个分类，部分已禁用）

---

### 2.9 库存管理（背包系统）

#### 2.9.1 获取用户背包

| 项目 | 说明 |
|------|------|
| **接口路径** | `GET /api/v4/backpack/` |
| **功能描述** | 获取用户背包数据（双轨架构：assets[] + items[]） |
| **后端服务** | `backpack`（BackpackService.getUserBackpack） |
| **实现状态** | ✅ 已实现 |

**响应数据结构**（后端实际输出）:

```json
{
  "success": true,
  "code": "SUCCESS",
  "data": {
    "assets": [
      {
        "asset_code": "DIAMOND",
        "display_name": "钻石",
        "total_amount": 345700,
        "frozen_amount": 0,
        "available_amount": 345700,
        "category": "currency",
        "rarity": "rare",
        "rarity_display": "精良",
        "is_tradable": true
      }
    ],
    "items": [
      {
        "item_instance_id": 6138,
        "item_type": "voucher",
        "item_type_display": "优惠券",
        "name": "10元代金券",
        "status": "available",
        "status_display": "可用",
        "rarity": "common",
        "rarity_display": "普通",
        "description": "满100元可用",
        "acquired_at": "2026-02-10 14:30:00",
        "expires_at": null,
        "has_redemption_code": false
      }
    ]
  }
}
```

**assets 数据来源**: `account_asset_balances` JOIN `accounts`（`account_type='user'`）JOIN `material_asset_types`

**items 数据来源**: `item_instances`（`status='available'`）LEFT JOIN `item_templates`

**`*_display` 字段**: 由后端 `DisplayNameService` + `displayNameHelper.attachDisplayNames()` 自动附加中文显示名

> ⚠️ **v1.0 差异**: items 中无 `image_url`（物品图片在 `item_templates.image_url`，需要关联）。部分历史物品的 `item_template_id` 为 null，此时 `display_name`、`category_code`、`rarity_code` 均为 null。

#### 2.9.2 获取背包统计

| 项目 | 说明 |
|------|------|
| **接口路径** | `GET /api/v4/backpack/stats` |
| **后端服务** | `backpack`（BackpackService.getBackpackStats） |
| **实现状态** | ✅ 已实现 |

#### 2.9.3 获取物品详情

| 项目 | 说明 |
|------|------|
| **接口路径** | `GET /api/v4/backpack/items/:item_instance_id` |
| **实现状态** | ✅ 已实现 |

**额外字段**: `is_owner`（基于 JWT user_id 与 `owner_user_id` 比较）

#### 2.9.4 使用物品

| 项目 | 说明 |
|------|------|
| **接口路径** | `POST /api/v4/backpack/items/:item_instance_id/use` |
| **后端服务** | `asset_item`（ItemService.consumeItem） |
| **实现状态** | ✅ 已实现 |

**业务流程**: 验证物品所有权 → 验证 status=available → `consumeItem`（status→used） → 记录 `item_instance_events`

**响应**: `{ item_instance_id, status: "used", is_duplicate }` （`is_duplicate` 为幂等回放标志）

#### 2.9.5 生成核销码

| 项目 | 说明 |
|------|------|
| **接口路径** | `POST /api/v4/backpack/items/:item_instance_id/redeem` |
| **后端服务** | `redemption_order`（RedemptionService.createOrder） |
| **实现状态** | ✅ 已实现 |

**响应数据结构**:

```json
{
  "success": true,
  "data": {
    "order": {
      "redemption_order_id": "uuid-v4-string",
      "status": "pending",
      "expires_at": "2026-03-18 14:30:00"
    },
    "code": "ABCD1234EFGH"
  },
  "message": "核销码生成成功，请在有效期内到店出示"
}
```

> ⚠️ `redemption_order_id` 是 UUID（CHAR(36)），不是递增数字。`code_hash` 仅存储哈希值，明文核销码**仅返回一次**。

---

### 2.10 积分活动记录

#### 2.10.1 获取资产交易流水

| 项目 | 说明 |
|------|------|
| **接口路径** | `GET /api/v4/assets/transactions` |
| **后端服务** | `asset_query`（QueryService.getTransactions） |
| **实现状态** | ✅ 已实现 |

**请求参数**: `asset_code`, `business_type`, `page`, `page_size`

**响应字段**（基于 `asset_transactions` 表）:

| 字段 | DB类型 | 说明 |
|------|--------|------|
| `asset_transaction_id` | BIGINT PK | 流水ID |
| `asset_code` | VARCHAR(50) | 资产类型 |
| `delta_amount` | BIGINT | 变动金额（**正数=增加，负数=扣减**） |
| `balance_before` | BIGINT | 变动前余额 |
| `balance_after` | BIGINT | 变动后余额 |
| `business_type` | VARCHAR(50) | 业务类型 |
| `description` | 来自 meta.description | 交易描述（约91%有值） |
| `title` | 来自 meta.title | 交易标题（约79%有值） |
| `created_at` | DATETIME | 创建时间 |

**主要 business_type 分布**（真实数据）:

| business_type | 数量 | 说明 |
|--------------|------|------|
| `lottery_consume` | 5064 | 抽奖消耗 |
| `exchange_debit` | 2444 | 兑换扣减 |
| `lottery_reward` | 2330 | 抽奖奖励 |
| `order_freeze_buyer` | 1928 | 交易冻结买家资产 |
| `market_listing_freeze` | 1889 | 上架冻结 |
| `market_listing_withdraw_unfreeze` | 990 | 撤回解冻 |
| `merchant_points_reward` | 50 | 商家积分奖励 |
| `consumption_reward` | 12 | 消费奖励 |

> ⚠️ **v1.0 差异**: v1.0 用 `transaction_id`（string），后端实际用 `asset_transaction_id`（BIGINT）。v1.0 用 `amount`，后端用 `delta_amount`。新增 `balance_before`、`title` 字段。

#### 2.10.2 获取我的消费记录

| 项目 | 说明 |
|------|------|
| **接口路径** | `GET /api/v4/shop/consumption/me` |
| **实现状态** | ✅ 已实现 |

**响应字段**（基于 `consumption_records` 表）:

| 字段 | DB类型 | 说明 |
|------|--------|------|
| `consumption_record_id` | BIGINT PK | 记录主键 |
| `user_id` | INT FK | 用户ID |
| `merchant_id` | INT FK | 商家ID |
| `consumption_amount` | DECIMAL(10,2) | 消费金额（元） |
| `points_to_award` | INT | 待发放积分数 |
| `status` | ENUM | `pending` / `approved` / `rejected` / `expired` |
| `final_status` | ENUM | `pending_review` / `approved` / `rejected` |
| `merchant_notes` | TEXT | 商家备注 |
| `admin_notes` | TEXT | 管理员备注 |
| `store_id` | INT FK | 门店ID |

> ⚠️ **v1.0 差异**: v1.0 用 `points_awarded`，后端实际用 `points_to_award`。后端有4态状态（含 `expired`）和 `final_status` 双重状态。新增 `store_id`、`anomaly_flags`、`anomaly_score` 风控字段。

#### 2.10.3 获取多种资产余额

| 项目 | 说明 |
|------|------|
| **接口路径** | `GET /api/v4/assets/balances` |
| **实现状态** | ✅ 已实现 |

#### 2.10.4 获取资产转换规则

| 项目 | 说明 |
|------|------|
| **接口路径** | `GET /api/v4/assets/conversion-rules` |
| **实现状态** | ✅ 已实现 |

**数据来源**: `material_conversion_rules` 表（当前1条规则）

---

## 三、数据模型定义（真实数据库 Schema）

> 以下模型定义来自真实数据库 `DESCRIBE` 结果，非前端臆造。

### 3.1 兑换商品（exchange_items）

| 字段 | 类型 | 说明 |
|------|------|------|
| `exchange_item_id` | BIGINT PK | 商品ID |
| `item_name` | VARCHAR(200) NOT NULL | 商品名称 |
| `description` | TEXT | 商品描述 |
| `primary_image_id` | INT FK | 主图ID（关联 image_resources） |
| `cost_asset_code` | VARCHAR(50) NOT NULL | 支付资产代码 |
| `cost_amount` | BIGINT NOT NULL | 支付数量 |
| `cost_price` | DECIMAL(10,2) NOT NULL | 成本价 |
| `original_price` | BIGINT NULL | 原价 |
| `stock` | INT DEFAULT 0 | 库存 |
| `sold_count` | INT DEFAULT 0 | 已售 |
| `category` | VARCHAR(50) | 分类编码 |
| `space` | VARCHAR(20) DEFAULT 'lucky' | 空间：lucky/premium |
| `status` | ENUM DEFAULT 'active' | active/inactive |
| `sort_order` | INT DEFAULT 0 | 排序权重 |
| `tags` | JSON | 标签数组 |
| `is_hot/is_new/is_lucky` | TINYINT(1) | 布尔标签 |
| `has_warranty/free_shipping` | TINYINT(1) | 布尔标签 |
| `sell_point` | VARCHAR(200) | 商品卖点 |

### 3.2 兑换记录（exchange_records）

| 字段 | 类型 | 说明 |
|------|------|------|
| `exchange_record_id` | BIGINT PK | 记录ID |
| `user_id` | INT FK | 用户ID |
| `exchange_item_id` | BIGINT FK | 商品ID |
| `order_no` | VARCHAR(50) UNI | 订单号 |
| `idempotency_key` | VARCHAR(100) UNI | 幂等键 |
| `business_id` | VARCHAR(150) UNI | 业务唯一ID |
| `pay_asset_code` | VARCHAR(50) NOT NULL | 支付资产代码 |
| `pay_amount` | BIGINT NOT NULL | 支付金额 |
| `quantity` | INT DEFAULT 1 | 兑换数量 |
| `status` | ENUM | pending/completed/shipped/cancelled |
| `source` | VARCHAR(20) DEFAULT 'exchange' | 来源 |
| `item_snapshot` | JSON | 商品快照 |

### 3.3 竞价商品（bid_products）

| 字段 | 类型 | 说明 |
|------|------|------|
| `bid_product_id` | BIGINT PK | 竞价商品ID |
| `exchange_item_id` | BIGINT FK | 关联兑换商品 |
| `start_price` | BIGINT NOT NULL | 起拍价 |
| `current_price` | BIGINT DEFAULT 0 | 当前最高价 |
| `min_bid_increment` | BIGINT DEFAULT 10 | 最小加价 |
| `price_asset_code` | VARCHAR(50) DEFAULT 'DIAMOND' | 竞价资产 |
| `status` | ENUM(7态) | pending/active/ended/cancelled/settled/settlement_failed/no_bid |
| `start_time/end_time` | DATETIME | 竞价时间窗 |
| `bid_count` | INT DEFAULT 0 | 出价次数 |
| `winner_user_id` | INT NULL | 获胜者 |
| `batch_no` | VARCHAR(50) | 批次号 |

### 3.4 市场挂单（market_listings）

| 字段 | 类型 | 说明 |
|------|------|------|
| `market_listing_id` | BIGINT PK | 挂单ID |
| `listing_kind` | ENUM | **item_instance / fungible_asset** |
| `seller_user_id` | INT FK | 卖家ID |
| `offer_item_instance_id` | BIGINT NULL FK | 物品实例ID |
| `offer_item_template_id` | BIGINT NULL FK | 物品模板ID |
| `offer_item_display_name` | VARCHAR(200) | 物品名称 |
| `offer_item_category_code` | VARCHAR(50) | 物品分类 |
| `offer_item_rarity` | VARCHAR(50) | 物品稀有度 |
| `offer_asset_code` | VARCHAR(50) NULL | 资产代码 |
| `offer_asset_group_code` | VARCHAR(50) | 资产分组 |
| `offer_asset_display_name` | VARCHAR(100) | 资产名称 |
| `offer_amount` | BIGINT NULL | 资产数量 |
| `price_asset_code` | VARCHAR(50) DEFAULT 'DIAMOND' | 定价币种 |
| `price_amount` | BIGINT NOT NULL | 售价 |
| `status` | ENUM | on_sale/locked/sold/withdrawn/admin_withdrawn |
| `idempotency_key` | VARCHAR(100) UNI | 幂等键 |

### 3.5 交易订单（trade_orders）

| 字段 | 类型 | 说明 |
|------|------|------|
| `trade_order_id` | BIGINT PK | 订单ID |
| `business_id` | VARCHAR(150) UNI | 业务唯一ID |
| `market_listing_id` | BIGINT FK | 关联挂单 |
| `buyer_user_id` | INT FK | 买家ID |
| `seller_user_id` | INT FK | 卖家ID |
| `asset_code` | VARCHAR(50) | 交易资产 |
| `gross_amount` | BIGINT | 总额 |
| `fee_amount` | BIGINT DEFAULT 0 | 手续费 |
| `net_amount` | BIGINT | 卖家到手额 |
| `status` | ENUM | created/frozen/completed/cancelled/failed |

### 3.6 物品实例（item_instances）

| 字段 | 类型 | 说明 |
|------|------|------|
| `item_instance_id` | BIGINT PK | 实例ID |
| `owner_user_id` | INT FK | 所有者 |
| `item_type` | VARCHAR(50) | voucher/product/tradable_item/prize |
| `item_template_id` | BIGINT NULL FK | 关联模板 |
| `status` | ENUM | available/locked/transferred/used/expired |
| `meta` | JSON | 扩展信息 |
| `source` | VARCHAR(20) | 来源 |

### 3.7 账户资产余额（account_asset_balances）

| 字段 | 类型 | 说明 |
|------|------|------|
| `account_asset_balance_id` | BIGINT PK | 余额ID |
| `account_id` | BIGINT FK | 关联 accounts 表 |
| `asset_code` | VARCHAR(50) | 资产代码 |
| `available_amount` | BIGINT DEFAULT 0 | 可用余额 |
| `frozen_amount` | BIGINT DEFAULT 0 | 冻结余额 |

> **双层账户模型**: `users` → `accounts`(user_id) → `account_asset_balances`(account_id + asset_code)

---

## 四、通用规范

### 4.1 认证与安全

| 规范 | 说明 |
|------|------|
| **认证方式** | JWT Bearer Token，`Authorization: Bearer <token>` |
| **用户身份** | 通过 JWT Token 自动识别（`req.user.user_id`） |
| **管理员判断** | RBAC角色系统：`user_roles` + `roles` 表，`role_level >= 100` |
| **幂等控制** | 写操作需 `idempotency_key` 参数或 `Idempotency-Key` 请求头 |
| **事务管理** | 写操作通过 `TransactionManager.execute()` 统一管理 |
| **服务获取** | 通过 `req.app.locals.services.getService('service_key')` |

### 4.2 响应格式规范（ApiResponse 标准）

**统一成功响应**:

```json
{
  "success": true,
  "code": "SUCCESS",
  "message": "操作描述",
  "data": { ... },
  "timestamp": "2026-02-16 14:30:00",
  "version": "v4.0",
  "request_id": "req_xxx"
}
```

**统一错误响应**:

```json
{
  "success": false,
  "code": "BAD_REQUEST",
  "message": "错误描述",
  "data": null,
  "timestamp": "2026-02-16 14:30:00",
  "version": "v4.0",
  "request_id": "req_xxx"
}
```

**路由层使用方式**: `res.apiSuccess(data, message)` / `res.apiError(message, code, data, httpStatus)`

### 4.3 分页规范

| 参数 | 说明 |
|------|------|
| `page` | 页码（从1开始） |
| `page_size` 或 `limit` | 每页数量 |
| 响应中 `pagination` | `{ page, page_size, total, total_pages }` |

### 4.4 字段命名规范

| 规范 | 说明 |
|------|------|
| **命名风格** | 全链路 `snake_case` |
| **Display字段** | 后端通过 `DisplayNameService` 自动附加 `*_display` 中文名 |
| **时间格式** | `YYYY-MM-DD HH:mm:ss`（北京时间 GMT+8） |
| **金额类型** | 全部 `BIGINT`（整数，无小数），前端按需格式化 |

### 4.5 错误码对照表

| HTTP状态码 | code字段 | 说明 |
|-----------|---------|------|
| 200 | `SUCCESS` | 成功 |
| 400 | `BAD_REQUEST` / `VALIDATION_ERROR` | 参数错误 |
| 401 | `UNAUTHORIZED` / `INVALID_TOKEN` | 未认证/Token过期 |
| 403 | `FORBIDDEN` | 无权限 |
| 404 | `NOT_FOUND` | 资源不存在 |
| 409 | `CONFLICT` / BusinessError | 业务冲突 |
| 429 | `RATE_LIMIT_EXCEEDED` | 频率限制 |
| 500 | `INTERNAL_SERVER_ERROR` | 服务器错误 |
| 504 | `REQUEST_TIMEOUT` | 请求超时（30秒） |

### 4.6 API 接口汇总

#### 兑换页面所需接口（共12个）

| # | 方法 | 路径 | 状态 |
|---|------|------|------|
| 1 | GET | `/api/v4/backpack/exchange/items` | ✅ 已实现 |
| 2 | GET | `/api/v4/backpack/exchange/items/:exchange_item_id` | ✅ 已实现 |
| 3 | POST | `/api/v4/backpack/exchange` | ✅ 已实现 |
| 4 | GET | `/api/v4/backpack/exchange/orders` | ✅ 已实现 |
| 5 | GET | `/api/v4/backpack/exchange/orders/:order_no` | ✅ 已实现 |
| 6 | POST | `/api/v4/backpack/exchange/orders/:order_no/cancel` | ✅ 已实现 |
| 7 | GET | `/api/v4/backpack/exchange/premium-status` | ✅ 已实现 |
| 8 | POST | `/api/v4/backpack/exchange/unlock-premium` | ✅ 已实现 |
| 9 | GET | `/api/v4/backpack/bid/products` | ✅ 已实现 |
| 10 | GET | `/api/v4/backpack/bid/products/:bid_product_id` | ✅ 已实现 |
| 11 | POST | `/api/v4/backpack/bid` | ✅ 已实现 |
| 12 | GET | `/api/v4/backpack/bid/history` | ✅ 已实现 |

#### 交易页面所需接口（共16个）

| # | 方法 | 路径 | 状态 |
|---|------|------|------|
| 1 | GET | `/api/v4/market/listings` | ✅ 已实现 |
| 2 | GET | `/api/v4/market/listings/:market_listing_id` | ✅ 已实现 |
| 3 | POST | `/api/v4/market/listings/:market_listing_id/purchase` | ✅ 已实现 |
| 4 | POST | `/api/v4/market/list` | ✅ 已实现 |
| 5 | POST | `/api/v4/market/fungible-assets/list` | ✅ 已实现 |
| 6 | POST | `/api/v4/market/manage/listings/:market_listing_id/withdraw` | ✅ 已实现 |
| 7 | GET | `/api/v4/market/listing-status` | ✅ 已实现 |
| 8 | GET | `/api/v4/market/listings/facets` | ⚠️ 待确认 |
| 9 | GET | `/api/v4/backpack/` | ✅ 已实现 |
| 10 | GET | `/api/v4/backpack/stats` | ✅ 已实现 |
| 11 | GET | `/api/v4/backpack/items/:item_instance_id` | ✅ 已实现 |
| 12 | POST | `/api/v4/backpack/items/:item_instance_id/use` | ✅ 已实现 |
| 13 | POST | `/api/v4/backpack/items/:item_instance_id/redeem` | ✅ 已实现 |
| 14 | GET | `/api/v4/assets/balance` | ✅ 已实现 |
| 15 | GET | `/api/v4/assets/transactions` | ✅ 已实现 |
| 16 | GET | `/api/v4/shop/consumption/me` | ✅ 已实现 |

#### 共用接口（共4个）

| # | 方法 | 路径 | 状态 |
|---|------|------|------|
| 1 | GET | `/api/v4/assets/balance` | ✅ 已实现 |
| 2 | GET | `/api/v4/assets/balances` | ✅ 已实现 |
| 3 | GET | `/api/v4/auth/user-info` | ✅ 已实现 |
| 4 | GET | `/api/v4/assets/conversion-rules` | ✅ 已实现 |

---

> **文档说明**: 本文档 v2.0 基于后端真实数据库 Schema（80张表 DESCRIBE 校验）、已实现的 Service 层代码、路由文件和 ApiResponse 标准格式编写。所有字段名、类型、枚举值均来自数据库和代码实际状态。前端开发时请严格按照本文档的字段命名和数据结构对接。
