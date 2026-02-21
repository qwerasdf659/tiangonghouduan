# DataSanitizer 全局主键命名规范化方案

> **项目**: 天工小程序（餐厅积分抽奖系统 V4.0）  
> **创建时间**: 2026-02-20  
> **最后更新**: 2026-02-21（第四轮：决策 C/D/E 已拍板，全部实施完成）  
> **核心问题**: 公开 API 主键字段用泛化 `id` 还是描述性 `{entity}_id`；附带发现 DataSanitizer 字段不匹配 + 4 个方法是死代码 + 3 种数据流模式并存  
> **状态**: ✅ 全部已拍板并实施完成（决策 A/B/C/D/E + 3 项子决策全部确认并落地）

---

## 一、问题定义

### 1.1 现状（2026-02-21 真实数据库验证）

数据库 `restaurant_points_dev`（96 张表）所有主键均遵循 `{entity}_id` 命名，以下为 DataSanitizer 涉及的 13 个实体的验证结果：

| 模式 | 实体 | 数据库主键（DB 验证） | 公开 API 输出 | 管理 API 输出 | 一致性 |
|------|------|-----------|-------------|-------------|--------|
| `{entity}_id` | 弹窗 | `popup_banner_id` | `popup_banner_id` | `popup_banner_id` | ✅ 一致 |
| `{entity}_id` | 轮播图 | `carousel_item_id` | `carousel_item_id` | `carousel_item_id` | ✅ 一致 |
| `{entity}_id` | 公告 | `system_announcement_id` | `announcement_id` | `announcement_id` | ✅ 已修复 |
| **泛化 `id`** | **奖品** | `lottery_prize_id` | **`id`** | `lottery_prize_id` | 🔴 两套 |
| **泛化 `id`** | **库存** | `item_instance_id` | **`id`** | `item_instance_id` | 🔴 两套 |
| **泛化 `id`** | **用户** | `user_id` | **`id`** | `user_id` | 🔴 两套 |
| **泛化 `id`** | **聊天会话** | `customer_service_session_id` | **`id`** | `customer_service_session_id` | 🔴 两套 |
| **泛化 `id`** | **积分记录** | `asset_transaction_id` | **`id`** | `asset_transaction_id` | 🔴 两套 |
| **泛化 `id`** | **交易市场** | `market_listing_id` | **`id`** | `market_listing_id` | 🔴 两套 |
| **泛化 `id`** | **反馈** | `feedback_id` | **`id`** | `feedback_id` | 🔴 两套 |
| **泛化 `id`** | **兑换商品** | `exchange_item_id` | **`id`** | `exchange_item_id` | 🔴 两套 |
| **泛化 `id`** | **兑换订单** | `exchange_record_id` | **`id`** | `exchange_record_id` | 🔴 两套 |
| **泛化 `id`** | **图片（嵌套）** | `image_resource_id` | **`id`** | `image_resource_id` | 🔴 两套 |

**当前状态：3 个实体一致，8 个实体 + 2 处嵌套图片不一致。**

### 1.2 验证过程中发现的 P0 级附带问题

**在逐行比对 DataSanitizer 代码与真实数据库表结构后，发现了一个比主键命名更严重的问题：多个 sanitize 方法使用了数据库中不存在的字段名。**

详见第五节"真实数据库验证"。

---

## 二、行业方案对比

### 2.1 大厂做法：无一例外用 `{entity}_id`

| 公司 | API 示例 | 字段命名 | 嵌套场景处理 |
|------|---------|---------|-------------|
| **阿里（支付宝）** | 交易查询 | `trade_no`、`buyer_id`、`seller_id` | 订单里嵌套买家和卖家，靠前缀区分 |
| **腾讯（微信支付）** | 支付+退款 | `transaction_id`、`refund_id`、`out_trade_no` | 退款响应里同时包含交易 ID 和退款 ID |
| **美团** | 团购+门店 | `deal_id`、`poi_id`、`coupon_id` | 团购详情里嵌套门店 |
| **字节（抖音）** | 视频+用户 | `item_id`、`open_id`、`comment_id` | 评论列表里同时有视频 ID 和评论 ID |
| **Stripe（支付）** | 全场景 | `payment_intent_id`、`customer_id` | 字段名长达 20+ 字符，但完全自文档化 |
| **米哈游** | 原神 200+ 实体 | `character_id`、`weapon_id`、`artifact_id` | snake_case，每个实体独立 ID |

**零例外**：从支付宝到 Steam，从米哈游到 Stripe，没有任何一家公司在公开 API 中使用泛化 `id` 来"保护安全"。

### 2.2 "安全性"论点的行业评估

DataSanitizer 当前用 `id` 的原始理由是"防止抓包分析数据库结构"。逐条评估：

| 论点 | 行业实际 |
|------|---------|
| "用 `id` 防止暴露表结构" | 支付宝、微信支付、Steam 全部用描述性字段名，从未因此产生安全问题。真正的安全靠 JWT + RBAC + Sequelize ORM 参数化查询 + 速率限制，本项目这四项都已具备 |
| "攻击者知道字段名就能攻击" | 知道字段叫 `prize_id` vs `id` 不会帮助攻击者绕过任何安全措施。SQL 注入防御靠 Sequelize 参数化查询（已有），不是字段名混淆 |
| "大厂也这么做" | 没有任何一家大厂这么做。这是 security through obscurity（通过模糊性实现安全），被公认为无效策略 |

---

## 三、本项目嵌套场景的实际痛点

以下是后端 API 中已存在嵌套响应的场景，泛化 `id` 导致歧义：

| 场景 | 泛化 `id` 的问题 | `{entity}_id` 后的结构 |
|------|-----------------|----------------------|
| 交易市场商品详情 | `{ id: 1, seller: { id: 2 } }` — 哪个是商品？哪个是卖家？ | `{ market_listing_id: 1, seller: { user_id: 2 } }` |
| 兑换订单详情 | `{ id: 1, item: { id: 3 } }` — 哪个是订单？哪个是商品？ | `{ exchange_record_id: 1, item: { exchange_item_id: 3 } }` |
| 抽奖结果 | `{ id: 1, prize: { id: 5 } }` — 前端需要记住上下文 | `{ lottery_draw_id: 1, prize: { prize_id: 5 } }` |
| 奖品列表（含图片） | `{ id: 1, image: { id: 8 } }` — 奖品 ID 和图片 ID 混淆 | `{ prize_id: 1, image: { image_resource_id: 8 } }` |

---

## 四、真实技术栈概览（2026-02-21 实际验证）

### 4.1 后端数据库项目

| 层面 | 技术 | 版本 |
|------|------|------|
| 运行时 | Node.js | >= 20.18.0 |
| Web 框架 | Express | 4.18.2 |
| ORM | Sequelize | 6.35.2 |
| 数据库 | MySQL（mysql2） | 3.6.5 |
| 缓存 | Redis（ioredis） | 5.7.0 |
| 实时通信 | Socket.io | 4.8.1 |
| 认证 | JWT（jsonwebtoken） | 9.0.2 |
| API 版本 | V4 | `/api/v4/*` |
| 模型数量 | Sequelize 模型文件 | 96 个 |
| 数据库表数量 | MySQL | 96 张 |

### 4.2 Web 管理后台前端

| 层面 | 技术 | 版本 |
|------|------|------|
| 构建工具 | Vite | 6.4.1 |
| UI 框架 | Alpine.js | 3.15.4 |
| 样式 | Tailwind CSS | 3.4.19 |
| 图表 | ECharts | 6.0.0 |
| WebSocket | socket.io-client | 4.8.3 |
| 架构 | 多页面应用 + EJS 模板 | composables 模块化 |

### 4.3 微信小程序前端

（本项目仓库内无小程序代码，为独立仓库。本文档仅标注小程序需适配的字段变更。）

### 4.4 真实数据库数据量（2026-02-21 第二轮验证）

| 表 | 行数 | 说明 |
|----|------|------|
| `asset_transactions` | 27,723 | 流水最多，48+ 种 business_type |
| `item_instances` | 6,558 | 物品实例，meta JSON 含 name/value/description/rarity |
| `redemption_orders` | 1,272 | 核销订单（UUID 主键，核心业务） |
| `market_listings` | 289 | 交易市场（V4 报价-出价架构） |
| `feedbacks` | 161 | 反馈 |
| `users` | 66 | 用户（有 nickname + avatar_url，无 display_name/username/avatar） |
| `customer_service_sessions` | 21 | 客服会话 |
| `lottery_prizes` | 15 | 奖品配置（28 列） |
| `item_templates` | 13 | 物品模板（关联 item_instances） |
| `popup_banners` | 2 | 弹窗 |
| `system_announcements` | 1 | 公告 |
| `carousel_items` | 1 | 轮播图 |
| `exchange_items` | 0 | 兑换商品（未使用） |
| `exchange_records` | 0 | 兑换订单（未使用） |
| `image_resources` | 0 | 图片资源（未使用） |

### 4.5 asset_transactions.business_type 实际分布（TOP 15）

| business_type | 行数 | 说明 |
|---------------|------|------|
| `lottery_consume` | 5,585 | 抽奖消耗 |
| `test_grant` | 2,501 | 测试发放 |
| `exchange_debit` | 2,479 | 兑换扣款 |
| `lottery_reward` | 2,383 | 抽奖奖励 |
| `order_freeze_buyer` | 2,373 | 订单冻结买方 |
| `test_recharge` | 2,334 | 测试充值 |
| `market_listing_freeze` | 2,147 | 市场挂单冻结 |
| `market_listing_withdraw_unfreeze` | 1,061 | 挂单撤回解冻 |
| `admin_adjustment` | 765 | 管理员调整 |
| `test_mint` | 748 | 测试铸造 |
| `material_convert_credit` | 452 | 材料兑换入账 |
| `material_convert_debit` | 452 | 材料兑换扣款 |
| `order_settle_buyer_debit` | 438 | 订单结算买方扣款 |
| `order_settle_seller_credit` | 438 | 订单结算卖方入账 |
| `merchant_points_reward` | 58 | 商户积分奖励 |

共 48+ 种 business_type，完整清单见数据库查询。**getPublicSource() 现有映射（lottery_win/exchange/transfer/manual/bonus）无一命中实际值。**

---

## 五、真实数据库验证：DataSanitizer 字段不匹配问题（P0）

### 5.0 ⚠️ 第二轮验证新发现：4 个 sanitize 方法是死代码（P0 升级）

**2026-02-21 通过 `grep -r` 全项目搜索，发现以下 4 个方法仅在 DataSanitizer 定义和测试文件中出现，未被任何路由、服务、中间件调用：**

| 方法 | 定义位置 | 路由中被调用 | 服务中被调用 | 实际状态 |
|------|---------|:-----------:|:-----------:|---------|
| `sanitizeMarketProducts()` | L688 | ❌ 未调用 | ❌ 未调用 | **死代码（V3 遗留）** |
| `sanitizePointsRecords()` | L640 | ❌ 未调用 | ❌ 未调用 | **死代码** |
| `sanitizeTransactionRecords()` | L896 | ❌ 未调用 | ❌ 未调用 | **死代码** |
| `sanitizeUser()` | L294 | ❌ 未调用 | ❌ 未调用 | **死代码**（仅测试文件引用） |

**对比：实际在路由中被调用的 sanitize 方法：**

| 方法 | 路由调用位置 | 字段匹配 |
|------|------------|---------|
| `sanitizePrizes()` | `routes/v4/lottery/campaigns.js` L148 | ✅ 匹配（除 `id`） |
| `sanitizeInventory()` | `routes/v4/backpack/index.js` L171（仅单物品详情） | 🔴 严重不匹配 |
| `sanitizeExchangeMarketItems()` | `routes/v4/shop/exchange/items.js` L146, `routes/v4/backpack/exchange.js` L166 | ✅ 匹配 |
| `sanitizeExchangeMarketOrders()` | `routes/v4/shop/exchange/orders.js` L87 | ✅ 匹配 |
| `sanitizeFeedbacks()` | `routes/v4/system/feedback.js` L68/139/240 | ✅ 匹配 |
| `sanitizeLogs()` | `routes/v4/lottery/draw.js` L261（内部脱敏） | N/A |

**另一个重要发现**：`GET /api/v4/backpack`（背包主列表）**不经过 DataSanitizer**，直接返回 BackpackService 输出。只有 `GET /api/v4/backpack/items/:item_instance_id`（单物品详情）调用 `sanitizeInventory()`。

**影响评估**：
- 死代码本身不影响线上功能（因为没有被调用）
- 但如果未来要为小程序提供积分记录、交易市场列表、用户信息等 API 并期望通过 DataSanitizer 脱敏，这些方法必须重写
- 现有的市场列表数据由 `MarketListingQueryService` 直接返回，不经过 DataSanitizer
- 现有的用户信息由 auth 路由直接返回正确字段名（`nickname`、`avatar_url`），不经过 DataSanitizer

**🔴 需要拍板（决策 C）**：对 4 个死代码方法的处理策略，详见第十一节。

### 5.1 问题说明

逐行比对 `services/DataSanitizer.js` 的每个 sanitize 方法输出字段与对应数据库表的实际列名，发现 **4 个方法存在严重的字段不匹配**。这不仅是 `id` 命名的问题，而是 DataSanitizer 输出的字段名在数据库中根本不存在。

**注意：5.3-5.5 的方法均为死代码（5.0 节发现），字段不匹配不影响当前线上功能，但必须在启用前修复。**

### 5.2 `sanitizeInventory()` — 字段严重不匹配

**DataSanitizer 输出的字段 vs 实际 `item_instances` 表（10 列）**：

| DataSanitizer 输出字段 | 数据库实际列名 | 匹配状态 | 数据来源 |
|----------------------|-------------|---------|---------|
| `id` (→ item_instance_id) | `item_instance_id` | 🔴 名称不匹配 | 主键命名问题 |
| `name` | **不存在** | 🔴 幽灵字段 | 来自 `meta` JSON 内的 `name` 键 |
| `description` | **不存在** | 🔴 幽灵字段 | 来自 `meta` JSON 内的 `description` 键 |
| `icon` | **不存在** | 🔴 幽灵字段 | 来源不明，BackpackService 不输出此字段 |
| `type` | `item_type`（列名不同） | 🔴 名称不匹配 | 应为 `item_type` |
| `value` | **不存在** | 🔴 幽灵字段 | 来源不明 |
| `source_type` | `source`（列名不同） | 🔴 名称不匹配 | 数据库列是 `source` |
| `acquired_at` | **不存在** | 🔴 幽灵字段 | BackpackService 用 `created_at` 映射 |
| `expires_at` | **不存在** | 🔴 幽灵字段 | 来自 `meta` JSON |
| `used_at` | **不存在** | 🔴 幽灵字段 | 表中无此列 |
| `verification_code` | **不存在** | 🔴 幽灵字段 | 核销码在 `redemption_orders` 表 |
| `transfer_count` | **不存在** | 🔴 幽灵字段 | 表中无此列 |
| `last_transfer_at` | **不存在** | 🔴 幽灵字段 | 表中无此列 |
| `last_transfer_from` | **不存在** | 🔴 幽灵字段 | 表中无此列 |
| `status` | `status` | ✅ 匹配 | — |
| `created_at` | `created_at` | ✅ 匹配 | — |
| `updated_at` | `updated_at` | ✅ 匹配 | — |

**根因**：`item_instances` 表采用 JSON `meta` 字段存储物品属性（name/description/rarity/expires_at 等），BackpackService._getItems() 从 `meta` 提取字段后传给 DataSanitizer，但 DataSanitizer 还引用了 BackpackService 不输出的字段（icon、value、verification_code、transfer_count 等），这些字段在整个数据流中不存在。

### 5.3 `sanitizeMarketProducts()` — 字段完全不匹配

**DataSanitizer 输出的字段 vs 实际 `market_listings` 表（20 列）**：

| DataSanitizer 输出字段 | 数据库实际列名 | 匹配状态 |
|----------------------|-------------|---------|
| `id` (→ market_listing_id) | `market_listing_id` | 🔴 名称不匹配 |
| `seller_id` | `seller_user_id` | 🔴 名称不匹配 |
| `seller_name` | **不存在** | 🔴 需 JOIN users 表 |
| `name` | `offer_item_display_name` | 🔴 名称不匹配 |
| `description` | **不存在** | 🔴 表中无此列 |
| `image_url` | **不存在** | 🔴 表中无此列 |
| `original_points` | **不存在** | 🔴 表中无此列 |
| `selling_points` | `price_amount` | 🔴 名称不匹配 |
| `condition` | **不存在** | 🔴 表中无此列 |
| `category` | `offer_item_category_code` | 🔴 名称不匹配 |
| `is_available` | **不存在** | 🔴 应通过 `status='on_sale'` 判断 |

**根因**：`market_listings` 表在 V4 重构后采用"报价-出价"（offer/price）架构，但 DataSanitizer 仍使用 V3 时代的电商风格字段名。整个方法需要基于 V4 表结构重写。

### 5.4 `sanitizeUser()` — 两处名称不匹配

| DataSanitizer 输出字段 | 数据库实际列名 | 匹配状态 |
|----------------------|-------------|---------|
| `id` (→ user_id) | `user_id` | 🔴 名称不匹配 |
| `display_name` | `nickname` | 🔴 名称不匹配 |
| `avatar` | `avatar_url` | 🔴 名称不匹配 |

### 5.5 `sanitizePointsRecords()` / `sanitizeTransactionRecords()` — 字段完全不匹配

**DataSanitizer 输出的字段 vs 实际 `asset_transactions` 表（13 列）**：

| DataSanitizer 输出字段 | 数据库实际列名 | 匹配状态 |
|----------------------|-------------|---------|
| `id` (→ asset_transaction_id) | `asset_transaction_id` | 🔴 名称不匹配 |
| `type` | `business_type` | 🔴 名称不匹配 |
| `points` / `amount` | `delta_amount` | 🔴 名称不匹配 |
| `source` | **不存在** | 🔴 表中无此列 |
| `description` | **不存在** | 🔴 表中无此列 |
| `user_id` | **不存在（通过 account_id 关联）** | 🔴 间接关联 |
| `balance_after` | `balance_after` | ✅ 匹配 |
| `created_at` | `created_at` | ✅ 匹配 |

**根因**：`asset_transactions` 表采用 V4 账本架构（account_id + asset_code + delta_amount），但 DataSanitizer 仍使用 V3 时代的"积分记录"字段名。

### 5.6 无问题的方法

以下方法的字段与数据库匹配正确（除 `id` 命名外）：

| 方法 | 对应表 | 字段匹配 |
|------|-------|---------|
| `sanitizePrizes()` | `lottery_prizes` | ✅ 全部匹配 |
| `sanitizeAnnouncements()` | `system_announcements` | ✅ 全部匹配 |
| `sanitizeFeedbacks()` | `feedbacks` | ✅ 全部匹配 |
| `sanitizeChatSessions()` | `customer_service_sessions` | ✅ 基本匹配 |
| `sanitizeExchangeMarketItems()` | `exchange_items` | ✅ 全部匹配 |
| `sanitizeExchangeMarketOrders()` | `exchange_records` | ✅ 全部匹配 |

---

## 六、问题归属分析

### 6.1 后端数据库项目的问题

| 编号 | 问题 | 严重级别 | 涉及文件 | 说明 |
|------|------|---------|---------|------|
| B1 | DataSanitizer 中实际被路由调用的 4 个方法（sanitizePrizes/Inventory/ExchangeItems/Feedbacks）用泛化 `id` | P1 | `services/DataSanitizer.js` | 本文档核心议题 |
| B2 | `sanitizeInventory()` 引用 12 个数据库中不存在的字段（且 BackpackService 不输出） | P0 | `services/DataSanitizer.js` L219-258 | 实际被 `backpack/index.js` L171 调用 |
| B3 | `sanitizeMarketProducts()` 字段完全不匹配 V4 表结构 | P1→P2 | `services/DataSanitizer.js` L688-712 | **死代码，未被任何路由调用**；市场数据由 QueryService 直接返回 |
| B4 | `sanitizeUser()` 用 `display_name` / `avatar` 而非数据库的 `nickname` / `avatar_url` | P1→P2 | `services/DataSanitizer.js` L294-328 | **死代码，未被任何路由调用**；auth 路由已直接使用正确字段名 |
| B5 | `sanitizePointsRecords()` 和 `sanitizeTransactionRecords()` 字段不匹配 V4 账本架构 | P0→P2 | `services/DataSanitizer.js` L640-912 | **死代码，未被任何路由调用** |
| B6 | `getPublicSource()` 映射表与实际 `business_type` 值完全不匹配 | P1 | `services/DataSanitizer.js` L1231-1240 | 映射 5 个旧值（lottery_win 等），实际 DB 有 48+ 种 business_type（lottery_consume 等），**零命中** |
| B7 | DataSanitizer 头部注释 "安全优先使用通用 id" 描述过时 | P2 | `services/DataSanitizer.js` L56-67 | 误导后续开发者 |
| B8 | `sanitizeExchangeMarketOrders()` JSDoc 注释写 "主键：record_id" 但实际是 `exchange_record_id` | P2 | `services/DataSanitizer.js` L1414 | 注释错误 |
| B9 | `GET /api/v4/backpack`（背包主列表）不经过 DataSanitizer，单物品详情经过，脱敏逻辑不一致 | P1 | `routes/v4/backpack/index.js` | 同一实体两个接口脱敏规则不一致 |
| B10 | `utils/DataSanitizer.js` 和 `services/DataSanitizer.js` 两个同名文件并存 | P2 | 两个文件 | `utils/` 版本仅含公告和用户脱敏，`services/` 版本是主力，易混淆 |

### 6.2 Web 管理后台前端项目的问题

| 编号 | 问题 | 严重级别 | 涉及文件 | 说明 |
|------|------|---------|---------|------|
| W1 | `order.redemption_order_id \|\| order.order_id` fallback | P2 | `admin/src/modules/operations/pages/redemption-management.js` L204/251/295 | 3 处 |
| W2 | `feedback.feedback_id \|\| feedback.id` fallback | P2 | `admin/src/modules/content/composables/feedback.js` L178/213/260/417/434 | 5 处 |
| W3 | `item.audit_id \|\| item.id` fallback | P2 | `admin/src/modules/analytics/composables/merchant-points.js` L142/167/194/223 | 4 处 |
| W4 | `staff.store_staff_id \|\| staff.id` fallback | P2 | `admin/src/modules/store/composables/staff.js` L85 | 1 处 |
| W5 | `h.lottery_simulation_record_id \|\| h.id` fallback | P2 | `admin/src/modules/lottery/composables/strategy-simulation.js` L616 | 1 处 |

**整体评估**：Web 管理后台（Alpine.js + Vite 多页面应用）已主要使用 `{entity}_id` 命名，且使用 `dataLevel='full'` 跳过 DataSanitizer，因此 **本次主键命名修改对管理后台影响极小**。仅需清理上述 14 处 fallback 模式。管理后台的 composables 模块化架构使得修改范围可精确控制到单个 composable 文件。

### 6.3 微信小程序前端项目的问题

| 编号 | 问题 | 严重级别 | 说明 |
|------|------|---------|------|
| M1 | 所有引用 `response.id` 的地方需改为 `response.{entity}_id` | P1 | 8 个功能模块受影响 |
| M2 | 需适配后端字段重命名（如 `display_name` → `nickname`） | P1 | 配合 B4 修复 |
| M3 | 需适配 `sanitizeInventory` 输出结构变更 | P1 | 配合 B2 修复 |
| M4 | 需适配 `sanitizeMarketProducts` 输出结构变更 | P1 | 配合 B3 修复 |
| M5 | 需适配积分记录/交易记录输出结构变更 | P1 | 配合 B5 修复 |

---

## 七、推荐方案

### 7.1 核心原则

1. **数据库列名是唯一真相源** — DataSanitizer 输出字段名直接使用数据库列名（或去掉表级命名空间前缀）
2. **前端适配后端** — 不做映射层，前端直接使用后端字段名
3. **不兼容旧接口** — 项目未上线，一次性统一
4. **与 DataSanitizer 架构原则对齐** — 代码头部注释已声明"禁止字段兼容逻辑""唯一真相源原则""快速失败原则"

### 7.2 主键命名统一映射表（✅ 决策 A 已拍板：选项 A1 — 全部统一为 `{entity}_id`）

**API 输出字段名规则**：
- 默认使用数据库列名原样输出
- 唯一例外：数据库列名含表级命名空间前缀（如 `system_`、`lottery_`、`customer_service_`）时，剥离该前缀

| DataSanitizer 方法 | 数据库主键列名 | 当前 API 输出 | 修改后 API 输出 | 命名理由 |
|-------------------|-------------|-------------|----------------|---------|
| `sanitizePrizes()` | `lottery_prize_id` | `id` | `prize_id` | 剥离 `lottery_` 模块前缀 |
| `sanitizeInventory()` | `item_instance_id` | `id` | `item_instance_id` | 原样输出 |
| `sanitizeUser()` | `user_id` | `id` | `user_id` | 原样输出 |
| `sanitizeChatSessions()` | `customer_service_session_id` | `id` | `session_id` | 剥离 `customer_service_` 模块前缀 |
| `sanitizeAnnouncements()` | `system_announcement_id` | `announcement_id` | `announcement_id` | 已完成（剥离 `system_`） |
| `sanitizePointsRecords()` | `asset_transaction_id` | `id` | `transaction_id` | 剥离 `asset_` 模块前缀 |
| `sanitizeMarketProducts()` | `market_listing_id` | `id` | `listing_id` | 剥离 `market_` 模块前缀 |
| `sanitizeFeedbacks()` | `feedback_id` | `id` | `feedback_id` | 原样输出 |
| `sanitizeTransactionRecords()` | `asset_transaction_id` | `id` | `transaction_id` | 同 `sanitizePointsRecords` |
| `sanitizeExchangeMarketItems()` | `exchange_item_id` | `id` | `exchange_item_id` | 原样输出 |
| `sanitizeExchangeMarketOrders()` | `exchange_record_id` | `id` | `exchange_record_id` | 原样输出 |

**嵌套图片对象**：

| 位置 | 当前 | 修改后 |
|------|------|--------|
| `sanitizePrizes()` 图片子对象 | `id` | `image_resource_id` |
| `sanitizeExchangeMarketItems()` 图片子对象 | `id` | `image_resource_id` |

### 7.3 字段不匹配修复策略（✅ 决策 B 已拍板：选项 B1 — 一并修复，策略 β）

对于第五节发现的 P0 级字段不匹配问题，**已确认采用策略 β：主键命名 + 字段不匹配一并修复**。

- 主键命名 + 字段不匹配一起改
- 把 `sanitizeInventory`、`sanitizeMarketProducts`、`sanitizePointsRecords`、`sanitizeTransactionRecords`、`sanitizeUser` 的输出字段全部对齐数据库实际列名
- 一次到位，前端只需适配一次
- 后端改动从 11 处扩展到约 30-40 处，预估 2-3 小时

---

## 八、实施方案

### 8.1 后端修改（归属：后端数据库项目）

#### 阶段 A：修改实际被调用的 sanitize 方法（P0/P1，阻塞小程序）

**涉及文件**：`services/DataSanitizer.js`

##### A1. 修改主键输出（6 个活跃方法 + 2 处图片子对象）

仅修改实际在路由中被调用的方法：

| 方法 | 调用位置 | 当前行 | 修改内容 |
|------|---------|-------|---------|
| `sanitizePrizes()` | `lottery/campaigns.js` L148 | L150 | `id: prize.lottery_prize_id` → `prize_id: prize.lottery_prize_id` |
| `sanitizeInventory()` | `backpack/index.js` L171 | L227 | `id: item.item_instance_id` → `item_instance_id: item.item_instance_id` |
| `sanitizeChatSessions()` | （需确认是否有调用方） | L528 | `id: sessionData.customer_service_session_id` → `session_id: sessionData.customer_service_session_id` |
| `sanitizeFeedbacks()` | `system/feedback.js` L68/139/240 | L839 | `id: feedback.feedback_id` → `feedback_id: feedback.feedback_id` |
| `sanitizeExchangeMarketItems()` | `shop/exchange/items.js` L146 | L1356 | `id: item.exchange_item_id` → `exchange_item_id: item.exchange_item_id` |
| `sanitizeExchangeMarketOrders()` | `shop/exchange/orders.js` L87 | L1435 | `id: order.exchange_record_id` → `exchange_record_id: order.exchange_record_id` |
| 图片子对象（奖品） | — | L131, L139 | `id: safeImage.image_resource_id` → `image_resource_id: safeImage.image_resource_id` |
| 图片子对象（兑换商品） | — | L1337, L1347 | `id: safeImage.image_resource_id` → `image_resource_id: safeImage.image_resource_id` |

##### A2. 修复 `sanitizeInventory()` 字段名对齐 BackpackService 输出

此方法是唯一一个 **既被路由调用、字段又严重不匹配** 的方法。

**BackpackService._getItems() 实际输出字段**（通过代码逐行验证）：

| 字段 | 来源 | DataSanitizer 当前引用 | 匹配 |
|------|------|----------------------|------|
| `item_instance_id` | `item_instances.item_instance_id` | `item.item_instance_id` → 映射为 `id` | 🔴 需改主键名 |
| `item_type` | `item_instances.item_type` | `item.type`（字段名不同） | 🔴 需改为 `item_type` |
| `name` | `meta.name`（JSON 提取） | `item.name` | ✅ 匹配 |
| `description` | `meta.description`（JSON 提取） | `item.description` | ✅ 匹配 |
| `rarity` | `meta.rarity`（JSON 提取） | 未引用 | 🟡 应新增 |
| `status` | `item_instances.status` | `item.status` | ✅ 匹配 |
| `has_redemption_code` | 查询 `redemption_orders` 表 | 未引用 | 🟡 应新增 |
| `acquired_at` | `item_instances.created_at` 映射 | `item.acquired_at` | ✅ 匹配 |
| `expires_at` | `meta.expires_at`（JSON 提取） | `item.expires_at` | ✅ 匹配 |
| `allowed_actions` | `system_configs` 缓存 | 未引用 | 🟡 应新增 |
| `status_display_name` | `attachDisplayNames()` | 未引用 | 🟡 应透传 |
| `item_type_display_name` | `attachDisplayNames()` | 未引用 | 🟡 应透传 |
| `rarity_display_name` | `attachDisplayNames()` | 未引用 | 🟡 应透传 |

**需要从 sanitizeInventory() 中删除的幽灵字段**（BackpackService 不输出，DB 中不存在）：

`icon`、`value`、`source_type`、`used_at`、`verification_code`、`transfer_count`、`last_transfer_at`、`last_transfer_from`

##### A3. 更新 DataSanitizer 头部注释

删除 L56-67 "安全优先使用通用 id" 的过时描述，改为"使用描述性 `{entity}_id`，与行业标准对齐"。

##### A4. 修复 JSDoc 注释错误

`sanitizeExchangeMarketOrders()` 方法的 JSDoc 注释（L1414）写 "主键：record_id"，应更正为 "主键：exchange_record_id"。

#### 阶段 B：处理 4 个死代码方法（🔴 需决策 C 拍板）

根据决策 C 的结果，对 `sanitizeUser()`、`sanitizeMarketProducts()`、`sanitizePointsRecords()`、`sanitizeTransactionRecords()` 执行以下之一：

**选项 C1（推荐：重写并接入路由）**：

##### B1. 重写 `sanitizeUser()` 并在用户信息路由中接入

| 当前字段 | 修改为 | 理由 |
|---------|--------|------|
| `id: user.user_id` | `user_id: user.user_id` | 主键规范化 |
| `display_name: user.display_name \|\| user.username` | `nickname: user.nickname` | DB 实际列名是 `nickname`，无 `display_name`/`username` 列 |
| `avatar: user.avatar` | `avatar_url: user.avatar_url` | DB 实际列名是 `avatar_url` |

##### B2. 重写 `sanitizeMarketProducts()` 基于 V4 表结构

此方法是 V3 遗留代码。`MarketListingQueryService` 已直接返回 V4 格式数据给路由，如需统一走 DataSanitizer 脱敏，需基于 V4 `market_listings` 表结构重写。

核心字段映射（V3 → V4）：

| 当前输出字段（V3） | 应改为（V4） | 数据库来源 |
|------------------|------------|-----------|
| `id` | `listing_id` | `market_listings.market_listing_id`（剥离 `market_` 前缀） |
| `seller_id` | `seller_user_id` | `market_listings.seller_user_id` |
| `seller_name` | `seller_nickname`（脱敏） | JOIN `users.nickname`，经 `maskUserName()` 脱敏 |
| `name` | `offer_item_display_name` | `market_listings.offer_item_display_name` |
| `selling_points` | `price_amount` | `market_listings.price_amount` |
| `condition` | 删除 | 表中无此列 |
| `category` | `offer_item_category_code` | `market_listings.offer_item_category_code` |
| `is_available` | 删除，用 `status` 代替 | `status='on_sale'` 即可用 |
| — | 新增 `listing_kind` | `market_listings.listing_kind` |
| — | 新增 `price_asset_code` | `market_listings.price_asset_code` |

项目已有 `MarketListing.belongsTo(User, { as: 'seller' })` 关联和 `maskUserName()` 脱敏方法，零额外建模成本。

##### B3. 重写 `sanitizePointsRecords()` / `sanitizeTransactionRecords()` + `getPublicSource()`

需要基于 V4 `asset_transactions` 表结构重写，并修复 `getPublicSource()` 映射表：

| 当前输出字段 | 应改为 | 数据库来源 |
|------------|--------|-----------|
| `id` | `transaction_id` | `asset_transactions.asset_transaction_id`（剥离 `asset_` 前缀） |
| `type` | `business_type` | `asset_transactions.business_type` |
| `points` / `amount` | `delta_amount` | `asset_transactions.delta_amount` |
| `source` | `business_type_display`（中文） | 后端 `getPublicSource()` 映射 `business_type` |
| `description` | 删除（如 `meta` JSON 有则从中获取） | 表中无 `description` 列 |
| `user_id` | 删除（调用方已知用户上下文） | 间接关联，公开 API 不需要 |
| — | 新增 `asset_code` | `asset_transactions.asset_code` |
| — | 新增 `balance_before` | `asset_transactions.balance_before` |

`getPublicSource()` 映射表需重写，覆盖实际 48+ 种 business_type（至少覆盖用户可见的非测试类型）：

| 实际 business_type | 建议中文映射 |
|-------------------|------------|
| `lottery_consume` | 抽奖消耗 |
| `lottery_reward` | 抽奖奖励 |
| `exchange_debit` | 兑换扣款 |
| `market_listing_freeze` | 市场挂单冻结 |
| `market_listing_withdraw_unfreeze` | 挂单撤回 |
| `order_freeze_buyer` | 订单冻结 |
| `order_settle_buyer_debit` | 订单结算 |
| `order_settle_seller_credit` | 卖出收入 |
| `admin_adjustment` | 系统调整 |
| `merchant_points_reward` | 消费奖励 |
| `material_convert_credit` | 材料兑换 |
| `consumption_reward` | 消费奖励 |
| `premium_unlock` | 解锁空间 |
| 其他（含 test_ 前缀） | 系统操作 |

两个方法保持各自方法名不变，内部提取公共的 `_sanitizeAssetTransactions()` 私有方法，两个公开方法委托调用。

**选项 C2（删除死代码）**：直接删除 4 个方法和相关测试，未来需要时从零基于 V4 表结构编写。

##### B4. 合并 `utils/DataSanitizer.js` 到 `services/DataSanitizer.js`

`utils/DataSanitizer.js` 仅含 `sanitizeAnnouncements()` 和 `sanitizeUser()` 两个方法，功能被 `services/DataSanitizer.js` 完全覆盖。删除 `utils/` 版本，消除混淆。

#### 阶段 C：可选优化

##### C1. 背包主列表接入 DataSanitizer

`GET /api/v4/backpack` 当前不经过 DataSanitizer，直接返回 BackpackService 输出。可选：在路由层调用 `sanitizeInventory()` 使脱敏逻辑一致，或确认 BackpackService 输出已足够安全（meta JSON 中的 name/description 是面向用户的信息）。

### 8.2 Web 管理后台前端修改（归属：Web 管理后台项目）

管理后台使用 `dataLevel='full'`（跳过 DataSanitizer），**本次主键命名修改不影响管理后台**。

清理 14 处 fallback 模式，每处改为只使用后端的 `{entity}_id` 字段名：

| 文件 | 行号 | 当前代码 | 修改为 |
|------|------|---------|--------|
| `admin/src/modules/operations/pages/redemption-management.js` | L204, L251, L295 | `order.redemption_order_id \|\| order.order_id` | `order.redemption_order_id` |
| `admin/src/modules/content/composables/feedback.js` | L178, L213, L260, L417, L434 | `feedback.feedback_id \|\| feedback.id` | `feedback.feedback_id` |
| `admin/src/modules/analytics/composables/merchant-points.js` | L142, L167, L194, L223 | `item.audit_id \|\| item.id` | `item.audit_id` |
| `admin/src/modules/store/composables/staff.js` | L85 | `staff.store_staff_id \|\| staff.id` | `staff.store_staff_id` |
| `admin/src/modules/lottery/composables/strategy-simulation.js` | L616 | `h.lottery_simulation_record_id \|\| h.id` | `h.lottery_simulation_record_id` |

**技术框架兼容性**：Alpine.js composables 模块化架构，每个 composable 文件独立，修改不会跨模块影响。Vite 热更新即时生效，无需全量构建。

### 8.3 微信小程序前端修改（归属：小程序项目）

小程序使用公开 API（经 DataSanitizer 脱敏），需全局搜索 `.id` 并适配：

| 功能模块 | 当前前端引用 | 修改后引用 | 触发条件 |
|---------|------------|-----------|---------|
| 抽奖页面 | `prize.id` | `prize.prize_id` | 阶段 A 完成后 |
| 库存/背包详情 | `item.id` | `item.item_instance_id` | 阶段 A 完成后 |
| 客服会话 | `session.id` | `session.session_id` | 阶段 A 完成后（需确认路由是否调用） |
| 反馈系统 | `feedback.id` | `feedback.feedback_id` | 阶段 A 完成后 |
| 兑换商城 | `item.id` | `item.exchange_item_id` | 阶段 A 完成后 |
| 兑换订单 | `order.id` | `order.exchange_record_id` | 阶段 A 完成后 |
| 用户信息 | `user.display_name` / `user.avatar` | `user.nickname` / `user.avatar_url` | 阶段 B 完成后（如选 C1） |
| 积分记录 | `record.type` / `record.points` | `record.business_type` / `record.delta_amount` | 阶段 B 完成后（如选 C1） |
| 交易市场 | `listing.name` / `listing.selling_points` | `listing.offer_item_display_name` / `listing.price_amount` | 阶段 B 完成后（如选 C1） |

**注意**：阶段 B 相关的小程序修改取决于决策 C 的结果。如果选 C2（删除死代码），则小程序继续使用现有路由返回的字段名（auth 路由已用 `nickname`/`avatar_url`，market 路由已用 V4 字段名），无需额外适配。

### 8.4 实施顺序

| 步骤 | 内容 | 归属 | 预估工时 | 阻塞关系 |
|------|------|------|---------|---------|
| 1 | 阶段 A1-A4：活跃方法主键命名 + 字段修复 + 注释 | 后端 | 1-1.5 小时 | 阻塞小程序阶段 A 适配 |
| 2 | 阶段 B（取决于决策 C）：死代码处理 | 后端 | C1: 2-3 小时 / C2: 30 分钟 | 阻塞小程序阶段 B 适配 |
| 3 | 合并 `utils/DataSanitizer.js` | 后端 | 15 分钟 | 不阻塞 |
| 4 | Web 管理后台 fallback 清理 | Web 前端 | 30 分钟 | 不阻塞（可并行） |
| 5 | 小程序适配阶段 A 字段变更 | 小程序前端 | 取决于小程序代码量 | 依赖步骤 1 |
| 6 | 小程序适配阶段 B 字段变更（如选 C1） | 小程序前端 | 取决于小程序代码量 | 依赖步骤 2 |
| 7 | 联调验证 | 后端 + 小程序 | 1-2 小时 | 依赖步骤 1-6 |

**总后端工时**：
- 决策 C1（重写并接入）：3.5-5 小时
- 决策 C2（删除死代码）：1.5-2 小时

---

## 九、技术栈兼容性分析

### 9.1 后端可复用能力

| 已有能力 | 在本方案中的作用 | 复用方式 |
|---------|---------------|---------|
| DataSanitizer 双层架构（full/public） | 修改只涉及 public 层的字段名输出，full 层完全不受影响 | 直接复用，修改 public 分支即可 |
| Sequelize 模型定义（96 个模型） | 所有模型已正确定义 `{entity}_id` 主键名，是字段名的唯一权威来源 | 直接引用模型定义作为字段名标准 |
| BackpackService 数据预处理 | 已实现 `meta` JSON → 结构化字段的提取逻辑（name/rarity/description/expires_at） | 复用现有提取逻辑，DataSanitizer 基于其输出做脱敏 |
| `attachDisplayNames()` 工具 | 已实现 status/item_type/rarity 的中文显示名映射 | 可复用模式用于 `business_type_display` |
| MarketListingQueryService | 已实现 V4 市场数据查询，含 `include seller` 关联 | 如重写 `sanitizeMarketProducts()`，数据源已就绪 |
| `maskUserName()` 脱敏方法 | 已实现用户名脱敏（保留首尾字符，中间用 `*` 替代） | 直接用于 `seller_nickname` 脱敏 |
| ServiceManager 服务注册 | DataSanitizer 通过 `req.app.locals.services.getService('data_sanitizer')` 注入路由层 | 不变 |
| Express 中间件链 | `req.dataLevel` 由认证中间件设置（full/public） | 不变 |
| `FORBIDDEN_FRONTEND_ASSET_CODES` 过滤 | 已实现 `BUDGET_POINTS` 等敏感资产自动过滤 | 不变，`filterForbiddenAssets()` 继续使用 |

### 9.2 后端可扩展能力

| 扩展方向 | 现有基础 | 扩展说明 |
|---------|---------|---------|
| 新增实体的 sanitize 方法 | 已有 21 个方法的标准模式 | 新方法直接使用 `{entity}_id` 命名，无需再做 `id` 映射 |
| 嵌套对象脱敏 | `sanitizePrizes` 已实现图片子对象脱敏 | 统一命名后，嵌套场景天然无歧义 |
| 字段级权限控制 | full/public 二级机制 | 可扩展为 full/internal/public 三级 |
| `business_type_display` 映射模式 | `getPublicSource()` 方法已有框架 | 重写映射表后可作为所有枚举类字段的中文映射模式 |
| `item_templates` 关联查询 | BackpackService 已通过 `item_template_id` 关联 | 未来可在 DataSanitizer 中透传 template 信息（display_name、image_url 等） |

### 9.3 Web 管理后台兼容性

| 维度 | 分析 |
|------|------|
| **技术框架** | Alpine.js 3.15.4 + Vite 6.4.1 多页面应用，每个模块独立 composable，修改范围可精确控制到单个 composable 文件 |
| **影响范围** | 管理后台使用 `dataLevel='full'` 跳过 DataSanitizer，**主键命名修改零影响** |
| **现有字段使用** | 已使用 `{entity}_id` 模式（`announcement_id`、`user_id`、`store_id`、`campaign_id` 等），与目标状态一致 |
| **可选清理** | 14 处 fallback 模式（5 个文件），修改后可删除防御性 `\|\|` 分支 |
| **构建影响** | Vite 热更新即时生效，Tailwind CSS 3.4.19 按需编译，无全量构建成本 |
| **EJS 模板** | 管理后台 HTML 页面中无 `.id` 引用（数据通过 Alpine.js composable 渲染） |
| **WebSocket** | socket.io-client 4.8.3 事件中的数据不受 DataSanitizer 影响（走 `sanitizeWebSocketMessage`，无主键问题） |

### 9.4 前后端对齐成本评估

| 项目 | 当前状态 | 修改成本 | 长期收益 |
|------|---------|---------|---------|
| 后端阶段 A（活跃方法） | 6 个方法用 `id`，1 个方法字段不匹配 | 1-1.5h | 消除活跃接口的双套命名和幽灵字段 |
| 后端阶段 B（死代码） | 4 个方法是死代码，字段全面不匹配 | C1: 2-3h / C2: 30min | C1: 为未来接入打基础 / C2: 减少代码量 |
| Web 管理后台 | 已基本对齐 `{entity}_id`，14 处 fallback | 30min | 删除防御性代码 |
| 微信小程序 | 使用 DataSanitizer 输出 | 取决于小程序规模 | 字段名自文档化，多端一致 |

---

## 十、行业数据脱敏架构对比与决策依据

### 10.1 本项目当前的 3 种数据流模式（真实代码验证）

在决策 C/D/E 之前，需先理解本项目已存在的 3 种不一致的数据流模式：

| 模式 | 数据流 | 使用场景 | 示例路由 |
|------|-------|---------|---------|
| **模式 A：Service → DataSanitizer → 响应** | Service 返回原始/半加工数据，DataSanitizer 做最终脱敏 | 抽奖奖品、兑换商品/订单、背包详情、反馈 | `lottery/campaigns.js`、`shop/exchange/items.js` |
| **模式 B：Service 转换 → 直接响应** | Service 内部完成全部数据转换（include、字段重组），路由直接返回 | 交易市场列表 | `market/listings.js`（`MarketListingQueryService` 内部转换） |
| **模式 C：手工选字段 → 直接响应** | 路由层手动 pick 字段，不经过任何转换层 | 用户登录/Token | `auth/login.js` L259-274 手动构造 `{user_id, nickname, ...}` |

**这 3 种模式并存是当前技术债务的根源**——新开发者不知道该用哪种，导致代码风格分裂。

### 10.2 行业方案对比：大厂、游戏公司、交易平台、小公司

#### 方案 α：VO 统一转换层（阿里/蚂蚁集团/Stripe）

```
DB Model → Service（业务逻辑）→ VO 转换器（统一脱敏+格式化）→ API 响应
```

| 维度 | 说明 |
|------|------|
| **代表** | 阿里（Domain→DTO→VO 三层）、蚂蚁金服支付宝开放平台、Stripe（API Resource 模式） |
| **原理** | 所有 API 响应都经过统一的 VO（View Object）转换层，Service 只返回领域对象 |
| **Java 生态工具** | MapStruct 自动生成 DTO↔VO 映射；Spring ResponseBodyAdvice 统一拦截 |
| **Node.js 等价** | 本项目的 DataSanitizer 就是 VO 层，但目前只覆盖了部分路由 |
| **优势** | 一致性强、安全审计只看一个文件、新增实体有标准模式 |
| **劣势** | VO 层与 DB schema 紧耦合（本项目 ghost fields 的根因）、Service 已做过转换时产生重复逻辑 |
| **适合** | 有类型系统（TypeScript/Java）的大型项目、对安全合规要求高的金融项目 |

#### 方案 β：Service 层转换（米哈游/美团/大部分游戏公司）

```
DB Model → Service（业务逻辑 + 数据转换）→ API 响应
```

| 维度 | 说明 |
|------|------|
| **代表** | 米哈游原神（DataBridge 模式）、美团（各业务线独立 Converter）、暴雪战网 |
| **原理** | 每个 Service 既做业务逻辑又做数据格式化，返回的就是最终响应格式。没有独立的 VO 层 |
| **游戏行业特点** | 游戏状态 → ViewModel → 客户端，ViewModel 是 Service 的一部分 |
| **Node.js 等价** | 本项目的 `BackpackService._getItems()`（meta 提取 + displayName 附加）和 `MarketListingQueryService`（include + 重组）就是此模式 |
| **优势** | 领域逻辑集中、无 VO 层与 DB 的耦合问题、Service 即文档 |
| **劣势** | 脱敏逻辑分散在各 Service 中，安全审计困难、格式不易统一 |
| **适合** | 业务复杂、实体间转换逻辑差异大的项目（如游戏虚拟物品、交易市场） |

#### 方案 γ：混合模式——Service 转换 + 安全过滤层（Steam/BUFF/闲鱼）

```
DB Model → Service（业务逻辑 + 领域转换）→ 安全过滤层（脱敏+权限）→ API 响应
```

| 维度 | 说明 |
|------|------|
| **代表** | Steam 市场（ResponseFormatter + PrivacyFilter）、网易 BUFF（DTO + 隐私脱敏）、闲鱼（标准 VO + 卖家信息脱敏）、腾讯微信开放平台（响应中间件管道） |
| **原理** | Service 负责领域级转换（meta 提取、关联查询、字段重组），安全过滤层只负责：①敏感字段删除 ②PII 脱敏 ③权限级别过滤。**安全层不做字段重命名** |
| **Steam 市场** | ItemService 返回完整商品数据（含卖家 nickname、价格、磨损度），ResponseFormatter 删除内部标识（internal_id、cost_basis），PrivacyFilter 脱敏卖家全名 |
| **BUFF（网易）** | 商品 Service 返回 V2 格式数据，DTO 层统一主键命名（`goods_id`），隐私层脱敏卖家手机号和真实姓名 |
| **闲鱼** | 使用阿里标准 VO 层，但卖家信息额外经过隐私脱敏（头像模糊、昵称截断） |
| **优势** | **职责清晰**（Service 管"返回什么字段"，安全层管"隐藏什么字段"）；不会出现 ghost fields；安全审计只看安全层 |
| **劣势** | 需要明确划定 Service 和安全层的边界 |
| **适合** | 有虚拟物品交易、多角色权限（用户/商家/管理员）、需要 PII 脱敏的项目 |

#### 方案 δ：无转换层/直出（小公司 MVP 阶段）

```
DB Model（Sequelize 实例）→ toJSON() → API 响应
```

| 维度 | 说明 |
|------|------|
| **代表** | 大多数种子轮/天使轮创业项目、Hackathon 作品 |
| **原理** | Sequelize/Mongoose 直接 `toJSON()` 输出，路由层无转换逻辑 |
| **优势** | 开发速度最快、代码最少 |
| **劣势** | 暴露数据库结构、无法做权限级别过滤、改表即改 API 契约 |
| **适合** | 仅适合 MVP 验证阶段，不适合任何准备上线的项目 |

### 10.3 四种方案对比总结

| 维度 | α VO 统一层 | β Service 层 | γ 混合模式 | δ 直出 |
|------|:----------:|:----------:|:---------:|:-----:|
| **字段命名一致性** | ⭐⭐⭐⭐⭐ | ⭐⭐⭐ | ⭐⭐⭐⭐ | ⭐ |
| **安全审计难度** | 低（看 1 个文件） | 高（看 N 个 Service） | 低（看安全层） | 无审计能力 |
| **Ghost Field 风险** | 🔴 高（VO 层与 DB 耦合） | 🟢 无（Service 直接用 ORM） | 🟢 无（安全层不重命名） | 🟢 无 |
| **新增实体成本** | 中（写 VO 映射） | 低（Service 内自包含） | 低（Service 转换 + 安全层标注） | 最低 |
| **多端一致性** | ⭐⭐⭐⭐⭐ | ⭐⭐⭐ | ⭐⭐⭐⭐ | ⭐ |
| **重构代价** | 高（改 VO 可能改所有前端） | 中（改单个 Service） | 低（安全层与转换层独立） | N/A |
| **本项目适配度** | 🟡 中（需把 Service 已有转换逻辑迁入 VO） | 🟡 中（需去掉 DataSanitizer） | 🟢 高（与现有架构天然匹配） | ❌ 不适用 |

### 10.4 推荐方案：γ 混合模式（最适合本项目的理由）

**本项目已经事实上在使用 γ 模式的一半**——BackpackService 和 MarketListingQueryService 已经是"Service 层转换"。问题只是安全过滤层（DataSanitizer）职责不清晰，试图同时做"字段重命名"和"安全过滤"两件事，才导致了 ghost fields。

**γ 模式下的职责划分（基于本项目现有架构）**：

| 层 | 职责 | 本项目对应 | 修改方向 |
|----|------|-----------|---------|
| **Sequelize Model** | 定义 DB schema、关联、钩子 | `models/*.js`（96 个，不变） | 不动 |
| **Service 层** | 业务逻辑 + 领域级数据转换（meta 提取、关联 include、displayName 附加） | `BackpackService`、`MarketListingQueryService`、`AnnouncementService` 等 | 补齐缺失的 Service（用户信息、积分记录） |
| **DataSanitizer** | ①主键 `id` → `{entity}_id` ②敏感字段删除（概率、成本、管理员备注）③PII 脱敏（`maskUserName`）④full/public 级别切换 ⑤禁止资产过滤（`BUDGET_POINTS`） | `services/DataSanitizer.js` | 重写死代码方法，接收 Service 已转换的数据，**不再自己做字段重命名**（除主键外） |

**关键规则**：DataSanitizer **只做减法**（删字段、脱敏字段、改主键名），**不做加法或重命名**（不新增字段、不把 `nickname` 改成 `display_name`）。如果 Service 输出 `nickname`，DataSanitizer 要么原样透传，要么删除，但绝不改名。

**这解释了为什么 ghost fields 只出现在 DataSanitizer 而不出现在 BackpackService**——BackpackService 直接操作 Sequelize 模型，知道真实字段名；DataSanitizer 离数据库最远，靠注释和记忆来写字段名，所以出错。

### 10.5 γ 模式对决策 C/D/E 的影响

| 决策 | γ 模式下的结论 | 理由 |
|------|-------------|------|
| **C（死代码）** | **C1：重写并接入路由**，但重写方式与旧文档不同——DataSanitizer 只做安全过滤，不做字段重命名 | Service 层负责输出正确字段名，DataSanitizer 负责删除敏感字段 + 主键统一 |
| **D（背包列表）** | **D2：不接入 DataSanitizer**，同时去掉详情的 sanitizeInventory 调用 | BackpackService 已是转换层，且不输出敏感字段（owner_user_id、locks 未暴露）。详情和列表保持一致 |
| **E（重复文件）** | **E1：删除 `utils/DataSanitizer.js`** | 零争议，消除混淆 |

### 10.6 γ 模式下 C1 的具体变化（与之前方案的区别）

之前的 C1 方案让 DataSanitizer 既做安全过滤又做字段重命名（如 `display_name → nickname`）。γ 模式下的 C1 调整为：

| 方法 | 之前 C1 方案 | γ 模式 C1 方案 | 区别 |
|------|------------|-------------|------|
| `sanitizeUser()` | DataSanitizer 把 `display_name` 改为 `nickname` | auth 路由已直接输出 `nickname`。若需 DataSanitizer，它只删除 `role`/`permissions`/`admin_flags`，不改名 | DataSanitizer 不再做字段重命名 |
| `sanitizeMarketProducts()` | DataSanitizer 把 V3 字段全面改为 V4 | MarketListingQueryService 已输出 V4 字段。DataSanitizer 只删除 `seller_contact`、`locked_by_order_id` 等内部字段，脱敏 `seller.nickname` | 字段转换在 Service 层完成 |
| `sanitizePointsRecords()` | DataSanitizer 把 `type` 改为 `business_type` | 需新建 `AssetTransactionQueryService` 查询并输出正确字段。DataSanitizer 只做 `filterForbiddenAssets()` + 主键统一 | 需补建 Service |
| `sanitizeInventory()` | DataSanitizer 删除 ghost fields + 改字段名 | BackpackService 已输出正确字段。DataSanitizer 要么去掉（D2），要么只做主键统一 + 删除 `has_redemption_code`（如需对外隐藏） | 大幅简化 |

### 10.7 DataSanitizer 为什么会自己构造字段输出（历史根因分析）

在确定 γ 模式前，需要理解当前 DataSanitizer 为什么被设计成"手动构造新对象"而不是"从原始对象删除敏感字段"。这个历史根因解释了 ghost fields 的来源，也解释了 γ 模式为什么能从根本上解决问题。

#### 根因一：安全混淆思维（代码 L56-66）

原始设计者的逻辑：如果 API 返回 `lottery_prize_id`，攻击者就知道数据库有一张叫 `lottery_prizes` 的表。改成 `id` 就能"隐藏表结构"。

**要实现 `lottery_prize_id → id` 这个改名，就必须手动构造新对象**——不能从原始数据删字段来实现改名，只能写 `return { id: prize.lottery_prize_id, ... }` 逐个列出。

#### 根因二：白名单安全模型（代码 L60 "最小化原则"）

DataSanitizer 采用 **白名单模式**（只列出允许返回的字段）而不是 **黑名单模式**（从完整对象中删除敏感字段）：

```javascript
// 白名单模式（DataSanitizer 当前做法）—— 手动构造，逐个列出允许的字段
return {
  id: prize.lottery_prize_id,      // 明确列出
  prize_name: prize.prize_name,    // 明确列出
  // win_probability 没列出 → 自动排除
}

// 黑名单模式（γ 模式做法）—— 从 Service 输出中删除不允许的字段
const sanitized = { ...prize }     // 接收 Service 已构造的对象
delete sanitized.win_probability   // 明确删除
delete sanitized.cost_points       // 明确删除
return sanitized
```

白名单模式的安全优势：**如果数据库新增了一个敏感列（如 `internal_cost`），白名单自动不返回它**（因为没有列出）。黑名单模式下忘了加 `delete` 就泄露了。

**白名单模式本身没有错**——阿里的 VO 层、Stripe 的 API Resource 都是白名单。问题出在执行层面。

#### 根因三：JavaScript 无类型检查 —— ghost fields 的直接原因

白名单模式在 Java/TypeScript（有编译期检查）中是安全的。但在 JavaScript 中：

```javascript
// Java: 引用不存在的字段 → 编译报错
return new PrizeVO(prize.getLotteryPrizeId(), prize.getIcon()); // ← 编译失败，getIcon() 不存在

// JavaScript: 引用不存在的字段 → 静默返回 undefined，没有任何报错
return { id: item.item_instance_id, icon: item.icon }  // ← icon 不存在，返回 undefined
```

这就是 `sanitizeInventory()` 引用了 12 个不存在字段（`icon`、`value`、`source_type` 等）却从未被发现的原因——JavaScript 不报错，API 返回 `undefined`，前端不显示，没人注意到。

#### 根因四：V3→V4 重构时 DataSanitizer 没同步更新

V3→V4 重构时，数据库表结构和 Service 层都改了（`market_listings` 改为报价-出价架构），但 DataSanitizer 白名单中的字段名没有同步更新。**白名单写死了旧字段名，Service 输出了新字段名，中间没有任何机制能检测到不一致**。

#### 根因五：DataSanitizer 和 Service 层的时间线错位

1. **DataSanitizer 先写**——基于当时的 DB 列名直接写白名单
2. **BackpackService / MarketListingQueryService 后写**——这些 Service 从 Sequelize 模型提取和重组字段，输出格式与原始 DB 列名不同（如 BackpackService 从 `meta` JSON 提取 `name`，从 `created_at` 映射为 `acquired_at`）
3. **没有人回头更新 DataSanitizer** 让它匹配 Service 层的新输出格式

结果：DataSanitizer 白名单写的是 DB 列名或想象中的字段名，实际接收到的是 Service 层转换后的字段名，两边对不上。

#### 根因链条总结

```
安全混淆思维（主键 id 改名） → 必须手动构造新对象（白名单模式）
    ↓
白名单模式要求写死每个字段名
    ↓
JavaScript 无类型检查 → 引用不存在的字段不报错
    ↓
V3→V4 重构 + Service 层新增转换逻辑 → DataSanitizer 没同步更新
    ↓
= 12 个 ghost fields + 4 个完全不匹配的死代码方法
```

### 10.8 γ 模式下白名单与安全混淆的保留/放弃决策

#### 白名单安全模型：保留，但从 DataSanitizer 搬到 Service 层

| 层 | γ 模式前 | γ 模式后 |
|---|---------|---------|
| **Service 层** | 返回原始 Sequelize 模型或部分转换 | **白名单在这里**：手动构造 `{ name: meta.name, rarity: meta.rarity, ... }` |
| **DataSanitizer** | **白名单在这里**：手动构造 `{ id: xxx, name: xxx, ... }` | **黑名单**：`delete sanitized.win_probability` |

白名单的安全效果（"新增 DB 列不会自动泄露"）在 Service 层同样成立——BackpackService 手动列出返回字段，数据库新增 `internal_cost` 列不会自动出现在返回值里。

**搬到 Service 层更好的原因**：Service 直接操作 Sequelize 模型，字段名就在眼前，IDE 自动补全能帮忙，不可能写出 ghost field。DataSanitizer 离数据库最远，靠注释和记忆写字段名，所以出错。

#### 安全混淆思维：拆分为 5 项，2 项放弃、3 项保留

| 安全功能 | γ 模式 | 谁负责 | 理由 |
|---------|:------:|-------|------|
| 主键名混淆（`lottery_prize_id` → `id`） | **放弃** | — | 决策 A 已拍板。看到 `{ id: 1, prize_name: "优惠券" }` 和 `{ prize_id: 1, prize_name: "优惠券" }` 对攻击者没区别。真正安全靠 JWT + RBAC + 参数化查询 |
| 字段名混淆（`nickname` → `display_name`） | **放弃** | — | 改名不提供安全性，但是 ghost fields 的直接根因 |
| 敏感字段删除（概率、成本、权重、管理员备注） | **保留** | DataSanitizer | 核心安全功能。`win_probability`、`cost_points`、`admin_remark` 等暴露会泄露商业机密 |
| PII 脱敏（`maskUserName()`、`maskAdminName()`） | **保留** | DataSanitizer | 隐私保护。卖家昵称脱敏（`管理员用户` → `管*员用户`） |
| 禁止资产过滤（`BUDGET_POINTS`） | **保留** | DataSanitizer | 业务安全。内部资产类型绝对禁止暴露给小程序前端 |
| full/public 权限级别切换 | **保留** | DataSanitizer | 架构基础。管理员看全部，普通用户看脱敏版 |

**一句话**：γ 模式放弃了两个无效安全措施（改名），保留了四个有效安全措施（删除 + 脱敏 + 过滤 + 权限），把白名单构造权交给离数据库更近的 Service 层。

#### γ 模式下 DataSanitizer 的代码风格变化示例

以 `sanitizePrizes()` 为例：

```javascript
// ❌ 当前做法（白名单构造 + 改名）—— 容易产生 ghost fields
static sanitizePrizes(prizes, dataLevel) {
  if (dataLevel === 'full') return prizes
  return prizes.map(prize => ({
    id: prize.lottery_prize_id,           // 改名：lottery_prize_id → id
    prize_name: prize.prize_name,         // 手动列出
    prize_type: prize.prize_type,         // 手动列出
    prize_value: DecimalConverter.toNumber(prize.prize_value, 0), // 手动列出 + 转换
    rarity_code: prize.rarity_code,       // 手动列出
    // ... 还要列出 sort_order, reward_tier, status, image, material_asset_code 等
    // 如果 Service 层改了字段名，这里全部要同步改
  }))
}

// ✅ γ 模式（接收 Service 输出 + 黑名单删除 + 主键统一）
static sanitizePrizes(prizes, dataLevel) {
  if (dataLevel === 'full') return prizes
  return prizes.map(prize => {
    const sanitized = { ...prize }
    // 主键统一（决策 A）
    sanitized.prize_id = sanitized.lottery_prize_id
    delete sanitized.lottery_prize_id
    // 黑名单：只删除敏感字段
    delete sanitized.win_probability
    delete sanitized.stock_quantity
    delete sanitized.win_weight
    delete sanitized.cost_points
    delete sanitized.max_daily_wins
    delete sanitized.daily_win_count
    delete sanitized.total_win_count
    delete sanitized.is_fallback
    delete sanitized.reserved_for_vip
    delete sanitized.angle
    delete sanitized.color
    delete sanitized.is_activity
    return sanitized
  })
}
```

γ 模式的代码更短、更不容易出错——**即使 Service 层新增了一个字段，DataSanitizer 不需要任何改动就能透传它**。只有新增了敏感字段时才需要在黑名单中加一行 `delete`。

---

## 十〇（补充）、item_instances.meta JSON 实际结构（真实数据验证）

查询真实数据库 `item_instances` 表样本数据，`meta` JSON 列实际包含字段：

```json
// item_instance_id=6135, item_type=voucher, source=unknown
{"name":"测试优惠券","value":100,"description":"集成测试用优惠券"}

// item_instance_id=6137, item_type=voucher
{"name":"优惠券1","value":50}

// item_instance_id=6138, item_type=voucher
{"name":"优惠券2","value":100}
```

| meta 中的键 | BackpackService 是否提取 | DataSanitizer 当前是否引用 | 说明 |
|------------|:------------------------:|:------------------------:|------|
| `name` | ✅ 提取 | ✅ 引用 | 物品名称 |
| `value` | ❌ 未提取 | ✅ 引用（幽灵） | BackpackService 不输出此字段 |
| `description` | ✅ 提取 | ✅ 引用 | 物品描述 |
| `rarity` | ✅ 提取 | ❌ 未引用 | 应透传到 API 输出 |
| `expires_at` | ✅ 提取 | ✅ 引用 | 过期时间 |

**结论**：`meta.value` 在 BackpackService 中不被提取，DataSanitizer 引用 `item.value` 输出 `undefined`。而 `meta.rarity` 被 BackpackService 提取但 DataSanitizer 未输出。

---

## 十一（更新）、需要拍板的决策（基于行业 γ 模式分析）

### ✅ 决策 C：4 个死代码 sanitize 方法的处理策略（已拍板 — C1）

| 选项 | 内容 | 后端工时 | 行业参照 | 长期维护成本 |
|------|------|---------|---------|------------|
| **C1：γ 模式重写** | Service 层补齐转换逻辑（如 `AssetTransactionQueryService`），DataSanitizer 方法只做安全过滤 + 主键统一。所有公开 API 统一走 Service → DataSanitizer 管道 | 2-3 小时 | Steam/BUFF/闲鱼混合模式 | **最低**：新增实体有标准模式；安全审计只看 DataSanitizer |
| **C2：删除死代码** | 删除 4 个方法和相关测试，保持 market/auth 路由直接返回的现状 | 30 分钟 | 小公司 MVP 做法 | 中：3 种数据流模式并存，新开发者认知负担重 |
| **C3：标记 @deprecated** | 不改不删，标记为废弃 | 10 分钟 | 无行业参照 | **最高**：死代码 + 误导注释持续存在 |

**推荐 C1（γ 模式重写）**，理由基于行业实践：

1. **消除 3 种并存模式**：市场路由（模式 B 直出）、auth 路由（模式 C 手工 pick）、其余路由（模式 A 走 DataSanitizer）统一为 γ 模式，新开发者只需记住一种
2. **ghost field 根因消除**：γ 模式下 DataSanitizer 不再自己构造字段输出，只做减法（删除/脱敏），从根本上杜绝"引用不存在的字段"
3. **隐私风险补齐**：当前 `MarketListingQueryService` 直接返回 `seller.nickname`（未脱敏）和 `seller.avatar_url`（完整 URL），γ 模式下经 DataSanitizer 的 `maskUserName()` 脱敏
4. **`getPublicSource()` 修复后可复用**：48+ 种 `business_type` → 中文映射建好后，`attachDisplayNames()` 模式可推广到所有枚举字段

**与之前 C1 方案的区别**：之前让 DataSanitizer 做字段重命名（`display_name → nickname`），γ 模式下 Service 层直接输出 `nickname`，DataSanitizer 只删除 `role`/`permissions` 等敏感字段。**DataSanitizer 只做减法，不做改名**（主键 `id → entity_id` 除外）。

### ✅ 决策 D：背包脱敏一致性（已拍板 — D2）

| 选项 | 内容 | 行业参照 |
|------|------|---------|
| **D1：列表也接入 DataSanitizer** | `GET /api/v4/backpack` 也调用 `sanitizeInventory()` | α 模式（阿里，所有接口统一走 VO 层） |
| **D2：都不接入（推荐）** | 去掉详情接口的 `sanitizeInventory()` 调用，列表和详情都直接使用 BackpackService 输出 | β/γ 模式（BackpackService 已是转换层，不输出 `owner_user_id`/`locks`/`item_template_id` 等内部字段） |
| **D3：详情接入，列表不接入** | 维持现状 | 无行业参照（不一致） |

**推荐 D2**。BackpackService._getItems() 已经做了完整的领域转换：
- ✅ 从 `meta` JSON 仅提取面向用户的字段（name/description/rarity）
- ✅ 不输出 `owner_user_id`（隐私）、`locks`（内部状态）、`item_template_id`（内部关联）
- ✅ 附加了 `displayName` 中文映射
- ✅ 核销码用 `has_redemption_code` 布尔值替代完整码
这已经是 γ 模式中 Service 层该做的全部工作。额外再过一层 DataSanitizer 是重复劳动且引入 ghost field 风险。

### ✅ 决策 E：`utils/DataSanitizer.js` 处理方式（已拍板 — E1）

| 选项 | 内容 |
|------|------|
| **E1：删除（推荐）** | 删除 `utils/DataSanitizer.js`（65 行），唯一调用方 `tests/observability/log-format.test.js` 改为引用 `services/DataSanitizer.js` |
| **E2：保留** | 保留作为轻量级版本 |

**推荐 E1**。所有行业方案中都不存在两个同名转换层文件并存的做法。

---

## 十二、决策记录

### 决策 C：死代码方法处理策略 — ✅ 已拍板

**选定方案：C1 — γ 模式重写**

- Service 层补齐转换逻辑，DataSanitizer 只做安全过滤 + 主键统一
- 行业参照：Steam/BUFF/闲鱼混合模式
- `sanitizeUser()` γ 重写：接收 DB 真实字段名（nickname/avatar_url），只删除 role/permissions/admin_flags/mobile
- `sanitizeMarketProducts()` γ 重写：接收 MarketListingQueryService V4 格式输出，主键 listing_id（剥离 market_），seller_nickname 经 maskUserName 脱敏
- `sanitizePointsRecords()` / `sanitizeTransactionRecords()` γ 重写：共享 `_sanitizeAssetTransactions()`，主键 transaction_id（剥离 asset_），过滤 BUDGET_POINTS，添加 business_type_display 中文映射
- `getPublicSource()` 重写：覆盖实际 48+ 种 business_type，test_ 前缀统一显示"测试操作"
- **拍板时间**：2026-02-21
- **实施完成时间**：2026-02-21

### 决策 D：背包脱敏一致性 — ✅ 已拍板

**选定方案：D2 — 都不接入 DataSanitizer**

- 去掉详情接口（`GET /api/v4/backpack/items/:item_instance_id`）的 `sanitizeInventory()` 调用
- 列表和详情都直接使用 BackpackService 输出
- BackpackService._getItems() 已是完整的领域转换层（从 meta JSON 提取字段、不输出 owner_user_id/locks/item_template_id）
- `sanitizeInventory()` 方法保留但标记为未被路由调用，供未来需要时使用
- **拍板时间**：2026-02-21
- **实施完成时间**：2026-02-21

### 决策 E：`utils/DataSanitizer.js` 处理方式 — ✅ 已拍板

**选定方案：E1 — 删除**

- 删除 `utils/DataSanitizer.js`（65 行），功能已被 `services/DataSanitizer.js` 完全覆盖
- 唯一调用方 `tests/observability/log-format.test.js` 已改为引用 `services/DataSanitizer.js`
- 消除两个同名文件并存的混淆
- **拍板时间**：2026-02-21
- **实施完成时间**：2026-02-21

### 决策 A：DataSanitizer 全局主键命名 — ✅ 已拍板

**选定方案：A1 — 全部统一为 `{entity}_id`**

- 后端改 1 个文件 11 处主键 + 2 处图片子对象
- 小程序前端适配所有 `xxx.id` 引用
- 项目未上线，一次性成本，零兼容负担
- 与阿里/腾讯/美团/Steam/Stripe 行业标准完全对齐
- 管理后台零影响
- **拍板时间**：2026-02-21

### 决策 B：字段不匹配修复范围 — ✅ 已拍板

**选定方案：B1 — 与主键命名一并修复（策略 β）**

- 后端额外 2-3 小时，一次性修复 4 个方法的幽灵字段
- 小程序前端只需适配一次
- 彻底消除 DataSanitizer 与数据库的不一致
- 符合代码头部已声明的"唯一真相源原则"和"快速失败原则"
- **拍板时间**：2026-02-21

### 子决策 1：卖家昵称处理 — ✅ 已拍板

**选定方案：保留，通过 Sequelize `include seller` 关联获取 `nickname`，输出 `seller_nickname`（脱敏）**

- 行业依据：淘宝/闲鱼、Steam 市场、网易 BUFF 均在列表 API 中内联卖家信息
- 项目已有 `MarketListing.belongsTo(User, { as: 'seller' })` 关联和 `maskUserName()` 脱敏方法，零额外成本
- **拍板时间**：2026-02-21

### 子决策 2：交易记录来源描述 — ✅ 已拍板

**选定方案：同时输出 `business_type`（机器码）+ `business_type_display`（中文文本）**

- 行业依据：支付宝 `biz_type` + `biz_type_desc`、京东金融 `bizType` + `bizTypeName`、米哈游 `action_type` + `action_name`
- 复用已有 `getPublicSource()` 方法，将映射源从不存在的 `source` 改为实际的 `business_type`
- 优势：新增 business_type 时只改后端映射函数，所有前端自动获得中文，多端天然一致
- **拍板时间**：2026-02-21

### 子决策 3：重复方法合并策略 — ✅ 已拍板

**选定方案：保持两个方法名不变，内部共享同一份实现逻辑**

- `sanitizePointsRecords()` 和 `sanitizeTransactionRecords()` 保留各自方法名（调用方零改动）
- 内部提取公共的 `_sanitizeAssetTransactions()` 私有方法，两个公开方法委托调用
- 维护时只改一处逻辑
- **拍板时间**：2026-02-21

---

## 附录 A：DataSanitizer 完整方法清单（21 个，DB + 路由调用验证版）

| 方法 | 行号 | 对应 DB 表 | DB 主键 | 主键修改 | 字段匹配 | 路由调用 |
|------|------|-----------|--------|---------|---------|---------|
| `sanitizePrizes()` | 108 | `lottery_prizes` | `lottery_prize_id` | `id` → `prize_id` | ✅ 匹配 | ✅ `lottery/campaigns.js` L148 |
| `sanitizeInventory()` | 219 | `item_instances` | `item_instance_id` | `id` → `item_instance_id` | 🔴 严重不匹配 | ✅ `backpack/index.js` L171（仅详情） |
| `sanitizeUser()` | 294 | `users` | `user_id` | `id` → `user_id` | 🟡 2 处名称不匹配 | ❌ **死代码** |
| `sanitizePoints()` | 358 | — | — | ❌ 无主键 | — | 未查（聚合数据） |
| `sanitizeAdminStats()` | 399 | — | — | ❌ 无主键 | — | 未查（管理员） |
| `sanitizeUpload()` | 443 | — | — | ❌ 已是描述性 | — | 未查 |
| `sanitizeChatSessions()` | 516 | `customer_service_sessions` | `customer_service_session_id` | `id` → `session_id` | ✅ 基本匹配 | 需确认 |
| `sanitizeAnnouncements()` | 573 | `system_announcements` | `system_announcement_id` | ✅ 已完成 | ✅ 匹配 | ✅ `system/notifications.js` |
| `sanitizePointsRecords()` | 636 | `asset_transactions` | `asset_transaction_id` | `id` → `transaction_id` | 🔴 严重不匹配 | ❌ **死代码** |
| `sanitizeMarketProducts()` | 684 | `market_listings` | `market_listing_id` | `id` → `listing_id` | 🔴 完全不匹配（V3 遗留） | ❌ **死代码** |
| `sanitizeUserStatistics()` | 743 | — | — | ❌ 已是描述性 | — | 未查 |
| `sanitizeFeedbacks()` | 828 | `feedbacks` | `feedback_id` | `id` → `feedback_id` | ✅ 匹配 | ✅ `system/feedback.js` L68/139/240 |
| `sanitizeTransactionRecords()` | 892 | `asset_transactions` | `asset_transaction_id` | `id` → `transaction_id` | 🔴 严重不匹配 | ❌ **死代码** |
| `sanitizeSystemOverview()` | 931 | — | — | ❌ 无主键 | — | 未查（管理员） |
| `sanitizeAdminTodayStats()` | 969 | — | — | ❌ 无主键 | — | 未查（管理员） |
| `sanitizeWebSocketMessage()` | 1015 | — | — | ❌ 无主键 | — | 未查 |
| `sanitizeLogs()` | 1055 | — | — | ❌ 无主键 | — | ✅ `lottery/draw.js` L261 |
| `sanitizeExchangeMarketItems()` | 1314 | `exchange_items` | `exchange_item_id` | `id` → `exchange_item_id` | ✅ 匹配 | ✅ `shop/exchange/items.js` L146 |
| `sanitizeExchangeMarketItem()` | 1402 | — | — | ❌ 委托 | — | ✅ `shop/exchange/items.js` L209 |
| `sanitizeExchangeMarketOrders()` | 1426 | `exchange_records` | `exchange_record_id` | `id` → `exchange_record_id` | ✅ 匹配 | ✅ `shop/exchange/orders.js` L87 |
| `sanitizeExchangeMarketOrder()` | 1457 | — | — | ❌ 委托 | — | ✅ `shop/exchange/orders.js` L149 |

**统计**：
- **活跃方法（路由中被调用）**：8 个（含 2 个委托方法）
- **死代码方法（未被任何路由/服务调用）**：4 个（sanitizeUser、sanitizeMarketProducts、sanitizePointsRecords、sanitizeTransactionRecords）
- **需修改主键的活跃方法**：6 个（公告已完成，不计入）
- **需修复字段不匹配的活跃方法**：1 个（sanitizeInventory）
- **不需修改的方法**：10 个（无主键输出、已是描述性命名、或委托方法）

## 附录 B：数据库主键命名规律（96 张表验证）

全库 96 张表中，除以下 4 张使用非自增主键外，其余均使用 `{entity}_id` (INT/BIGINT autoIncrement) 模式：

| 表 | 主键 | 类型 | 说明 |
|----|------|------|------|
| `sequelizemeta` | `name` | VARCHAR | Sequelize 迁移元数据 |
| `administrative_regions` | `region_code` | VARCHAR | 行政区划代码 |
| `asset_group_defs` | `group_code` | VARCHAR | 资产分组定义 |
| `rarity_defs` | `rarity_code` | VARCHAR | 稀有度定义 |
| `category_defs` | `category_code` | VARCHAR | 分类定义 |

**结论**：`{entity}_id` 是本项目数据库层面的统一命名规范，DataSanitizer 输出层应与之对齐。
