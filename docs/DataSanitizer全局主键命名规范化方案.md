# DataSanitizer 全局主键命名规范化方案

> **项目**: 天工小程序（餐厅积分抽奖系统 V4.0）  
> **创建时间**: 2026-02-20  
> **来源**: 公告弹窗系统求证文档中标记的"长期议题"独立为专项方案  
> **核心问题**: 公开 API 的主键字段用泛化 `id` 还是描述性 `{entity}_id`  
> **状态**: 🟡 待拍板（1 项核心决策）

---

## 一、问题定义

### 1.1 现状

DataSanitizer 是后端统一数据脱敏服务，负责将 Sequelize 模型数据转换为公开 API 响应。当前 **11 个实体的公开 API 主键字段**存在两套命名模式：

| 模式 | 实体 | 数据库主键 | 公开 API 输出 | 管理 API 输出 | 一致性 |
|------|------|-----------|-------------|-------------|--------|
| `{entity}_id` | 弹窗 | `popup_banner_id` | `popup_banner_id` | `popup_banner_id` | ✅ 一致 |
| `{entity}_id` | 轮播图 | `carousel_item_id` | `carousel_item_id` | `carousel_item_id` | ✅ 一致 |
| `{entity}_id` | 公告（修复后） | `system_announcement_id` | `announcement_id` | `announcement_id` | ✅ 一致 |
| **泛化 `id`** | **奖品** | `lottery_prize_id` | **`id`** | `lottery_prize_id` | 🔴 两套 |
| **泛化 `id`** | **库存** | `item_instance_id` | **`id`** | `item_instance_id` | 🔴 两套 |
| **泛化 `id`** | **用户** | `user_id` | **`id`** | `user_id` | 🔴 两套 |
| **泛化 `id`** | **聊天会话** | `customer_service_session_id` | **`id`** | `customer_service_session_id` | 🔴 两套 |
| **泛化 `id`** | **积分记录** | `asset_transaction_id` | **`id`** | `asset_transaction_id` | 🔴 两套 |
| **泛化 `id`** | **交易市场** | `market_listing_id` | **`id`** | `market_listing_id` | 🔴 两套 |
| **泛化 `id`** | **反馈** | `feedback_id` | **`id`** | `feedback_id` | 🔴 两套 |
| **泛化 `id`** | **兑换商品** | `exchange_item_id` | **`id`** | `exchange_item_id` | 🔴 两套 |
| **泛化 `id`** | **兑换订单** | `exchange_record_id` | **`id`** | `exchange_record_id` | 🔴 两套 |
| **泛化 `id`** | **交易记录** | `asset_transaction_id` | **`id`** | `asset_transaction_id` | 🔴 两套 |

**当前状态：3 个实体一致，8 个实体不一致。**

### 1.2 DataSanitizer 中 `id` 映射的精确代码位置

以下是 `services/DataSanitizer.js` 中所有使用泛化 `id` 的位置（三次求证逐行确认）：

| 方法 | 行号 | 当前代码 | 数据库源字段 |
|------|------|---------|------------|
| `sanitizePrizes()` | 150 | `id: prize.lottery_prize_id` | `lottery_prize_id` |
| `sanitizeInventory()` | 227 | `id: item.item_instance_id` | `item_instance_id` |
| `sanitizeUser()` | 312 | `id: user.user_id` | `user_id` |
| `sanitizeChatSessions()` | 528 | `id: sessionData.customer_service_session_id` | `customer_service_session_id` |
| `sanitizeAnnouncements()` | 580 | `id: announcement.announcement_id` | `system_announcement_id`（已有修复计划） |
| `sanitizePointsRecords()` | 642 | `id: record.asset_transaction_id` | `asset_transaction_id` |
| `sanitizeMarketProducts()` | 691 | `id: product.market_listing_id` | `market_listing_id` |
| `sanitizeFeedbacks()` | 835 | `id: feedback.feedback_id` | `feedback_id` |
| `sanitizeTransactionRecords()` | 898 | `id: record.asset_transaction_id` | `asset_transaction_id` |
| `sanitizeExchangeMarketItems()` | 1352 | `id: item.exchange_item_id` | `exchange_item_id` |
| `sanitizeExchangeMarketOrders()` | 1431 | `id: order.exchange_record_id` | `exchange_record_id` |

此外，嵌套图片对象中也使用泛化 `id`：

| 位置 | 行号 | 当前代码 |
|------|------|---------|
| `sanitizePrizes()` 图片子对象 | 131, 139 | `id: safeImage.image_resource_id` |
| `sanitizeExchangeMarketItems()` 图片子对象 | 1333, 1343 | `id: safeImage.image_resource_id` |

### 1.3 泛化 `id` 的原始设计理由

DataSanitizer 文件头部注释（第 56-67 行）明确记录了设计意图：

> ⚠️ 设计决策（安全优先）：
> - 使用通用 'id' 而非具体字段名（如 user_id、inventory_id、prize_id）
> - 此设计有意偏离代码规范中的"全栈统一 snake_case"要求
> - 原因：防止用户通过抓包分析数据库结构和商业逻辑
> - 决策：安全性优先于代码规范一致性

---

## 二、行业方案对比

### 2.1 大厂做法：无一例外用 `{entity}_id`

| 公司 | API 示例 | 字段命名 | 嵌套场景处理 |
|------|---------|---------|-------------|
| **阿里（支付宝）** | 交易查询 | `trade_no`、`buyer_id`、`seller_id` | 订单里嵌套买家和卖家，靠前缀区分 |
| **阿里（淘宝）** | 商品+店铺 | `num_iid`（商品）、`shop_id`（店铺） | 商品详情里嵌套店铺信息，各自用描述性 ID |
| **腾讯（微信支付）** | 支付+退款 | `transaction_id`、`refund_id`、`out_trade_no` | 退款响应里同时包含交易 ID 和退款 ID |
| **腾讯（微信开放平台）** | 用户 | `openid`、`unionid` | 不同应用的同一用户用不同 ID 字段区分 |
| **美团** | 团购+门店 | `deal_id`、`poi_id`、`coupon_id` | 团购详情里嵌套门店，`deal_id` + `poi_id` 各归其主 |
| **字节（抖音）** | 视频+用户 | `item_id`、`open_id`、`comment_id` | 评论列表里同时有视频 ID 和评论 ID |
| **京东** | 商品+订单 | `sku_id`、`order_id`、`vender_id` | 订单详情里嵌套商品和商家 |

**大厂共识**：当 API 响应出现嵌套对象时（订单包含商品、商品包含店铺），泛化 `id` 无法区分归属。`{ id: 1, shop: { id: 2 } }` 远不如 `{ order_id: 1, shop: { shop_id: 2 } }` 清晰。

### 2.2 游戏公司做法：描述性 ID，格式各异但原则一致

| 公司 | 实体数量 | 字段命名 | 风格 |
|------|---------|---------|------|
| **Steam (Valve)** | 几十种（游戏/物品/资产/交易） | `appid`、`steamid`、`assetid`、`classid` | 小写拼接，极简 |
| **Riot Games** | 十几种（英雄/召唤师/比赛/排名） | `championId`、`summonerId`、`matchId` | camelCase |
| **米哈游** | 几十种（角色/武器/圣遗物/副本） | `character_id`、`weapon_id`、`artifact_id` | snake_case |
| **Roblox** | 几十种（资产/用户/体验/商店） | `assetId`、`userId`、`universeId` | camelCase |

**游戏行业的特殊性**：游戏系统实体极多（角色/武器/道具/副本/任务/成就/赛季/排行...），如果全部用 `id`，第一周就会混乱。米哈游原神有 200+ 种实体，每个都用 `{entity}_id`。

### 2.3 虚拟物品交易 / 二手平台做法

| 平台 | 业务场景 | 字段命名 | 嵌套复杂度 |
|------|---------|---------|-----------|
| **Steam 市场** | 物品交易 | `assetid`、`classid`、`instanceid` | 一个挂单里包含物品资产 ID + 物品类型 ID + 实例 ID，三层嵌套 |
| **闲鱼** | 二手交易 | `item_id`、`order_id`（继承阿里体系） | 订单里嵌套商品和买卖双方 |
| **转转** | 二手交易 | `product_id`、`order_id`（继承58体系） | 同上 |

**关键观察**：本项目有**交易市场模块**（`market_listings`），当交易详情里同时出现卖家、买家、商品、订单时，如果全部用 `id`，前端需要维护一张"哪个 `id` 属于哪个实体"的映射表。

### 2.4 活动策划 / 营销 SaaS 平台做法

| 平台 | 主键命名 | 特点 |
|------|---------|------|
| **Stripe（支付）** | `payment_intent_id`、`customer_id`、`subscription_id` | 字段名长达 20+ 字符，但完全自文档化 |
| **Voucherify（优惠券）** | `voucher_id`、`campaign_id`、`redemption_id` | 标准 `{entity}_id` |
| **Shopify（电商）** | `product_id`、`order_id`、`customer_id` | 标准 `{entity}_id` |
| **HubSpot（CRM）** | `contactId`、`dealId`、`companyId` | camelCase 但同样描述性 |

**Stripe 的极端例子**：`payment_method_configuration_id` 长达 38 个字符，但 Stripe 认为可读性比简洁性更重要。Stripe 是 API 设计的行业标杆。

### 2.5 小公司 / 初创项目做法

| 做法 | 典型阶段 | 初期感受 | 6 个月后的代价 |
|------|---------|---------|--------------|
| 全部用 `id` | MVP 阶段 | "真简洁，开发快" | 嵌套响应分不清、前端维护映射表、新人看代码看不懂 |
| 后端用 `xxx_id`，API 层统一转 `id` | 自以为"安全" | "抓包看不出表结构" | 管理 API 和公开 API 字段名不同，前端两套逻辑 |
| 全程 `{entity}_id` | 规范化阶段 | "多打几个字符" | **零额外成本**，代码自文档化 |

### 2.6 行业结论

**零例外**：从支付宝到 Steam，从米哈游到 Stripe，没有任何一家公司在公开 API 中使用泛化 `id` 来"保护安全"。所有公司都使用描述性 `{entity}_id`。

---

## 三、"安全性"论点的行业评估

DataSanitizer 当前用 `id` 的原始理由是"防止抓包分析数据库结构"。逐条评估：

| 论点 | 行业实际 |
|------|---------|
| "用 `id` 防止暴露表结构" | 支付宝、微信支付、Steam 全部用描述性字段名，从未因此产生安全问题。真正的安全靠 JWT 鉴权 + 权限控制 + 速率限制，本项目这三项都已具备 |
| "攻击者知道字段名就能攻击" | 知道字段叫 `prize_id` vs `id` 不会帮助攻击者绕过任何安全措施。SQL 注入防御靠 Sequelize 参数化查询（已有），不是字段名混淆 |
| "大厂也这么做" | 没有任何一家大厂在公开 API 中用泛化 `id` 来"保护安全"。这是安全领域所说的 security through obscurity（通过模糊性实现安全），被公认为无效策略 |
| "小程序端被反编译后泄露表结构" | 微信小程序代码对用户可见（wxapkg 可解包），但支付宝小程序、微信支付 API 从未因此改用泛化 `id`。因为 API 字段名暴露不构成安全威胁 |

**安全结论**：泛化 `id` 不提供任何实质安全保护。本项目已有的安全措施（JWT + RBAC + Sequelize ORM + 速率限制 + CORS 白名单）足以防护所有已知攻击向量。

---

## 四、本项目嵌套场景的实际痛点

### 4.1 当前已存在的嵌套场景

以下是后端 API 中已经存在嵌套响应的场景，使用泛化 `id` 会导致歧义：

| 场景 | API | 嵌套结构 | 泛化 `id` 的问题 |
|------|-----|---------|-----------------|
| 交易市场商品详情 | `GET /api/v4/market/listings/:id` | 商品 + 卖家信息 | `{ id: 1, seller: { id: 2 } }` — 哪个 `id` 是商品？哪个是卖家？ |
| 兑换订单详情 | `GET /api/v4/exchange/orders/:id` | 订单 + 商品快照 | `{ id: 1, item: { id: 3 } }` — 哪个是订单 ID？哪个是商品 ID？ |
| 公告列表（含创建者） | `GET /api/v4/system/announcements` | 公告 + 创建者 | `{ id: 1, creator: { user_id: 31 } }` — 公告用 `id`，创建者用 `user_id`，风格不一致 |
| 抽奖结果 | `GET /api/v4/lottery/draw` | 抽奖记录 + 奖品 | `{ id: 1, prize: { id: 5 } }` — 前端需要记住"外层是抽奖 ID，内层是奖品 ID" |
| 反馈详情（含回复） | `GET /api/v4/feedback/:id` | 反馈 + 管理员回复 | `{ id: 1, reply: { admin_name: '客服A' } }` — `id` 是反馈 ID，但字段名不说明 |

### 4.2 描述性 ID 后的清晰度对比

同样的场景用 `{entity}_id`：

| 场景 | 用 `{entity}_id` 后的结构 | 清晰度 |
|------|--------------------------|--------|
| 交易市场 | `{ market_listing_id: 1, seller: { user_id: 2 } }` | ✅ 一目了然 |
| 兑换订单 | `{ exchange_record_id: 1, item: { exchange_item_id: 3 } }` | ✅ 一目了然 |
| 公告列表 | `{ announcement_id: 1, creator: { user_id: 31 } }` | ✅ 风格一致 |
| 抽奖结果 | `{ lottery_record_id: 1, prize: { prize_id: 5 } }` | ✅ 无歧义 |
| 反馈详情 | `{ feedback_id: 1, reply: { ... } }` | ✅ 自文档化 |

---

## 五、推荐方案

### 5.1 方案：全部统一为 `{entity}_id`

**API 输出字段名规则**：

- **默认规则**：使用数据库列名原样输出
- **唯一例外**：数据库列名含表级命名空间前缀（如 `system_`）时，剥离该前缀。理由：前缀是为了 MySQL 表名避免冲突，不应泄漏到 API 层（阿里巴巴内部规范明确区分"存储模型"和"传输模型"）

### 5.2 完整映射表（需拍板）

| DataSanitizer 方法 | 行号 | 数据库列名 | 当前 API 输出 | 修改后 API 输出 | 命名理由 |
|-------------------|------|-----------|-------------|----------------|---------|
| `sanitizePrizes()` | 150 | `lottery_prize_id` | `id` | `prize_id` | 剥离 `lottery_` 模块前缀，`prize_id` 在 API 上下文中足够清晰 |
| `sanitizeInventory()` | 227 | `item_instance_id` | `id` | `item_instance_id` | 原样输出，无前缀可剥离 |
| `sanitizeUser()` | 312 | `user_id` | `id` | `user_id` | 原样输出，无前缀可剥离 |
| `sanitizeChatSessions()` | 528 | `customer_service_session_id` | `id` | `session_id` | 剥离 `customer_service_` 模块前缀 |
| `sanitizeAnnouncements()` | 580 | `system_announcement_id` | `id` | `announcement_id` | 已在公告弹窗文档决策 5 中拍板 |
| `sanitizePointsRecords()` | 642 | `asset_transaction_id` | `id` | `transaction_id` | 剥离 `asset_` 模块前缀 |
| `sanitizeMarketProducts()` | 691 | `market_listing_id` | `id` | `listing_id` | 剥离 `market_` 模块前缀 |
| `sanitizeFeedbacks()` | 835 | `feedback_id` | `id` | `feedback_id` | 原样输出，无前缀可剥离 |
| `sanitizeTransactionRecords()` | 898 | `asset_transaction_id` | `id` | `transaction_id` | 同 `sanitizePointsRecords` |
| `sanitizeExchangeMarketItems()` | 1352 | `exchange_item_id` | `id` | `exchange_item_id` | 原样输出，`exchange_` 是实体身份而非模块前缀 |
| `sanitizeExchangeMarketOrders()` | 1431 | `exchange_record_id` | `id` | `exchange_record_id` | 原样输出 |

嵌套图片对象：

| 位置 | 行号 | 当前 | 修改后 | 理由 |
|------|------|------|--------|------|
| `sanitizePrizes()` 图片 | 131, 139 | `id` | `image_resource_id` | 原样输出 |
| `sanitizeExchangeMarketItems()` 图片 | 1333, 1343 | `id` | `image_resource_id` | 原样输出 |

### 5.3 推荐理由汇总

| 维度 | 分析 |
|------|------|
| **行业对标** | 阿里/腾讯/美团/Steam/Stripe/米哈游全部使用描述性 ID，零例外 |
| **项目现状** | 已有 3 个实体（弹窗/轮播图/公告）用 `{entity}_id` 且运作正常，证明模式可行 |
| **未上线优势** | 一次性统一，不产生任何兼容负担。上线后再改代价翻 10 倍 |
| **指导原则对齐** | "直接修改前端代码使用后端的字段名，而不是做复杂的映射" — 这正是 `{entity}_id` 的做法 |
| **嵌套场景** | 交易市场订单详情里同时有 `listing_id`、`seller_id`、`buyer_id`，用泛化 `id` 根本分不清 |
| **安全性** | 无损失。已有 JWT + RBAC + Sequelize ORM + 速率限制，不依赖字段名混淆 |
| **迁移成本** | 后端：11 个方法各改 1 行（约 30 分钟）。小程序前端：适配对应字段名（工作量取决于小程序代码规模） |

---

## 六、实施方案

### 6.1 后端修改（约 30 分钟）

**修改文件**：`services/DataSanitizer.js`（1 个文件，11 处修改 + 2 处图片子对象修改）

每处修改均为将 `id: xxx.yyy_id` 改为 `yyy_id: xxx.yyy_id`（或剥离前缀后的名称），单行替换。

**同步修改**：DataSanitizer 文件头部注释（第 56-67 行）的设计决策说明，删除"安全优先使用通用 id"的过时描述，改为"使用描述性 `{entity}_id`，与行业标准对齐"。

### 6.2 Web 管理后台前端修改

管理后台使用 `dataLevel='full'`（跳过 DataSanitizer），直接获取 Sequelize `toJSON()` 原始字段。因此管理后台前端**不受此次修改影响**，无需改动。

### 6.3 微信小程序前端修改

小程序使用公开 API（经 DataSanitizer 脱敏），因此小程序前端代码中所有引用 `response.id` 的地方需要改为对应的 `response.{entity}_id`。

**具体影响范围**（需小程序前端配合排查）：

| 功能模块 | 当前前端引用 | 修改后引用 | 排查说明 |
|---------|------------|-----------|---------|
| 抽奖页面 | `prize.id` | `prize.prize_id` | 奖品列表渲染、中奖结果展示 |
| 库存页面 | `item.id` | `item.item_instance_id` | 库存列表、使用/转让操作 |
| 用户信息 | `user.id` | `user.user_id` | 用户资料展示、请求参数 |
| 积分记录 | `record.id` | `record.transaction_id` | 积分流水列表 |
| 交易市场 | `listing.id` | `listing.listing_id` | 商品列表、购买操作 |
| 反馈系统 | `feedback.id` | `feedback.feedback_id` | 反馈列表、详情 |
| 兑换商城 | `item.id` | `item.exchange_item_id` | 兑换商品列表、下单 |
| 兑换订单 | `order.id` | `order.exchange_record_id` | 订单列表、详情 |

### 6.4 实施顺序

| 步骤 | 内容 | 归属 | 阻塞关系 |
|------|------|------|---------|
| 1 | 修改 DataSanitizer 11 个方法的主键输出字段名 | 后端 | 阻塞小程序前端适配 |
| 2 | 更新 DataSanitizer 文件头部注释 | 后端 | 无 |
| 3 | 小程序前端排查所有 `xxx.id` 引用并适配 | 小程序前端 | 依赖步骤 1 |
| 4 | 联调验证 | 后端 + 小程序前端 | 依赖步骤 1+3 |

### 6.5 与公告弹窗修复的关系

公告弹窗文档中的步骤 1（修复 `sanitizeAnnouncements` 的 `announcement_id`）是本方案在公告实体上的子集。如果本方案拍板执行，步骤 1 自然包含在内，无需重复。

---

## 七、风险评估

| 风险 | 概率 | 影响 | 缓解措施 |
|------|------|------|---------|
| 小程序前端遗漏某处 `xxx.id` 引用 | 中 | 单个功能字段显示 undefined | 小程序端全局搜索 `.id` 引用，逐一排查 |
| 后端修改遗漏某个 sanitize 方法 | 低 | 单个实体仍用 `id` | 本文档已列出完整 11 个方法 + 精确行号 |
| 第三方系统（如 webhook）依赖 `id` 字段 | 极低 | 第三方接收数据格式变更 | 项目未上线，无第三方集成 |

---

## 八、需拍板决策

### 决策 8：DataSanitizer 全局主键命名

**选项 A（推荐）：全部统一为 `{entity}_id`**

- 后端改 1 个文件 11 处（约 30 分钟）
- 小程序前端适配所有 `xxx.id` 引用
- 项目未上线，一次性成本，零兼容负担
- 与阿里/腾讯/美团/Steam/Stripe 完全对齐

**选项 B：保持现状不动**

- 零成本
- 3 个实体用 `{entity}_id`，8 个实体用 `id`，两套模式永久并存
- 上线后如果再改，小程序端每个页面都要改，成本翻 10 倍
- 嵌套响应场景持续存在歧义

**选项 C：仅修复公告（已在公告弹窗文档中），其余保持 `id`**

- 公告修复独立进行（步骤 1-6）
- 其余 8 个实体维持 `id`
- 两套模式继续并存，但公告+弹窗+轮播图 3 个实体形成局部一致性
- 等上线后根据实际痛点再决定是否全局统一

---

## 附录 A：DataSanitizer 完整方法清单（21 个）

| 方法 | 行号 | 用途 | 主键处理方式 | 是否涉及本次修改 |
|------|------|------|-------------|----------------|
| `sanitizePrizes()` | 108 | 抽奖奖品脱敏 | `id` → `prize_id` | ✅ 需修改 |
| `sanitizeInventory()` | 219 | 库存数据脱敏 | `id` → `item_instance_id` | ✅ 需修改 |
| `sanitizeUser()` | 294 | 用户数据脱敏 | `id` → `user_id` | ✅ 需修改 |
| `sanitizePoints()` | 358 | 积分数据脱敏 | 无主键输出 | ❌ |
| `sanitizeAdminStats()` | 399 | 管理统计脱敏 | 无主键输出 | ❌ |
| `sanitizeUpload()` | 443 | 上传数据脱敏 | `upload_id`（已是描述性） | ❌ |
| `sanitizeChatSessions()` | 516 | 聊天会话脱敏 | `id` → `session_id` | ✅ 需修改 |
| `sanitizeAnnouncements()` | 573 | 系统公告脱敏 | `id` → `announcement_id` | ✅ 已在公告文档中 |
| `sanitizePointsRecords()` | 636 | 积分记录脱敏 | `id` → `transaction_id` | ✅ 需修改 |
| `sanitizeMarketProducts()` | 684 | 交易市场脱敏 | `id` → `listing_id` | ✅ 需修改 |
| `sanitizeUserStatistics()` | 743 | 用户统计脱敏 | `user_id`（已是描述性） | ❌ |
| `sanitizeFeedbacks()` | 828 | 反馈数据脱敏 | `id` → `feedback_id` | ✅ 需修改 |
| `sanitizeTransactionRecords()` | 892 | 交易记录脱敏 | `id` → `transaction_id` | ✅ 需修改 |
| `sanitizeSystemOverview()` | 931 | 系统概览脱敏 | 无主键输出 | ❌ |
| `sanitizeAdminTodayStats()` | 969 | 今日统计脱敏 | 无主键输出 | ❌ |
| `sanitizeWebSocketMessage()` | 1015 | WebSocket 消息脱敏 | 无主键输出 | ❌ |
| `sanitizeLogs()` | 1055 | 日志脱敏 | 无主键输出 | ❌ |
| `sanitizeExchangeMarketItems()` | 1314 | 兑换商品脱敏 | `id` → `exchange_item_id` | ✅ 需修改 |
| `sanitizeExchangeMarketItem()` | 1402 | 单个兑换商品脱敏 | 委托上方方法 | ❌ |
| `sanitizeExchangeMarketOrders()` | 1426 | 兑换订单脱敏 | `id` → `exchange_record_id` | ✅ 需修改 |
| `sanitizeExchangeMarketOrder()` | 1457 | 单个兑换订单脱敏 | 委托上方方法 | ❌ |

**需修改的方法：11 个**（含公告弹窗文档已覆盖的 1 个）。
**不需修改的方法：10 个**（无主键输出或已是描述性命名）。
