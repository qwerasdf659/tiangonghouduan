# Marketplace 统计 API 与命名空间重构方案（v3 — 决策锁定版）

> 对应技术债务 §3.3。本文从根因出发，修正命名空间语义错误并完成物理拆分。

---

## 0. 已锁定的决策

| # | 决策项 | 结论 | 理由 |
|---|---|---|---|
| 1 | 拆分深度 | **B — 物理拆分路由文件** | `marketplace.js` 1877 行，B2C 和 C2C 代码混在一起，必须分文件 |
| 2 | 跨域 dashboard 端点 | **要** | 成本低（一个薄路由 + 两条轻量 SQL）；省前端协调两个并行请求的失败处理 |
| 3 | C2C 订单路由 | **合并到 `/marketplace/orders/`**，独立文件 `orders.js` | 消除 `trade_orders` / `trade-orders` 二路由重复 |
| 4 | 竞拍归属 | **`/console/bids/`（独立顶级域）** | 现在就拆为独立域，为 C2C 用户间竞拍预留扩展空间，不绑死在 B2C exchange 下 |
| 5 | 汇率归属 | **`/console/assets/rates/`（平台级资产域）** | 汇率转换是 B2C + C2C 共享功能，不绑死某个域；`assets` 域未来可扩展资产发行/冻结策略/审计 |
| 6 | 旧路径兼容 | **不要** | 项目未上线，直接替换 |
| 7 | 用户侧路由 | **改**，但小程序端后续单独排期 | admin 侧先落地，`/api/v4/backpack/exchange` → `/api/v4/exchange/` 等涉及小程序的后做 |

---

## 1. 根因分析

### 1.1 当前路由结构的语义问题

```
/api/v4/console/marketplace/           ← "marketplace" 语义 = C2C 集市
├── exchange_market/statistics         ← 但这是 B2C 兑换商城统计
├── exchange_market/orders/*           ← B2C 兑换订单（approve/ship/refund/reject/complete）
├── exchange_market/items/*            ← B2C 商品运营（pin/recommend/batch-*）
├── exchange_market/missing-images     ← B2C 运营工具
├── exchange_market/batch-bind-images  ← B2C 运营工具
├── exchange_market/shipping-companies ← B2C 快递
├── trade_orders                       ← C2C 订单（重复！还有 /console/trade-orders/）
├── listings/*/force-withdraw          ← C2C 挂牌管理
├── listings/*/pin,recommend,batch-sort← C2C 挂牌运营
├── listing-stats                      ← C2C 用户上架统计
├── user-listings                      ← C2C 查用户挂牌
├── user-listing-limit                 ← C2C 设上架上限
├── tradable-assets                    ← C2C 可交易资产配置
├── stats/overview                     ← C2C 市场概览
└── stats/price-history                ← C2C 价格走势
```

**1877 行混合文件中**，B2C 路由占 ~1050 行（56%），C2C 路由占 ~830 行（44%）。

### 1.2 底表完全隔离

| 维度 | B2C 兑换商城 | C2C 二级市场 |
|---|---|---|
| 商品表 | `exchange_items` + `exchange_item_skus` + `exchange_channel_prices` | `market_listings` |
| 订单表 | `exchange_records` + `exchange_order_events` | `trade_orders` |
| 价格模型 | 管理员设渠道价 | 卖家自由定价，`PriceDiscoveryService` |
| 结算资产 | 任意 `asset_code` | 固定 `DIAMOND` |
| 参与方 | 管理员 → 用户 | 用户 → 用户 |
| 库存 | SKU 级 `stock` | 物品实例 / 可替代资产余额 |
| 履约 | 审核 → 发货 → 签收（快递） | 托管码冻结 → 成交 → 自动转移 |

**没有一张表共用。**

---

## 2. 行业参考

### 2.1 大厂（按业务域切顶级路径）

- **阿里**：淘宝 C2C 和天猫 B2C 是独立 API namespace（`taobao.trade.*` vs `tmall.item.*`）
- **美团**：外卖/酒旅/打车各自路径前缀，统计在域内——外卖 GMV 不挂酒旅 URL 下
- **腾讯游戏**：道具商城 B2C 和藏宝阁 C2C 独立 API 网关

### 2.2 跨域仪表盘（dashboard）行业做法

- **Shopify Admin**：首屏 Overview 是一个 `/admin/api/dashboard.json`，后端聚合 orders + products + traffic 顶线，一次返回。不要求前端拼多个请求。
- **美团商家端**：首屏 Dashboard 是独立 BFF 端点，聚合各业务线 KPI。
- **Steam Developer Dashboard**：Sales & Activations 页面聚合 Store + Market 数据，是独立接口。
- **闲鱼卖家中心**：统一卖家看板，一个请求拿交易 + 商品 + 曝光。

**共同模式**：跨域仪表盘用独立端点（`/dashboard/*` 或 BFF），不硬塞某个业务域的路径下。

### 2.3 订单路由——独立子路由 vs 内联

- **所有大厂和开源框架**都将订单路由独立为文件，因为订单是增长最快的代码区（退款、物流、争议、审计不断追加）
- 但挂载点必须在所属域下：淘宝订单在 `taobao.trade.order.*`，不会挂到天猫路径
- **Stripe**：`/v1/orders/*` 独立，`/v1/charges/*` 独立，各自有 stats
- **推荐**：C2C 订单独立文件 `marketplace/orders.js`，挂在 `/marketplace/orders` 下

### 2.4 竞拍归属

- **eBay**：Auction 和 Buy It Now 在同一个 listing 模型中，通过 `listing_type` 区分，属于同一个 marketplace 域
- **雅虎拍卖**：独立子站，但 API 归入 `auction.*`
- **本项目**：`bid_products.exchange_item_id` FK → `exchange_items`（B2C 商品），但竞拍模式天然可扩展到 C2C（用户间竞拍、拍卖寄售）。现在就拆为独立顶级域 `/console/bids/`，不绑死在 exchange 下

---

## 3. 目标结构

### 3.1 Admin 路由（`/api/v4/console/`）

```
/api/v4/console/
│
├── exchange/                          ← B2C 兑换商城管理（新顶级域）
│   ├── items/                         ← 商品 CRUD + pin/recommend/batch-*
│   ├── items/:id/skus/                ← SKU 管理
│   ├── orders/                        ← 兑换订单列表/详情
│   ├── orders/:order_no/approve       ← 审核
│   ├── orders/:order_no/ship          ← 发货
│   ├── orders/:order_no/refund        ← 退款
│   ├── orders/:order_no/reject        ← 拒绝
│   ├── orders/:order_no/complete      ← 完成
│   ├── orders/:order_no/track         ← 物流轨迹
│   ├── shipping-companies             ← 快递公司列表
│   ├── missing-images                 ← 缺图商品
│   ├── batch-bind-images              ← 批量绑图
│   └── stats                          ← B2C 统计
│
├── assets/                            ← 资产管理（平台级共享域）
│   └── rates/                         ← 汇率管理（B2C + C2C 都用，不绑死某个域）
│       ├── GET  /                     ← 汇率列表
│       ├── POST /                     ← 创建汇率
│       ├── PUT  /:id                  ← 更新汇率
│       └── PATCH /:id/status          ← 切换状态
│
├── bids/                              ← 竞拍管理（独立顶级域，当前 FK→exchange_items，未来可扩展 C2C 竞拍）
│   ├── POST /                         ← 创建竞价商品
│   ├── GET  /                         ← 竞价列表
│   ├── GET  /:id                      ← 竞价详情 + 出价记录
│   ├── POST /:id/settle               ← 手动结算
│   └── POST /:id/cancel               ← 取消竞价
│
├── marketplace/                       ← C2C 二级市场管理（语义回归正确）
│   ├── listings/                      ← 挂牌管理（pin/recommend/batch-sort/force-withdraw）
│   ├── listing-stats                  ← 用户上架统计
│   ├── user-listings                  ← 查用户挂牌列表
│   ├── user-listing-limit             ← 设上架上限
│   ├── orders/                        ← C2C 交易订单（合并两处重复）
│   │   ├── GET /                      ← 订单列表
│   │   ├── GET /stats                 ← 订单聚合统计
│   │   ├── GET /user/:user_id/stats   ← 用户交易统计
│   │   ├── GET /by-business-id/:bid   ← 按 business_id 查
│   │   └── GET /:id                   ← 订单详情
│   ├── config/                        ← 可交易资产配置
│   └── stats/                         ← C2C 统计
│       ├── overview                   ← 市场概览
│       └── price-history              ← 价格走势
│
└── dashboard/                         ← 跨域平台概览
    └── stats                          ← B2C + C2C 顶线
```

### 3.2 User 路由（`/api/v4/`）— 本次仅更新文档，小程序排期再改

```
/api/v4/
├── exchange/                          ← B2C 用户兑换（现 /backpack/exchange，后续迁移）
│   ├── items                          ← 浏览兑换商品
│   └── orders                         ← 我的兑换订单
│
├── market/                            ← C2C 用户交易（现有，基本不动）
│   ├── listings/
│   ├── sell/
│   ├── buy/
│   ├── manage/
│   ├── escrow/
│   ├── price/
│   └── analytics/
│
└── assets/                            ← 共享资产操作（与 admin /console/assets/ 对齐）
    ├── rates/                         ← 汇率查询/兑换（现 /market/exchange-rate.js，后续迁移）
    └── balances/
```

---

## 4. 物理文件拆分方案

### 4.1 新建文件

| 文件 | 内容来源 | 路由数 |
|---|---|---|
| `routes/v4/console/exchange/index.js` | 新建，挂载下面子路由 | — |
| `routes/v4/console/assets/index.js` | 新建，挂载 rates 子路由 | — |
| `routes/v4/console/exchange/orders.js` | 从 `marketplace.js` 搬出 `exchange_market/orders/*` 全部路由 | 8 个 |
| `routes/v4/console/exchange/operations.js` | 从 `marketplace.js` 搬出 `exchange_market/items/*` 批量操作 + 缺图/绑图 | 8 个 |
| `routes/v4/console/exchange/stats.js` | 从 `marketplace.js` 搬出 `exchange_market/statistics` | 1 个 |
| `routes/v4/console/marketplace/orders.js` | 合并 `marketplace.js` 的 `trade_orders` + `trade-orders.js` 全部 | 5 个 |
| `routes/v4/console/dashboard/index.js` | 新建 | — |
| `routes/v4/console/dashboard/stats.js` | 新建，跨域概览 | 1 个 |

### 4.2 搬迁文件（git mv + 路径改挂载）

| 原文件 | 新位置 |
|---|---|
| `routes/v4/console/market/exchange-items.js` | `routes/v4/console/exchange/items.js` |
| `routes/v4/console/market/exchange-rates.js` | `routes/v4/console/assets/rates.js` |
| `routes/v4/console/market/bid-management.js` | `routes/v4/console/bids/index.js` |

### 4.3 瘦身后的 marketplace.js

删除所有 `exchange_market/*` 路由和 `trade_orders` 路由后，剩余的纯 C2C 路由：

- `GET /listing-stats`
- `GET /user-listings`
- `PUT /user-listing-limit`
- `PUT /listings/:id/pin`
- `PUT /listings/:id/recommend`
- `PUT /listings/batch-sort`
- `POST /listings/:market_listing_id/force-withdraw`
- `GET /stats/overview`
- `GET /stats/price-history`
- `GET /tradable-assets`（→ 重命名为 `/config/tradable-assets`）

约 **~500 行**，从 1877 行瘦身 73%。

### 4.4 删除文件

| 文件 | 原因 |
|---|---|
| `routes/v4/console/market/trade-orders.js` | 内容合并到 `marketplace/orders.js` |

### 4.5 修改挂载

**`routes/v4/console/market/index.js`**（改后）：
```javascript
router.use('/marketplace', require('./marketplace'))     // 瘦身后的 C2C
router.use('/marketplace/orders', require('./marketplace/orders'))  // 从 trade-orders 合并
// 删除：exchange-items, exchange-rates, bid-management（已移走）
```

**`routes/v4/console/index.js`**（新增）：
```javascript
router.use('/exchange', require('./exchange'))            // 新 B2C 域
router.use('/assets', require('./assets'))                // 平台级资产管理
router.use('/bids', require('./bids'))                    // 竞拍独立域
router.use('/dashboard', require('./dashboard'))          // 新跨域概览
```

---

## 5. 各 Stats 端点设计

### 5.1 `GET /api/v4/console/exchange/stats`

B2C 兑换统计。直接调 `ExchangeAdminService.getMarketItemStatistics()`。

| 参数 | 类型 | 默认 | 说明 |
|---|---|---|---|
| `trend_days` | number | `90` | 趋势图周期 |

响应形状与现有 `getMarketItemStatistics()` 返回值完全一致（`orders_summary`、`items_summary`、`fulfillment_tracking`、`order_trend_by_day`）。

### 5.2 `GET /api/v4/console/marketplace/stats/overview`

C2C 市场概览。路由层并行调 `MarketAnalyticsService.getMarketOverview()` + `TradeOrderService.getOrderStats()`。

| 参数 | 类型 | 默认 | 说明 |
|---|---|---|---|
| `days` | number | `7` | 统计周期 |

```jsonc
{
  "data": {
    "period": "7d",
    "totals": { "total_trades": 89, "total_volume": 45600, "unique_buyers": 67, "unique_sellers": 34 },
    "asset_ranking": [{ "asset_code": "red_shard", "trade_count": 45, "total_diamond_volume": 23000, "avg_price": 511 }],
    "on_sale_summary": [{ "asset_code": "red_shard", "on_sale_count": 120, "avg_price": 520 }],
    "orders_by_status": { "pending": 12, "completed": 89, "cancelled": 5 },
    "completed_summary": { "gross_amount": 45600, "total_fee": 2280, "net_amount": 43320 }
  }
}
```

### 5.3 `GET /api/v4/console/marketplace/stats/price-history`

不变。

### 5.4 `GET /api/v4/console/dashboard/stats`

跨域顶线。并行调两个 service 的轻量方法。

| 参数 | 类型 | 默认 | 说明 |
|---|---|---|---|
| `days` | number | `7` | 统计周期 |

```jsonc
{
  "data": {
    "period_days": 7,
    "exchange": {
      "active_items": 42, "period_exchanges": 156, "period_pay_amount": 78000,
      "low_stock_items": 3, "fulfillment_rate": 94.2
    },
    "marketplace": {
      "on_sale_count": 318, "period_trades": 89, "period_volume": 45600,
      "unique_buyers": 67, "unique_sellers": 34
    }
  }
}
```

新增 service 方法（各约 20 行 SQL）：
- `ExchangeAdminService.getExchangeTopline(days)` → 返回 exchange 对象
- `MarketAnalyticsService.getTradingTopline(days)` → 返回 marketplace 对象

---

## 6. 前端常量迁移

### 6.1 `admin/src/api/market/exchange.js`

```javascript
// 旧（删除）
EXCHANGE_MARKET_STATISTICS: '/api/v4/console/marketplace/exchange_market/statistics'

// 新
export const EXCHANGE_ENDPOINTS = {
  ITEMS:              '/api/v4/console/exchange/items',
  ORDERS:             '/api/v4/console/exchange/orders',
  STATS:              '/api/v4/console/exchange/stats',
  // rates 已移至 ASSETS_ENDPOINTS
  SHIPPING_COMPANIES: '/api/v4/console/exchange/shipping-companies',
  MISSING_IMAGES:     '/api/v4/console/exchange/missing-images',
  BATCH_BIND_IMAGES:  '/api/v4/console/exchange/batch-bind-images',
}
```

### 6.2 `admin/src/api/market/trade.js`

```javascript
// 旧（删除）
MARKETPLACE_STATS_ITEM_STATS  // 从未实现
MARKETPLACE_STATS_ORDER_STATS // 从未实现
MARKETPLACE_STATS             // 从未实现
MARKET_OVERVIEW               // 与 exchange.js 重复

// 新
export const MARKETPLACE_ENDPOINTS = {
  LISTINGS:           '/api/v4/console/marketplace/listings',
  LISTING_STATS:      '/api/v4/console/marketplace/listing-stats',
  ORDERS:             '/api/v4/console/marketplace/orders',
  ORDER_STATS:        '/api/v4/console/marketplace/orders/stats',
  STATS_OVERVIEW:     '/api/v4/console/marketplace/stats/overview',
  STATS_PRICE_HISTORY:'/api/v4/console/marketplace/stats/price-history',
  CONFIG_TRADABLE:    '/api/v4/console/marketplace/config/tradable-assets',
}

export const ASSETS_ENDPOINTS = {
  RATES:              '/api/v4/console/assets/rates',
}

export const BIDS_ENDPOINTS = {
  LIST:               '/api/v4/console/bids',
  DETAIL:             '/api/v4/console/bids/:id',
  SETTLE:             '/api/v4/console/bids/:id/settle',
  CANCEL:             '/api/v4/console/bids/:id/cancel',
}

export const DASHBOARD_ENDPOINTS = {
  STATS:              '/api/v4/console/dashboard/stats',
}
```

---

## 7. Service 层变更（极小）

| 操作 | 文件 | 说明 |
|---|---|---|
| 新增方法 | `services/exchange/AdminService.js` | `getExchangeTopline(days)` — 仅 dashboard 用的 6 个顶线字段 |
| 新增方法 | `services/market/MarketAnalyticsService.js` | `getTradingTopline(days)` — 仅 dashboard 用的 5 个顶线字段 |
| 不动 | 其余所有 service | 路由层调用关系不变，只是路径变了 |

---

## 8. 实施步骤

### Phase 1 — 后端路由拆分（本次执行）

1. 新建 `routes/v4/console/exchange/` 目录
2. `git mv` exchange-items → exchange/items, exchange-rates → assets/rates, bid-management → bids/index
3. 从 `marketplace.js` 中抽出 B2C 路由到 exchange/orders.js、exchange/operations.js、exchange/stats.js
4. 合并 `marketplace.js` 中的 `trade_orders` 路由 + `trade-orders.js` 到新 `marketplace/orders.js`（→ 删除 trade-orders.js）
5. 新建 `routes/v4/console/dashboard/stats.js`
6. 更新挂载：`console/index.js`、`market/index.js`
7. 新增 `getExchangeTopline` + `getTradingTopline`
8. 更新测试路径

### Phase 2 — 前端常量 + composables

1. 更新 `admin/src/api/market/exchange.js` 和 `trade.js` 常量
2. `exchange-stats.js` 改调 `/exchange/stats`
3. `trade-management.js` 改调 `/marketplace/orders` 和 `/marketplace/stats/overview`
4. 首屏 dashboard 改调 `/dashboard/stats`
5. 删除未实现的废弃常量

### Phase 3 — 用户侧路由（小程序排期时）

1. `/api/v4/backpack/exchange` → `/api/v4/exchange/`
2. `/api/v4/market/*` → 评估是否改名为 `/api/v4/marketplace/*`
3. 小程序端同步更新接口地址

---

## 9. 对比与长期收益

| 维度 | 现状 | 改后 |
|---|---|---|
| 最大路由文件 | `marketplace.js` 1877 行 | ~500 行（C2C）+ ~350 行（B2C orders）+ ~300 行（B2C ops） |
| 域与路径对应 | B2C 和 C2C 混在 `/marketplace/` | `/exchange/` = B2C，`/marketplace/` = C2C |
| C2C 订单路由重复 | 2 处（marketplace.js + trade-orders.js） | 1 处（marketplace/orders.js） |
| stats 需要前缀 | `exchange_market/statistics` vs `stats/overview` | `/exchange/stats` vs `/marketplace/stats/overview` |
| 新人理解成本 | 看到 `/marketplace/exchange_market` 需解释 | `/exchange/stats` 自解释 |
| 前端常量 | 两文件互相引用，3 个从未实现 | 一域一文件，无废弃常量 |
| 跨域仪表盘 | 前端拼 2 个请求 | `/dashboard/stats` 一次返回 |

---

## 10. 风险

1. **grep 全仓换路径**：前端 HTML/JS 中硬编码了部分旧路径（如 `exchange_market/orders`），需全量替换
2. **ESLint 未实现路由常量**：`MARKETPLACE_STATS_ITEM_STATS` 等从未有后端实现，直接删除
3. **`tradable-assets` 挪到 config 下**：前端引用需同步更新
4. **admin HTML 中的 `x-show` 和 tab 切换**：页面 JS 引用的 API 常量变了，需逐个检查
