# Marketplace 统计 API 与命名空间重构方案（v3 — 决策锁定版）

> 对应技术债务 §3.3。本文从根因出发，修正命名空间语义错误并完成物理拆分。

## ✅ 实施进度总览（2026-03-24 第四次审计 — 后端数据库为唯一权威）

| 阶段 | 状态 | 说明 |
|---|---|---|
| Phase 1 — 后端路由拆分 | ✅ 已完成 | 文件物理迁移 + 路由挂载 + Service 方法 + 测试通过 + 头部注释已修正 |
| Phase 2 — Web 管理后台前端常量 | ✅ 已完成 | key 去冗余前缀 + 域直接导入 + 补全 MISSING_IMAGES/BATCH_BIND_IMAGES + 构建通过 |
| Phase 3 — 用户侧路由（后端） | ✅ 后端已完成 | `/api/v4/exchange/`、`/api/v4/marketplace/`、`/api/v4/assets/` 已挂载，旧路径已删除 |
| Phase 3 — 用户侧路由（小程序） | ⏳ 待排期 | 小程序端接口地址尚未从旧路径切换到新路径（详见 §13.3） |
| 决策 1 — 补全 import/export 路由 | ✅ 已完成 | `GET /export` + `POST /import` 已实现，CANONICAL_OPERATION_MAP 已更新 |
| 决策 2 — 补前端 MISSING_IMAGES 等 | ✅ 已完成 | exchange.js 已添加 MISSING_IMAGES + BATCH_BIND_IMAGES 及对应 API 方法 |
| 决策 3 — 模式 A 域直接导入 | ✅ 已完成 | 5 个 consumer 文件改为域直接导入，key 去冗余前缀，barrel 保留仅供审计 |

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

### 3.2 User 路由（`/api/v4/`）— ✅ 后端已完成迁移

```
/api/v4/
├── exchange/                          ← B2C 用户兑换 ✅（原 /backpack/exchange，已迁移）
│   ├── items                          ← 浏览兑换商品
│   ├── orders                         ← 我的兑换订单
│   ├── bid                            ← 竞拍出价
│   └── unlock-premium                 ← 解锁高级空间
│
├── marketplace/                       ← C2C 用户交易 ✅（原 /market，已迁移改名）
│   ├── listings/
│   ├── sell/
│   ├── buy/
│   ├── manage/
│   ├── escrow/
│   ├── price/
│   └── analytics/
│
├── assets/                            ← 共享资产操作 ✅（与 admin /console/assets/ 对齐）
│   ├── rates/                         ← 汇率查询/兑换（原 /market/exchange-rates，已迁移）
│   └── ...
│
└── backpack/                          ← 背包（仅保留物品查询/核销/使用，exchange 已移走）
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

### 4.2 搬迁文件 ✅ 已完成

| 原文件 | 新位置 | 状态 |
|---|---|---|
| `routes/v4/console/market/exchange-items.js` | `routes/v4/console/exchange/items.js` | ✅ 已迁移 |
| `routes/v4/console/market/exchange-rates.js` | `routes/v4/console/assets/rates.js` | ✅ 已迁移 |
| `routes/v4/console/market/bid-management.js` | `routes/v4/console/bids/management.js` | ✅ 已迁移 |

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

实际 **683 行**（纯 C2C，10 个路由），从 1877 行瘦身 64%。

### 4.4 删除文件 ✅ 已完成

| 文件 | 原因 | 状态 |
|---|---|---|
| `routes/v4/console/market/trade-orders.js` | 内容合并到 `marketplace/orders.js` | ✅ 已删除 |

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

跨域顶线。**并行聚合三个业务域**：B2C 兑换、C2C 市场、竞拍（与实现 `routes/v4/console/dashboard/stats.js` 一致）。

| 参数 | 类型 | 默认 | 说明 |
|---|---|---|---|
| `days` | number | `7` | 统计周期 |

```jsonc
{
  "data": {
    "period_days": 7,
    "exchange": {
      "active_items": 42,
      "period_exchanges": 156,
      "period_pay_amount": 78000,
      "low_stock_items": 3,
      "fulfillment_rate": 94.2
    },
    "marketplace": {
      "on_sale_count": 318,
      "period_trades": 89,
      "period_volume": 45600,
      "unique_buyers": 67,
      "unique_sellers": 34
    },
    "bids": {
      "active_products": 5,
      "period_bids": 120,
      "period_settled": 3
    }
  }
}
```

新增 / 使用的 service 方法（轻量 SQL，各服务内实现）：
- `ExchangeAdminService.getExchangeTopline(days)` → `exchange` 对象
- `MarketAnalyticsService.getTradingTopline(days)` → `marketplace` 对象
- `BidQueryService.getBidTopline(days)` → `bids` 对象（`req.app.locals.services.getService('exchange_bid_query')`）

---

## 6. 前端常量迁移（第三次审计 — 实际代码状态 vs 原始设计）

> **原则**：后端路由为唯一权威。前端常量命名和路径必须与后端一致，不做映射。

### 6.1 `admin/src/api/market/exchange.js` — ✅ 已对齐（2026-03-24 决策 3 落地）

```javascript
export const EXCHANGE_ENDPOINTS = {
  ITEMS:              '/api/v4/console/exchange/items',
  ORDERS:             '/api/v4/console/exchange/orders',
  ORDER_DETAIL:       '/api/v4/console/exchange/orders/:order_no',
  ORDER_APPROVE:      '/api/v4/console/exchange/orders/:order_no/approve',
  ORDER_SHIP:         '/api/v4/console/exchange/orders/:order_no/ship',
  ORDER_REJECT:       '/api/v4/console/exchange/orders/:order_no/reject',
  ORDER_REFUND:       '/api/v4/console/exchange/orders/:order_no/refund',
  ORDER_COMPLETE:     '/api/v4/console/exchange/orders/:order_no/complete',
  ITEM_PIN:           '/api/v4/console/exchange/items/:exchange_item_id/pin',
  ITEM_RECOMMEND:     '/api/v4/console/exchange/items/:exchange_item_id/recommend',
  ITEMS_BATCH_SORT:   '/api/v4/console/exchange/items/batch-sort',
  ITEMS_BATCH_STATUS: '/api/v4/console/exchange/items/batch-status',
  ITEMS_BATCH_PRICE:  '/api/v4/console/exchange/items/batch-price',
  ITEMS_BATCH_CATEGORY:'/api/v4/console/exchange/items/batch-category',
  MISSING_IMAGES:     '/api/v4/console/exchange/missing-images',      // ✅ 已补全
  BATCH_BIND_IMAGES:  '/api/v4/console/exchange/batch-bind-images',   // ✅ 已补全
  SHIPPING_COMPANIES: '/api/v4/console/exchange/orders/shipping-companies',
  ORDER_TRACK:        '/api/v4/console/exchange/orders/:order_no/track',
  STATS:              '/api/v4/console/exchange/stats',
}
```

**决策 3 已全部落地**：key 已去除 `EXCHANGE_` 冗余前缀，域上下文由变量名 `EXCHANGE_ENDPOINTS` 承载。5 个 consumer 文件已迁移为域直接导入。

### 6.2 `admin/src/api/market/trade.js` — 实际状态

```javascript
export const TRADE_ENDPOINTS = {  // ⚠️ 原设计叫 MARKETPLACE_ENDPOINTS
  TRADE_ORDERS:       '/api/v4/console/marketplace/orders',
  // ... LISTING_LIST, LISTING_DETAIL, LISTING_STATS, LISTING_USER_LISTINGS, LISTING_USER_LIMIT,
  // LISTING_FORCE_WITHDRAW, LISTING_PIN, LISTING_RECOMMEND, LISTING_BATCH_SORT,
  // STATS_OVERVIEW, STATS_PRICE_HISTORY, CONFIG_TRADABLE,
  // TRADE_ORDER_LIST, TRADE_ORDER_DETAIL, TRADE_ORDER_STATS, TRADE_ORDER_USER_STATS,
  // TRADE_ORDER_BY_BUSINESS_ID
  // ... 以及大量 BUSINESS_RECORD_* 键（审计记录查询）
}
```

### 6.3 其它前端 API 文件 — 实际状态

| 原设计位置 | 实际文件 | 实际常量名 | 说明 |
|---|---|---|---|
| `trade.js` 的 `ASSETS_ENDPOINTS` | `admin/src/api/market/exchange-rate.js` | `EXCHANGE_RATE_ENDPOINTS` | 独立文件，key: `EXCHANGE_RATE_LIST` / `CREATE` / `UPDATE` / `STATUS` |
| `trade.js` 的 `BIDS_ENDPOINTS` | `admin/src/api/market/bid.js` | `BID_ENDPOINTS` | 独立文件，key: `BID_LIST` / `BID_CREATE` / `BID_DETAIL` / `BID_SETTLE` / `BID_CANCEL` |
| `trade.js` 的 `DASHBOARD_ENDPOINTS` | `admin/src/api/dashboard.js` | `DASHBOARD_ENDPOINTS` | 独立文件，key: `PLATFORM_CROSS_STATS` 等 |
| — | `admin/src/api/market/index.js` | `MARKET_ENDPOINTS` | barrel 文件，spread 合并所有 4 个端点对象 |

### 6.4 `admin/src/api/exchange-item/index.js` — ✅ 前后端已对齐

```javascript
ITEM_IMPORT: '/api/v4/console/exchange/items/import',  // ✅ 后端已实现（POST，接收 Excel 文件）
ITEM_EXPORT: '/api/v4/console/exchange/items/export',  // ✅ 后端已实现（GET，返回 Excel 文件）
```

### 6.5 前端常量修正方案（🔴 需拍板 — 见 §13）

**方案 A（推荐 — 更新文档适配代码）**：接受当前"一域一文件"组织方式（`exchange.js` / `trade.js` / `bid.js` / `exchange-rate.js` / `dashboard.js`），更新本文档。仅修正：key 命名去冗余前缀、补缺失常量、删无后端路由的常量。

**方案 B（激进 — 重构代码适配文档）**：按原设计将所有常量合并到 `trade.js`，统一命名为 `MARKETPLACE_ENDPOINTS` / `ASSETS_ENDPOINTS` / `BIDS_ENDPOINTS` / `DASHBOARD_ENDPOINTS`。影响面大，需改所有引用文件。

---

## 7. Service 层变更 ✅ 已全部完成

| 操作 | 文件 | 方法签名 | 状态 |
|---|---|---|---|
| 新增方法 | `services/exchange/AdminService.js` | `getExchangeTopline(days=7)` — SQL: exchange_items + exchange_records + exchange_item_skus | ✅ |
| 新增方法 | `services/market/MarketAnalyticsService.js` | `static getTradingTopline(days=7)` — SQL: market_listings + trade_orders | ✅ |
| 新增方法 | `services/exchange/BidQueryService.js` | `getBidTopline(days=7)` — SQL: bid_products + bid_records | ✅ |
| 已有方法 | `services/exchange/AdminService.js` | `getMarketItemStatistics({trend_days})` — B2C 完整统计 | ✅ |
| 不动 | 其余所有 service | 业务统计主逻辑不变，主要是路由命名空间调整 | — |

---

## 8. 实施步骤

### Phase 1 — 后端路由拆分 ✅ 已完成

1. ✅ 新建 `routes/v4/console/exchange/` 目录（index.js + orders.js + stats.js + operations.js）
2. ✅ 物理迁移：exchange-items → `exchange/items.js`，exchange-rates → `assets/rates.js`，bid-management → `bids/management.js`
3. ✅ 从 `marketplace.js` 中抽出 B2C 路由到 exchange/orders.js、exchange/operations.js、exchange/stats.js
4. ✅ 合并 `marketplace.js` 中的 `trade_orders` 路由 + `trade-orders.js` 到新 `marketplace/orders.js`（trade-orders.js 已删除）
5. ✅ 新建 `routes/v4/console/dashboard/stats.js`（并行聚合 **exchange + marketplace + bids** 三域）
6. ✅ 更新挂载：`console/index.js` 新增 exchange / bids / dashboard，`market/index.js` 瘦身仅挂载 C2C
7. ✅ 新增 `getExchangeTopline` + `getTradingTopline` + `getBidTopline`（dashboard 三域聚合）
8. ✅ `tradable-assets` 路径从 `/tradable-assets` 迁移到 `/config/tradable-assets`
9. ✅ marketplace.js 从 1877 行瘦身至 ~680 行（纯 C2C）
10. ✅ 测试全部通过（15/15 pass）

### Phase 2 — 前端常量 + composables ✅ 已完成

1. ✅ `exchange.js`：EXCHANGE_ENDPOINTS 仅保留 B2C 端点，删除 C2C 常量 `MARKET_STATS_OVERVIEW`
2. ✅ `trade.js`：删除 3 个从未实现的废弃常量（`MARKETPLACE_STATS_ITEM_STATS`、`MARKETPLACE_STATS_ORDER_STATS`、`MARKETPLACE_STATS`），删除废弃方法 `getMarketplaceStats`，新增 `CONFIG_TRADABLE` 端点，`MARKET_OVERVIEW` 重命名为 `STATS_OVERVIEW`
3. ✅ `exchange-stats.js` 已使用 `MARKET_ENDPOINTS.STATS`（指向 `/exchange/stats`）
4. ✅ `trade-management.js` 改用 `STATS_OVERVIEW` 调 `/marketplace/stats/overview`
5. ✅ `dashboard.js` 已有 `PLATFORM_CROSS_STATS` 端点（指向 `/dashboard/stats`）
6. ✅ `risk-alerts.js` 改用 `TRADE_ENDPOINTS.STATS_OVERVIEW` 替代旧 `EXCHANGE_ENDPOINTS.MARKET_STATS_OVERVIEW`
7. ✅ 前端构建通过，无编译错误

### Phase 3 — 用户侧路由 ✅ 后端已完成 / ⏳ 小程序待排期

> 后端已于 2026-03-23 完成全部迁移并删除旧路径（不兼容旧接口）。小程序端尚未同步。

**后端已完成的变更**：
1. ✅ `/api/v4/backpack/exchange` → `/api/v4/exchange/`（旧路径已删除）
2. ✅ `/api/v4/market/*` → `/api/v4/marketplace/*`（旧目录已删除）
3. ✅ `/api/v4/market/exchange-rates` → `/api/v4/assets/rates`（旧路径已删除）
4. ✅ `CANONICAL_OPERATION_MAP` 已更新
5. ✅ 14 个测试文件已替换新路径

**⏳ 小程序端待执行**：全局替换接口地址（详见 §13.3）

---

## 9. 对比与长期收益

| 维度 | 现状 | 改后 |
|---|---|---|
| 最大路由文件 | `marketplace.js` 1877 行 | 683 行（C2C）+ ~350 行（B2C orders）+ ~300 行（B2C ops） |
| 域与路径对应 | B2C 和 C2C 混在 `/marketplace/` | `/exchange/` = B2C，`/marketplace/` = C2C |
| C2C 订单路由重复 | 2 处（marketplace.js + trade-orders.js） | 1 处（marketplace/orders.js） |
| stats 需要前缀 | `exchange_market/statistics` vs `stats/overview` | `/exchange/stats` vs `/marketplace/stats/overview` |
| 新人理解成本 | 看到 `/marketplace/exchange_market` 需解释 | `/exchange/stats` 自解释 |
| 前端常量 | 两文件互相引用，3 个从未实现 | 一域一文件，无废弃常量 |
| 跨域仪表盘 | 前端拼多个请求 | `/dashboard/stats` 一次返回（含 B2C + C2C + 竞拍顶线） |

---

## 10. 风险

1. **grep 全仓换路径**：前端 HTML/JS 中硬编码了部分旧路径（如 `exchange_market/orders`），需全量替换
2. **ESLint 未实现路由常量**：`MARKETPLACE_STATS_ITEM_STATS` 等从未有后端实现，直接删除
3. **`tradable-assets` 挪到 config 下**：前端引用需同步更新
4. **admin HTML 中的 `x-show` 和 tab 切换**：页面 JS 引用的 API 常量变了，需逐个检查

---

## 11. 落地状态与待办（2026-03-23 第三次审计 — 逐行代码+数据库验证）

> **审计方法**：直连生产数据库 `restaurant_points_dev`（`dbconn.sealosbja.site:42569`），逐文件 read 后端路由/服务/前端常量，与本文档逐项对照。

### 11.1 后端（Phase 1）— ✅ 已完成，无遗留

| 项 | 状态 | 验证依据 |
|---|---|---|
| `/console/exchange/*`（items / orders / stats / operations） | ✅ | `console/index.js:41` → `exchange/index.js` 挂载 4 个子文件 |
| `/console/assets/rates` | ✅ | `console/index.js:40` → `assets/index.js` 挂载 `./rates` |
| `/console/bids/*` | ✅ | `console/index.js:42` → `bids/index.js` → `management.js` |
| `/console/marketplace/*`（C2C 挂牌 + stats） | ✅ | `console/market/index.js` → `marketplace.js`（683 行） |
| `/console/marketplace/orders/*` | ✅ | `console/market/index.js` → `../marketplace/orders.js` |
| `/console/dashboard/stats` | ✅ | `console/index.js:43` → `dashboard/stats.js` 聚合三域 |
| `CANONICAL_OPERATION_MAP` | ✅ | `IdempotencyService.js:81-562`，无 `exchange_market/*`、无 `ADMIN_EXCHANGE_BATCH_IMPORT` |
| `GET /exchange/stats` 的 `trend_days` | ✅ | `ExchangeAdminService.getMarketItemStatistics({ trend_days })`，默认 90 |
| C2C 可交易配置路径 | ✅ | **仅** `GET /console/marketplace/config/tradable-assets` |
| `GET /exchange/missing-images` | ✅ | `operations.js` 中已实现 |
| `POST /exchange/batch-bind-images` | ✅ | `operations.js` 中已实现 |
| `POST /exchange/items/import` | ✅ 已实现 | `items.js` 接收 Excel 文件批量导入商品（2026-03-24） |
| `GET /exchange/items/export` | ✅ 已实现 | `items.js` 导出商品列表为 Excel（2026-03-24） |

### 11.2 Web 管理后台前端（Phase 2）— ✅ 已完成（2026-03-24 第四次审计）

| 项 | 状态 | 说明 |
|---|---|---|
| `EXCHANGE_ENDPOINTS.ITEMS` / `STATS` | ✅ | `admin/src/api/market/exchange.js` |
| `TRADE_ENDPOINTS`（含 `STATS_OVERVIEW`、`CONFIG_TRADABLE`） | ✅ | `admin/src/api/market/trade.js` |
| 兑换统计 composable | ✅ | `exchange-stats.js` 使用 `EXCHANGE_ENDPOINTS.STATS`（域直接导入） |
| 运营大盘 | ✅ | `dashboard-overview.js` → `DashboardAPI.getPlatformCrossStats()` |
| `DASHBOARD_ENDPOINTS.PLATFORM_CROSS_STATS` | ✅ | `admin/src/api/dashboard.js` |
| `MISSING_IMAGES` 端点常量 | ✅ 已补全 | `exchange.js` 已添加 + API 方法 `getMissingImages()` |
| `BATCH_BIND_IMAGES` 端点常量 | ✅ 已补全 | `exchange.js` 已添加 + API 方法 `batchBindImages()` |
| `ITEM_IMPORT` 端点常量 | ✅ 前后端对齐 | 后端 `POST /exchange/items/import` 已实现 |
| `ITEM_EXPORT` 端点常量 | ✅ 前后端对齐 | 后端 `GET /exchange/items/export` 已实现 |
| 常量 key 去冗余前缀 | ✅ 已完成 | `EXCHANGE_ORDERS` → `ORDERS`，域上下文由变量名承载 |
| 5 个 consumer 域直接导入 | ✅ 已完成 | `MARKET_ENDPOINTS` → 各域 `EXCHANGE_ENDPOINTS` / `TRADE_ENDPOINTS` |
| `admin/dist/` 已重新构建 | ✅ | 2026-03-24 `npm run build` 通过 |

**构建提醒**：静态资源来自 `admin/dist/`，改源码后需执行 `cd admin && npm run build`。

### 11.3 自动化测试 — 已对齐路径

- `tests/business/admin/market-pages-api.test.js`：15/15 通过。
- `tests/security/authorization-bypass.test.js`：管理员探测路径已改为 `/console/marketplace/orders`。

### 11.4 用户侧后端（Phase 3 后端）— ✅ 已完成

| 项 | 状态 | 验证依据 |
|---|---|---|
| `/api/v4/exchange/` | ✅ | `app.js` 挂载 `routes/v4/exchange/index.js`（含 bid 子路由） |
| `/api/v4/marketplace/*` | ✅ | `app.js` 挂载 `routes/v4/marketplace/`（listings/sell/buy/manage/escrow/price/analytics） |
| `/api/v4/assets/rates` | ✅ | `app.js` 挂载 `routes/v4/assets/`（含 rates.js） |
| `/api/v4/market/` | ✅ 已删除 | 目录 `routes/v4/market/` 不存在，`app.js` 无挂载 |
| `/api/v4/backpack/exchange` | ✅ 已移除 | `backpack/index.js` 不再挂载 exchange 子路由 |
| `CANONICAL_OPERATION_MAP` | ✅ | 已更新为 `/api/v4/exchange`、`/api/v4/marketplace/*`、`/api/v4/assets/rates/convert` |
| 测试文件 | ✅ | 14 个测试文件已替换新路径 |

### 11.5 用户域权威路径速查（小程序对接用）

```
# B2C 兑换（原 /backpack/exchange）
GET  /api/v4/exchange/items                          ← 商品列表
GET  /api/v4/exchange/items/:exchange_item_id         ← 商品详情
POST /api/v4/exchange                                 ← 下单兑换
GET  /api/v4/exchange/orders                          ← 我的兑换订单
POST /api/v4/exchange/orders/:order_no/confirm-receipt
POST /api/v4/exchange/orders/:order_no/cancel
POST /api/v4/exchange/bid                             ← 竞拍出价
POST /api/v4/exchange/unlock-premium                  ← 解锁高级空间

# C2C 交易市场（原 /market）
GET  /api/v4/marketplace/listings                     ← 市场挂牌列表
POST /api/v4/marketplace/list                         ← 上架
POST /api/v4/marketplace/listings/:id/purchase        ← 购买
POST /api/v4/marketplace/listings/:id/withdraw        ← 撤回
GET  /api/v4/marketplace/manage/my-listings           ← 我的挂牌
POST /api/v4/marketplace/sell                         ← 出售
POST /api/v4/marketplace/buy                          ← 购买（旧入口）
GET  /api/v4/marketplace/escrow/...                   ← 担保交易
GET  /api/v4/marketplace/price/...                    ← 价格查询
GET  /api/v4/marketplace/analytics/...                ← 用户交易分析

# 汇率兑换（原 /market/exchange-rates）
GET  /api/v4/assets/rates                             ← 汇率列表
POST /api/v4/assets/rates/convert                     ← 执行兑换
```

**Console（运营后台）权威路径速查**：

```
GET  /api/v4/console/exchange/stats?trend_days=90     ← B2C 兑换统计
GET  /api/v4/console/exchange/missing-images          ← 缺图商品
POST /api/v4/console/exchange/batch-bind-images       ← 批量绑图
GET  /api/v4/console/exchange/items/export            ← 商品导出（Excel）
POST /api/v4/console/exchange/items/import            ← 商品导入（Excel）
GET  /api/v4/console/marketplace/stats/overview?days=7 ← C2C 市场概览
GET  /api/v4/console/dashboard/stats?days=7           ← 跨域平台顶线
GET  /api/v4/console/marketplace/orders               ← C2C 订单管理
GET  /api/v4/console/bids                             ← 竞拍管理
GET  /api/v4/console/assets/rates                     ← 汇率管理
```

### 11.6 后端代码注释问题 — ✅ 已修正（2026-03-24）

| 文件 | 修正内容 |
|---|---|
| `routes/v4/console/assets/index.js` 头部注释 | ✅ 已添加 `rates.js - 汇率管理` 模块说明 |
| `routes/v4/console/index.js` 头部注释第 12 行 | ✅ 已更新为 `market/ 2 文件 C2C 二级市场挂牌 + C2C 订单` |
| `routes/v4/backpack/index.js` 第 11 行注释 | ✅ 已移除 "exchange 子路由"，标注迁移说明 |

---

## 12. 数据库真实数据审计（2026-03-23 直连 `restaurant_points_dev`）

| 表 | 总行数 | 状态分布 | 业务观察 |
|---|---|---|---|
| `bid_products` | **0** | — | 竞拍功能已建好但从未创建过竞拍商品 |
| `bid_records` | **0** | — | 无出价记录 |
| `exchange_records` | **22** | pending=22, completed=0 | B2C 兑换订单全部停在 pending，**履约流程未跑通** |
| `trade_orders` | **154** | completed=23, cancelled=131 (85%) | C2C 交易取消率极高，仅 23 笔完成 |
| `market_listings` | **327** | on_sale=21, sold=22, withdrawn=284 (87%) | 绝大部分挂牌已撤回 |
| `exchange_items` | **102** | active=20, inactive=82 | 仅 20 个在售商品 |
| `exchange_rates` | **7** | active=6, paused=1 | 汇率兑换规则正常 |

**业务影响分析**：

- `GET /console/dashboard/stats` 的 `bids` 段永远返回全零（无数据）
- `GET /console/dashboard/stats` 的 `exchange.fulfillment_rate` 为 0（22 笔 pending，0 笔完成）
- `GET /console/marketplace/stats/overview` 的 `completed_summary` 仅反映 23 笔成交

**性质判断**：这些是测试/开发阶段的正常数据状态，不是代码 bug。竞拍模块代码完整可用，待产品侧决定是否上线启用并灌入初始数据。

---

## 13. 问题分类与执行计划（按责任方）

### 13.1 后端数据库项目问题（3 项）— ✅ 全部解决

| # | 问题 | 状态 | 解决方式 |
|---|---|---|---|
| B1 | `POST /exchange/items/import` 和 `GET /exchange/items/export` | ✅ 已实现 | 2026-03-24 补全路由 + CANONICAL_OPERATION_MAP |
| B2 | 3 个文件头部注释过时 | ✅ 已修正 | 2026-03-24 直接修正注释 |
| B3 | `SHIPPING_COMPANIES` 路径 `/exchange/orders/shipping-companies` | ✅ 无影响 | 前端已适配此路径，保持现状 |

**B1 执行步骤（补全路由 — 推荐方案）**：
```
1. routes/v4/console/exchange/items.js 新增：
   - POST /import — multipart/form-data 接收 Excel/CSV，调用 ExchangeItemService 批量导入
   - GET /export — 查询 exchange_items + exchange_item_skus，返回 Excel（复用 console/assets/index.js 中 ExcelJS 模式）
2. 测试：补充 tests/business/admin/market-pages-api.test.js 覆盖 import/export
3. 可复用：console/assets/index.js 已有 ExcelJS 导出模式（GET /assets/export），可直接参照
```

**B2 执行步骤**：
```
1. routes/v4/console/assets/index.js 头部注释添加 "rates - 汇率管理"
2. routes/v4/console/index.js 第12行改为 "market/ 2 文件 C2C市场/C2C订单"
3. routes/v4/backpack/index.js 第11行删除 "exchange 子路由" 描述
```

### 13.2 Web 管理后台前端项目问题（5 项）— ✅ 4/5 已解决

| # | 问题 | 状态 | 解决方式 |
|---|---|---|---|
| F1 | `exchange.js` 缺少 `MISSING_IMAGES` 和 `BATCH_BIND_IMAGES` | ✅ 已补全 | 2026-03-24 添加常量 + API 方法 |
| F2 | `exchange-item/index.js` 的 `ITEM_IMPORT` / `ITEM_EXPORT` | ✅ 前后端对齐 | 后端路由已补全（B1） |
| F3 | 常量 key 命名冗余前缀 | ✅ 已重构 | key 去前缀 + 5 文件域直接导入（决策 3） |
| F4 | `admin/dist/` 构建产物过期 | ✅ 已重建 | 2026-03-24 `npm run build` 通过 |
| F5 | admin/ Prettier 格式化技术债 | ⏳ 待排期 | 与本次改动无关，需单独排期 |

**F1 执行步骤**：
```
1. admin/src/api/market/exchange.js 的 EXCHANGE_ENDPOINTS 添加：
   MISSING_IMAGES: `${API_PREFIX}/console/exchange/missing-images`,
   BATCH_BIND_IMAGES: `${API_PREFIX}/console/exchange/batch-bind-images`,
2. ExchangeAPI 添加：
   getMissingImages: (params) => request({ url: EXCHANGE_ENDPOINTS.MISSING_IMAGES, params }),
   batchBindImages: (data) => request({ url: EXCHANGE_ENDPOINTS.BATCH_BIND_IMAGES, method: 'POST', data }),
3. cd admin && npm run build
```

**F3 执行步骤（若选择修正命名）**：
```
1. exchange.js: EXCHANGE_ORDERS → ORDERS, EXCHANGE_SHIPPING_COMPANIES → SHIPPING_COMPANIES
   （及所有 EXCHANGE_ORDER_* → ORDER_*）
2. 全局搜索替换 admin/src/ 中所有引用
3. market/index.js 的 MARKET_ENDPOINTS spread 合并可能产生 key 冲突 — 需检查
4. cd admin && npm run build
```

### 13.3 微信小程序前端项目问题（3 项）

| # | 问题 | 严重度 | 说明 |
|---|---|---|---|
| M1 | 所有 `/api/v4/market/*` 接口已迁移到 `/api/v4/marketplace/*` | 🔴 高 | 后端 `/api/v4/market/` 已不存在，小程序调用会 404 |
| M2 | `/api/v4/backpack/exchange` 已迁移到 `/api/v4/exchange/` | 🔴 高 | 后端旧路径已删除 |
| M3 | `/api/v4/market/exchange-rates` 已迁移到 `/api/v4/assets/rates` | 🔴 高 | 后端旧路径已删除 |

**M1-M3 执行步骤**：
```
小程序端需要全局替换以下路径：
  /api/v4/market/listings       → /api/v4/marketplace/listings
  /api/v4/market/sell           → /api/v4/marketplace/sell
  /api/v4/market/buy            → /api/v4/marketplace/buy
  /api/v4/market/manage         → /api/v4/marketplace/manage
  /api/v4/market/escrow         → /api/v4/marketplace/escrow
  /api/v4/market/price          → /api/v4/marketplace/price
  /api/v4/market/analytics      → /api/v4/marketplace/analytics
  /api/v4/backpack/exchange     → /api/v4/exchange
  /api/v4/market/exchange-rates → /api/v4/assets/rates
```

### 13.4 文档自身问题（已在本次审计中修正）

| # | 问题 | 修正内容 |
|---|---|---|
| D1 | Phase 3 总览表标注 ⏳ 但后端已完成 | ✅ 已更新为"后端已完成 / 小程序待排期" |
| D2 | §11.7 与 §11.4 矛盾 | ✅ §11.7 已删除（被 §11.4 替代） |
| D3 | 第 549-554 行孤立内容 | ✅ 已清理 |
| D4 | §4.3 估算 ~500 行 vs 实际 683 行 | ✅ 已更新为实际值 |
| D5 | §6.1/§6.2 常量名与实际代码不一致 | ✅ 已重写为实际状态 + 偏差对照表 |
| D6 | §7 遗漏 `getBidTopline` | ✅ 已补全 |
| D7 | 文档引用路径 `admin/src/composables/risk-alerts.js` 不存在 | 实际路径：`admin/src/modules/system/pages/risk-alerts.js` |
| D8 | 文档引用路径 `admin/src/composables/trade-management.js` 不存在 | 实际路径：`admin/src/modules/market/pages/trade-management.js` |

---

## 14. 行业对标分析与决策锁定

### 14.1 前端 API 常量组织模式 — 行业全景对比（含代码验证）

> **代码验证结论（2026-03-23）**：逐文件 grep 5 个 barrel 消费者，**没有一个文件跨域调用**。每个文件只用一个域的端点却导入了全域合并对象 `MARKET_ENDPOINTS`。barrel 合并提供零价值。

| Consumer 文件 | 引用次数 | 全部来自 | 跨域 |
|---|---|---|---|
| `exchange-orders.js` | 9 | EXCHANGE | ❌ |
| `exchange-stats.js` | 2 | EXCHANGE | ❌ |
| `exchange-market.js` | 2 | EXCHANGE | ❌ |
| `exchange-items.js` | 5 | EXCHANGE | ❌ |
| `trade-management.js` | 11 | TRADE | ❌ |

#### 模式 A：域文件直接导入 — 大厂/头部平台标准

| 公司/平台 | 业务类型 | 具体实践 |
|---|---|---|
| **阿里 Ant Design Pro** | 企业级后台框架 | `services/` 一域一文件，按需导入 |
| **闲鱼（Xianyu）** | C2C 二手交易 | "原子化 API" — 最小可组合单元，按域+环境构建子集 |
| **得物（POIZON）** | **B2C+C2C 潮品交易（与本项目业务模型最接近）** | DDD 重构"五彩石项目"：商品中心/订单中心/出价中心/库存中心/寄存中心/超时中心，每个域独立 API 模块 |
| **转转（Zhuanzhuan）** | C2C 二手交易 | 组件化 + 统一 API 字段定义，按域分离 |
| **美团** | 多业务线平台 | 各业务线独立 API 模块 |
| **Feature-Sliced Design** | 前端架构规范 | `shared/api/endpoints/` 一资源一文件，切片专用请求保持局部 |

```javascript
import { EXCHANGE_ENDPOINTS } from '../api/market/exchange.js'
EXCHANGE_ENDPOINTS.ORDERS   // '/api/v4/console/exchange/orders'
```

| 优势 | 劣势 |
|---|---|
| 依赖图清晰（一眼看到用了哪个域） | 跨域页面需要多条 import（本项目实测零跨域） |
| key 简短（域上下文在变量名里） | — |
| 新增端点只改域文件 | — |
| 与后端路由 1:1 对应 | — |

#### 模式 B：Barrel 合并 + 带前缀 key — 中小后台 / 本项目当前方式

| 公司/平台 | 业务类型 | 说明 |
|---|---|---|
| 中小管理后台 | CRUD 面板 | 端点少时简单，多了之后 key 越来越冗长 |
| 早期创业项目 | 未上线产品 | 快速开发方便，随业务增长债务增加 |

```javascript
import { MARKET_ENDPOINTS } from '../api/market/index.js'
MARKET_ENDPOINTS.EXCHANGE_ORDERS  // 冗长
```

| 优势 | 劣势 |
|---|---|
| 只需一条 import | key 冗长（前缀防冲突） |
| 全域端点一处可查 | 依赖图模糊 |
| — | key 冲突风险随端点数线性增长 |

#### 模式 C：嵌套命名空间 — 游戏公司 / 超大 API 面

| 公司/平台 | 业务类型 | 具体实践 |
|---|---|---|
| **Steam Web API** | 游戏虚拟物品交易 | `ISteamEconomy.GetAssetClassInfo`、`IEconService.GetTradeHistory` — 每个 Interface 独立域 |
| **Roblox** | 游戏平台经济系统 | `Economy.GetResaleData`、`Trades.GetHistory`、`Catalog.Search` |
| **Discord** | 社交平台 API Client | `client.guilds.fetch()`、`client.users.fetch()` |
| **PlayFab Economy V2** | 游戏经济后端 | `CatalogAPI.SearchItems()`、`InventoryAPI.GetItems()` |

```javascript
import { API } from '../api'
API.exchange.getOrders()
API.marketplace.getOverview()
```

| 优势 | 劣势 |
|---|---|
| 域隔离天然、无冲突 | 需要自建命名空间构建器 |
| key 最简短 | 全域都加载（无 tree-shake） |
| 超大 API 面时可扩展 | Alpine.js 无自然的 namespace 支持 |

#### 模式 D：纯函数导出，无常量 — 现代 TypeScript SPA

| 公司/平台 | 业务类型 | 具体实践 |
|---|---|---|
| **TanStack Query 生态** | React/Vue 现代项目 | 函数封装端点 + 类型推断 |
| **kurast.trade**（暗黑 2 交易平台） | 游戏物品交易 | Convex 实时层，函数式 API |
| **Nuxt useFetch** | Vue SSR 项目 | composable 内直接写 URL |

```javascript
export const getOrders = (params) => fetch('/api/v4/console/exchange/orders', { params })
```

| 优势 | 劣势 |
|---|---|
| 最简洁 | URL 不可全局审计 |
| TypeScript 下自动补全最好 | **与 Alpine.js + `request()` + `buildURL()` 架构根本不兼容** |

#### 四模式全维度对比（纯长期维护成本视角，不考虑迁移成本）

| 日常操作 | 模式 A（域直接导入） | 模式 B（Barrel 合并） | 模式 C（嵌套命名空间） | 模式 D（纯函数） |
|---|---|---|---|---|
| **后端新增 1 个端点** | 改 1 个域文件 | 改 1 个域文件 + 检查全局冲突 | 改 1 个域文件 + 注册命名空间 | 写 1 个函数 |
| **后端改 1 个 URL** | 改 1 处 | 改 1 处 | 改 1 处 | 改 1 处 |
| **新人看代码理解依赖** | `import { EXCHANGE_ENDPOINTS }` → 明确知道是兑换域 | `import { MARKET_ENDPOINTS }` → 不知道用了哪个域 | `API.exchange.` → 明确 | `import { getOrders }` → 需查函数体 |
| **端点从 60 增长到 200** | 无影响 | key 越来越冗长，冲突概率线性增长 | 无影响 | 无影响 |
| **全局审计"这个 URL 谁在用"** | `grep EXCHANGE_ENDPOINTS.ORDERS` 精准 | `grep MARKET_ENDPOINTS.EXCHANGE_ORDERS` 混杂 | `grep API.exchange.ORDERS` 精准 | 需查每个函数体内部 |
| **长期维护成本评级** | ★ **最低** | ★★★ 中（随端点数增长恶化） | ★★ 低（但有基础设施开销） | ★★ 低（但与本项目不兼容） |

| 适配维度 | 模式 A | 模式 B | 模式 C | 模式 D |
|---|---|---|---|---|
| 与后端路由 1:1 对应 | ✅ 完美 | ❌ 混在一起 | ⚠️ 需手动对齐 | ⚠️ URL 在函数体内 |
| 与 Alpine.js + `request()` 兼容 | ✅ 完美 | ✅ 可用 | ⚠️ 需适配 | ❌ 架构不兼容 |
| 与无 TypeScript 环境兼容 | ✅ | ✅ | ✅ | ⚠️ 失去主要优势 |
| 大厂/同类平台采用率 | ★★★★★ | ★★ | ★★★ | ★★★★ |

### 14.2 本项目适配分析（代码验证 + 行业对标）

**技术约束排除**：
- **模式 D 排除**：本项目用 Alpine.js + `request({ url })` + `buildURL(template, params)`，URL 是字符串常量。模式 D 的函数封装与此架构根本不兼容，且无 TypeScript 则失去核心优势。
- **模式 C 排除**：60 个端点不需要嵌套命名空间；Alpine.js 无自然的 namespace 支持；需要自建构建器，属过度设计。

**模式 A vs B 决定性证据**：

代码验证证明 **5 个消费者文件零跨域调用**。barrel `MARKET_ENDPOINTS` 的"跨域便利"是虚假需求 — 每个文件只用一个域的端点。barrel 的唯一效果是：
1. 迫使所有 key 带冗余前缀（`EXCHANGE_ORDERS` 而非 `ORDERS`）
2. 隐藏了文件的真实域依赖
3. 新增 key 时必须检查全局冲突

**得物（POIZON）经验最相关**：得物与本项目业务模型几乎一致（B2C 官方商城 + C2C 用户交易 + 竞拍），其"五彩石项目"基于 DDD 重构为 6 个核心域（商品中心/订单中心/出价中心/库存中心/寄存中心/超时中心），每个域独立 API 模块。本项目的 6 个域（exchange/marketplace/bids/assets/dashboard/exchange-item）与之完全平行。

**结论：模式 A 是唯一正确选择**，长期维护成本最低，与项目技术栈完美兼容，与同类平台（得物/闲鱼/转转）的行业实践一致。

---

### 14.3 三项决策最终锁定

#### 决策 1 锁定：✅ 补全后端 import/export 路由（方案 A）

**理由**：前端已实现 `importItems()` / `exportItems()`，后端有现成 ExcelJS 模式可复用。补路由比删前端更有业务价值（102 个商品的批量管理需求真实存在）。

**执行步骤**：
```
后端（routes/v4/console/exchange/items.js）：
  1. 新增 POST /import
     - multer 中间件接收 multipart/form-data（Excel/CSV）
     - 调用 ExchangeItemService 批量 upsert
     - 复用 console/assets/index.js 的 ExcelJS 读取模式
     - 返回 { success_count, fail_count, errors[] }
  2. 新增 GET /export
     - 查询 exchange_items + exchange_item_skus + exchange_channel_prices
     - ExcelJS 生成 xlsx（复用 console/assets/index.js 的 workbook 构建模式）
     - 响应 Content-Type: application/vnd.openxmlformats-officedocument.spreadsheetml.sheet
  3. IdempotencyService.js CANONICAL_OPERATION_MAP 新增：
     '/api/v4/console/exchange/items/import': 'ADMIN_EXCHANGE_ITEM_IMPORT'
  4. 补充测试：tests/business/admin/market-pages-api.test.js
```

#### 决策 2 锁定：✅ 补前端常量，暂不做页面（方案 B）

**理由**：后端路由已就绪，先补常量保持前后端端点对齐。页面功能在商品数量增长后自然需要，届时有常量可直接用。

**执行步骤**：
```
前端（admin/src/api/market/exchange.js）：
  1. EXCHANGE_ENDPOINTS 新增：
     MISSING_IMAGES:     `${API_PREFIX}/console/exchange/missing-images`,
     BATCH_BIND_IMAGES:  `${API_PREFIX}/console/exchange/batch-bind-images`,
  2. ExchangeAPI 新增：
     getMissingImages: (params = {}) =>
       request({ url: EXCHANGE_ENDPOINTS.MISSING_IMAGES, params }),
     batchBindImages: (data) =>
       request({ url: EXCHANGE_ENDPOINTS.BATCH_BIND_IMAGES, method: 'POST', data }),
  3. cd admin && npm run build
```

#### 决策 3 锁定：✅ 模式 A — 域直接导入 + key 去前缀（方案 A 强化版）

**理由**：
- 与大厂实践（闲鱼原子化 API、Feature-Sliced Design、Ant Design Pro）一致
- barrel 已 re-export 分域常量，改造仅涉及 5 个 consumer 文件
- key 去前缀后更简洁，域上下文由变量名承载
- 长期维护成本最低：新增端点只改域文件，不碰 barrel，不检查全局冲突

**执行步骤**：
```
Phase A — 域文件 key 去冗余前缀（exchange.js）：
  1. EXCHANGE_ORDERS             → ORDERS
  2. EXCHANGE_ORDER_DETAIL       → ORDER_DETAIL
  3. EXCHANGE_ORDER_APPROVE      → ORDER_APPROVE
  4. EXCHANGE_ORDER_SHIP         → ORDER_SHIP
  5. EXCHANGE_ORDER_REJECT       → ORDER_REJECT
  6. EXCHANGE_ORDER_REFUND       → ORDER_REFUND
  7. EXCHANGE_ORDER_COMPLETE     → ORDER_COMPLETE
  8. EXCHANGE_ITEM_PIN           → ITEM_PIN
  9. EXCHANGE_ITEM_RECOMMEND     → ITEM_RECOMMEND
  10. EXCHANGE_ITEMS_BATCH_SORT   → ITEMS_BATCH_SORT
  11. EXCHANGE_ITEMS_BATCH_STATUS → ITEMS_BATCH_STATUS
  12. EXCHANGE_ITEMS_BATCH_PRICE  → ITEMS_BATCH_PRICE
  13. EXCHANGE_ITEMS_BATCH_CATEGORY → ITEMS_BATCH_CATEGORY
  14. EXCHANGE_SHIPPING_COMPANIES → SHIPPING_COMPANIES
  15. EXCHANGE_ORDER_TRACK       → ORDER_TRACK
  同步更新 ExchangeAPI 中所有内部引用

Phase B — 域文件 key 去冗余前缀（bid.js）：
  1. BID_LIST    → LIST
  2. BID_CREATE  → CREATE
  3. BID_DETAIL  → DETAIL
  4. BID_SETTLE  → SETTLE
  5. BID_CANCEL  → CANCEL
  同步更新 BidAPI

Phase C — 域文件 key 去冗余前缀（exchange-rate.js）：
  1. EXCHANGE_RATE_LIST   → LIST
  2. EXCHANGE_RATE_CREATE → CREATE
  3. EXCHANGE_RATE_UPDATE → UPDATE
  4. EXCHANGE_RATE_STATUS → STATUS
  同步更新 ExchangeRateAPI

Phase D — 5 个 consumer 文件迁移到域直接导入：
  1. exchange-market.js:
     - import { MARKET_ENDPOINTS } → import { EXCHANGE_ENDPOINTS } from '...'
     - MARKET_ENDPOINTS.ITEMS → EXCHANGE_ENDPOINTS.ITEMS（不变）
     - MARKET_ENDPOINTS.EXCHANGE_ORDERS → EXCHANGE_ENDPOINTS.ORDERS
  2. exchange-stats.js:
     - import { MARKET_ENDPOINTS } → import { EXCHANGE_ENDPOINTS } from '...'
     - MARKET_ENDPOINTS.STATS → EXCHANGE_ENDPOINTS.STATS
     - MARKET_ENDPOINTS.EXCHANGE_ORDERS → EXCHANGE_ENDPOINTS.ORDERS
  3. exchange-orders.js:
     - import { MARKET_ENDPOINTS } → import { EXCHANGE_ENDPOINTS } from '...'
     - 替换所有 MARKET_ENDPOINTS.EXCHANGE_* → EXCHANGE_ENDPOINTS.*
  4. trade-management.js:
     - import { MARKET_ENDPOINTS } → import { EXCHANGE_ENDPOINTS, TRADE_ENDPOINTS } from '...'
     - 按实际使用的 key 分配到对应域变量
  5. exchange-items.js:
     - import { MARKET_ENDPOINTS } → import { EXCHANGE_ENDPOINTS } from '...'
  6. risk-alerts.js（已直接用 TRADE_ENDPOINTS，不用改）

Phase E — barrel 保留但标注用途：
  - market/index.js 的 MARKET_ENDPOINTS 保留（兼容 api/index.js 的全局导出）
  - 添加 JSDoc 标注："推荐直接导入域常量，MARKET_ENDPOINTS 仅用于全局审计"

Phase F — 构建验证：
  cd admin && npm run build
```

### 14.4 三决策总工作量

| 决策 | 项目 | 工作量 |
|---|---|---|
| 决策 1 | 后端补 import/export 路由 | ~1 天 |
| 决策 2 | 前端补 2 个常量 + 2 个 API 方法 | ~0.5 天 |
| 决策 3 | 前端 key 去前缀 + 5 文件迁移 | ~1 天 |
| — | **总计** | **~2.5 天** |

---

## 15. 技术栈对齐确认

### 15.1 后端技术栈（权威）

| 维度 | 技术 | 版本/说明 |
|---|---|---|
| 运行时 | Node.js | — |
| 框架 | Express 4 | 路由 + 中间件 |
| ORM | Sequelize 6 | models/ 目录定义，支持 raw SQL |
| 数据库 | MySQL | `restaurant_points_dev`（Sealos 托管） |
| 缓存 | Redis | 会话/限流/缓存 |
| 服务层 | ServiceManager 模式 | `services/` 下按域组织，路由通过 `req.app.locals.services.getService()` 获取 |
| 幂等性 | `IdempotencyService` + `CANONICAL_OPERATION_MAP` | 数据库层唯一约束 |
| 时间 | BeijingTimeHelper | 统一 Asia/Shanghai |
| 导出 | ExcelJS | `console/assets/index.js` 中已有模式 |
| 测试 | Jest + Supertest | `tests/` 目录 |

**可复用基础设施**：
- `ExcelJS` 导出模式（`console/assets/index.js:GET /export`）→ 可直接复用给商品导入/导出
- `BatchOperationService` → 批量操作幂等框架
- `AdminOperationLog` → 审计日志
- `CANONICAL_OPERATION_MAP` → 新路由加入幂等映射

### 15.2 Web 管理后台前端技术栈

| 维度 | 技术 | 说明 |
|---|---|---|
| 构建 | 静态 HTML + JS（无 SPA 框架） | `admin/` 目录 |
| 响应式 | Alpine.js | `admin/src/alpine/` |
| API 调用 | 原生 `fetch` 封装 | `admin/src/api/base.js` 的 `request()` |
| 状态管理 | Alpine stores + composables | `admin/src/modules/` 按模块组织 |
| 端点常量 | 按域拆分 JS 文件 | `admin/src/api/market/`（exchange.js / trade.js / bid.js / exchange-rate.js）通过 `index.js` barrel 聚合为 `MARKET_ENDPOINTS` |
| 构建产物 | `admin/dist/` | 需手动 `npm run build` |

**与后端对齐的关键模式**：
- `API_PREFIX = '/api/v4'` + `${API_PREFIX}/console/...` 构造路径
- `buildURL(template, params)` 处理路径参数替换
- 所有 API 方法通过 `request()` 统一调用，Bearer token 自动注入

### 15.3 当前组织方式评估

当前"一域一文件"组织方式（`exchange.js` / `trade.js` / `bid.js` / `exchange-rate.js`）与后端 `routes/v4/console/` 目录结构一一对应：

| 后端路由目录 | 前端 API 文件 | 对齐度 |
|---|---|---|
| `console/exchange/` | `api/market/exchange.js` | ✅ |
| `console/market/marketplace.js` + `marketplace/orders.js` | `api/market/trade.js` | ✅ |
| `console/bids/` | `api/market/bid.js` | ✅ |
| `console/assets/rates.js` | `api/market/exchange-rate.js` | ✅ |
| `console/dashboard/stats.js` | `api/dashboard.js` | ✅ |
| `console/exchange/items.js` | `api/exchange-item/index.js` | ✅ |

这种"一域一文件"实际上比原设计"全部塞 trade.js"更好维护，与后端 1:1 对应，新人上手更清晰。**决策 3 已锁定为模式 A（域直接导入 + key 去前缀）**，详见 §14.3。
